import { queryMaster, getSqlPool } from "@/lib/sqlserver";

/**
 * BUKU BESAR per akun per bulan (dari Omega).
 *
 * Jalur CEPAT (dipakai dulu): UNION langsung dari tabel detail berindeks
 *   DetailBank (+ MasterBank), DetailJurnal (+ MasterJurnal),
 *   DetailPiutangKredit/Lain (+ MasterPiutang), DetailHutangKredit/Lain (+ MasterHutang),
 *   DetailKasKecil (+ MasterKasKecil). Masing-masing query berindeks
 *   (NoPerkiraan / key dokumen), tipikal < 1 detik.
 *
 * Jalur validasi: total Masuk/Keluar jalur cepat HARUS sama dengan
 *   PeriodeAkuntansi (Debet/Kredit) untuk periode yang sama.
 *   Kalau cocok -> pakai jalur cepat. Kalau tidak -> fallback ke
 *   dbo.AktivitasAkuntansi (laporan 6030, lambat ~20-30 detik tapi exact).
 *
 * TVF dikoreksi: mengembalikan SEMUA kaki jurnal dokumen yang melibatkan akun
 * (termasuk akun lawan), BUKAN hanya Perkiraan == akun. Dulu kode hanya
 * mengambil Perkiraan == akun sehingga akun seperti PPH 1190201 tampil kosong
 * (transaksi 1 barisnya ber-Perkiraan lawan 1110201 BCA).
 */

export type BukuBesarRow = {
  urutan: number;
  tgl: string;
  ruleNo: string;
  module: string;
  perkiraan: string;
  kodeNota: string;
  keterangan: string;
  masuk: number;
  keluar: number;
  saldo: number;
};

export type BukuBesarDetail = {
  rows: BukuBesarRow[];
  totalMasuk: number;
  totalKeluar: number;
  totalRows: number;
  ownCount: number;
  sumber: "cepat" | "tvf";
};

const EPS = 1; // toleransi selisih 1 rupiah

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toExclusiveEnd(to: string) {
  const d = new Date(`${to}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function periodList(from: string, to: string): number[] {
  const start = Number(from.replace(/-/g, "").slice(0, 6));
  const end = Number(to.replace(/-/g, "").slice(0, 6));
  const out: number[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 24) {
    out.push(cur);
    const y = Math.floor(cur / 100);
    const m = cur % 100;
    cur = m === 12 ? (y + 1) * 100 + 1 : y * 100 + (m + 1);
  }
  return out;
}

export async function getDaftarAkunBukuBesar(cabang = "00001/01") {
  return queryMaster(
    `SELECT mp.Nomor AS Nomor, mp.Keterangan AS Keterangan
     FROM dbo.MasterPerkiraan mp
     WHERE mp.Nomor LIKE @branch + '%' AND mp.IsDetail = 1
     ORDER BY mp.Nomor`,
    { branch: `${cabang}/` }
  );
}

export async function getInfoAkun(nomor: string) {
  const rows = await queryMaster(
    `SELECT TOP 1 mp.Nomor, mp.Keterangan, mp.Sifat
     FROM dbo.MasterPerkiraan mp
     WHERE mp.Nomor = @nomor`,
    { nomor }
  );
  return rows[0] as any;
}

export async function getSaldoAwalAkun(nomor: string, periode: number) {
  const rows = await queryMaster(
    `SELECT CAST(pa.SaldoAwal AS MONEY) AS SaldoAwal,
            CAST(pa.Debet AS MONEY) AS Debet,
            CAST(pa.Kredit AS MONEY) AS Kredit,
            CAST(pa.SaldoAkhir AS MONEY) AS SaldoAkhir
     FROM dbo.PeriodeAkuntansi pa
     WHERE pa.NoPerkiraan = @nomor AND pa.Periode = @periode`,
    { nomor, periode }
  );
  return rows[0] as any;
}

export async function getSaldoRangeAkun(nomor: string, from: string, to: string) {
  const proses = periodList(from, to);
  if (!proses.length) return null;
  const rows = await queryMaster(
    `SELECT pa.Periode,
            CAST(pa.SaldoAwal AS MONEY) AS SaldoAwal,
            CAST(pa.Debet AS MONEY) AS Debet,
            CAST(pa.Kredit AS MONEY) AS Kredit,
            CAST(pa.SaldoAkhir AS MONEY) AS SaldoAkhir
     FROM dbo.PeriodeAkuntansi pa
     WHERE pa.NoPerkiraan = @nomor AND pa.Periode IN (${proses.join(",")})
     ORDER BY pa.Periode`,
    { nomor }
  );
  if (!rows.length) {
    return { SaldoAwal: 0, Debet: 0, Kredit: 0, SaldoAkhir: 0, nBulan: 0 };
  }
  let debet = 0;
  let kredit = 0;
  for (const r of rows as any[]) {
    debet += Number(r.Debet || 0);
    kredit += Number(r.Kredit || 0);
  }
  const first = (rows as any[])[0];
  const last = (rows as any[])[rows.length - 1];
  return {
    SaldoAwal: Number(first.SaldoAwal || 0),
    Debet: debet,
    Kredit: kredit,
    SaldoAkhir: Number(last.SaldoAkhir || 0),
    nBulan: rows.length,
  };
}

/**
 * Jalur cepat: UNION dari tabel detail berindeks.
 * Return null kalau query gagal (dipanggil ulang dengan TVF di pemanggil).
 */
export async function getBukuBesarCepat(
  nomor: string,
  from: string,
  to: string,
  isDebit: boolean,
  saldoAwal: number
): Promise<{ rows: BukuBesarRow[]; totalMasuk: number; totalKeluar: number } | null> {
  const toExcl = toExclusiveEnd(to);
  // Single SQL dengan beberapa UNION ALL; kompatibel SQL Server 2005.
  const sqlText = `
SELECT Tgl, KodeNota, Keterangan, Amt, Module, Perkiraan, Side FROM (
  SELECT m.Tgl AS Tgl, d.NoVoucher AS KodeNota, d.Keterangan AS Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)) AS Amt, 'TNotaBankFm' AS Module, d.NoPerkiraan AS Perkiraan, 'D' AS Side
  FROM dbo.DetailBank d INNER JOIN dbo.MasterBank m ON m.NoVoucher = d.NoVoucher
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, d.NoVoucher, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'TNotaBankFm', d.NoPerkiraan, 'K'
  FROM dbo.DetailBank d INNER JOIN dbo.MasterBank m ON m.NoVoucher = d.NoVoucher
  WHERE m.NoBank = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, d.NoJurnal, d.Keterangan, CAST(ABS(d.Nilai) AS DECIMAL(18,2)), 'Jurnal', d.NoPerkiraan, d.Status
  FROM dbo.DetailJurnal d INNER JOIN dbo.MasterJurnal m ON m.NoJurnal = d.NoJurnal
  WHERE m.Tgl >= @from AND m.Tgl < @toExcl
    AND d.NoJurnal IN (
      SELECT d2.NoJurnal FROM dbo.DetailJurnal d2 INNER JOIN dbo.MasterJurnal m2 ON m2.NoJurnal = d2.NoJurnal
      WHERE d2.NoPerkiraan = @nomor AND m2.Tgl >= @from AND m2.Tgl < @toExcl)
  UNION ALL
  SELECT m.Tgl, d.KodeNota, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'TNotaPiutangFm', d.NoPerkiraan, 'D'
  FROM dbo.DetailPiutangKredit d INNER JOIN dbo.MasterPiutang m ON m.KodeNota = d.KodeNota
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, d.KodeNota, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'TNotaPiutangFm', d.NoPerkiraan, 'D'
  FROM dbo.DetailPiutangLain d INNER JOIN dbo.MasterPiutang m ON m.KodeNota = d.KodeNota
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, p.KodeNota, m.Keterangan, CAST(ABS(p.Jml) AS DECIMAL(18,2)), 'TNotaPiutangFm', '' , 'K'
  FROM dbo.DetailPiutang p INNER JOIN dbo.MasterPiutang m ON m.KodeNota = p.KodeNota
  WHERE m.Tgl >= @from AND m.Tgl < @toExcl
    AND p.KodeNota IN (
      SELECT d.KodeNota FROM dbo.DetailPiutangKredit d WHERE d.NoPerkiraan = @nomor
      UNION
      SELECT d.KodeNota FROM dbo.DetailPiutangLain d WHERE d.NoPerkiraan = @nomor)
  UNION ALL
  SELECT m.Tgl, d.KodeNota, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'TNotaHutangFm', d.NoPerkiraan, 'D'
  FROM dbo.DetailHutangKredit d INNER JOIN dbo.MasterHutang m ON m.KodeNota = d.KodeNota
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, d.KodeNota, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'TNotaHutangFm', d.NoPerkiraan, 'D'
  FROM dbo.DetailHutangLain d INNER JOIN dbo.MasterHutang m ON m.KodeNota = d.KodeNota
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, p.KodeNota, m.Keterangan, CAST(ABS(p.Jml) AS DECIMAL(18,2)), 'TNotaHutangFm', '', 'K'
  FROM dbo.DetailHutang p INNER JOIN dbo.MasterHutang m ON m.KodeNota = p.KodeNota
  WHERE m.Tgl >= @from AND m.Tgl < @toExcl
    AND p.KodeNota IN (
      SELECT d.KodeNota FROM dbo.DetailHutangKredit d WHERE d.NoPerkiraan = @nomor
      UNION
      SELECT d.KodeNota FROM dbo.DetailHutangLain d WHERE d.NoPerkiraan = @nomor)
  UNION ALL
  SELECT m.Tgl, d.NoKasKecil, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'KasKecil', d.NoPerkiraan, 'D'
  FROM dbo.DetailKasKecil d INNER JOIN dbo.MasterKasKecil m ON m.NoKasKecil = d.NoKasKecil
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
  UNION ALL
  SELECT m.Tgl, d.NoVoucher, d.Keterangan, CAST(ABS(d.Jml) AS DECIMAL(18,2)), 'Kas', d.NoPerkiraan, 'D'
  FROM dbo.DetailKas d INNER JOIN dbo.MasterKas m ON m.NoVoucher = d.NoVoucher
  WHERE d.NoPerkiraan = @nomor AND m.Tgl >= @from AND m.Tgl < @toExcl
) x
ORDER BY Tgl, KodeNota, Perkiraan`;
  let raw: any[];
  try {
    raw = await queryMaster(sqlText, { nomor, from, toExcl });
  } catch {
    return null;
  }
  const rows: BukuBesarRow[] = [];
  let saldoAtual = saldoAwal;
  // Masuk = mutasi yang menambah saldo normal (Debit utk akun Debit, Kredit utk akun Kredit)
  const mapMasuk = (side: string) =>
    (isDebit && side === "D") || (!isDebit && side === "K") ? true : false;
  let totalMasuk = 0;
  let totalKeluar = 0;
  let urutan = 0;
  for (const r of raw as any[]) {
    const amt = Number(r.Amt || 0);
    const side = String(r.Side || "D").toUpperCase();
    const isMasuk = mapMasuk(side);
    const masuk = isMasuk ? amt : 0;
    const keluar = isMasuk ? 0 : amt;
    totalMasuk += masuk;
    totalKeluar += keluar;
    saldoAtual += masuk - keluar;
    urutan += 1;
    rows.push({
      urutan,
      tgl: r.Tgl ? new Date(r.Tgl).toISOString().slice(0, 10) : "",
      ruleNo: "",
      module: String(r.Module || ""),
      perkiraan: String(r.Perkiraan || ""),
      kodeNota: String(r.KodeNota || ""),
      keterangan: String(r.Keterangan || ""),
      masuk,
      keluar,
      saldo: Math.round(saldoAtual * 100) / 100,
    });
  }
  return { rows, totalMasuk: Math.round(totalMasuk * 100) / 100, totalKeluar: Math.round(totalKeluar * 100) / 100 };
}

/**
 * Totental PeriodeAkuntansi (PA) untuk akun + rentang tanggal,
 * dalam penamaan Masuk/Keluar (penambah saldo normal).
 */
function expectedFromPA(range: any, isDebit: boolean) {
  const d = Number(range?.Debet || 0);
  const k = Number(range?.Kredit || 0);
  return isDebit ? { masuk: d, keluar: k } : { masuk: k, keluar: d };
}

export async function getBukuBesarDetail(nomor: string, from: string, to: string) {
  // ---- Jalur cepat + validasi PA ----
  const [info, range] = await Promise.all([
    getInfoAkun(nomor),
    getSaldoRangeAkun(nomor, from, to),
  ]);
  const isDebit = info ? Boolean(info.Sifat) : true;
  const saldoAwalRaw = Number(range?.SaldoAwal ?? 0);
  const saldoAwalNormal = isDebit ? saldoAwalRaw : -saldoAwalRaw;
  const exp = expectedFromPA(range, isDebit);

  const fast = await getBukuBesarCepat(nomor, from, to, isDebit, saldoAwalNormal);
  if (fast) {
    const ok =
      Math.abs(fast.totalMasuk - exp.masuk) < EPS && Math.abs(fast.totalKeluar - exp.keluar) < EPS;
    if (ok) {
      return {
        rows: fast.rows,
        totalMasuk: fast.totalMasuk,
        totalKeluar: fast.totalKeluar,
        totalRows: fast.rows.length,
        ownCount: fast.rows.length,
        sumber: "cepat" as const,
        saldoAwal: saldoAwalRaw,
        saldoAkhirPa: Number(range?.SaldoAkhir ?? 0),
        debetPa: Number(range?.Debet ?? 0),
        kreditPa: Number(range?.Kredit ?? 0),
      };
    }
  }

  // ---- Fallback TVF (lambat tapi exact) ----
  const pool = await getSqlPool();
  const safeAcct = String(nomor).replace(/[^0-9/]/g, "");
  const safeFrom = String(from).slice(0, 10);
  const safeTo = String(to).slice(0, 10);
  const res = await pool.request().query(
    `SELECT Urutan, Tgl, RuleNo, Module, Perkiraan, KodeNota, Keterangan, Masuk, Keluar, Saldo
     FROM dbo.AktivitasAkuntansi('${safeAcct}', '${safeFrom}', '${safeTo}')
     ORDER BY Urutan, Tgl`
  );
  const all = res.recordset as any[];
  // Buang baris pseudo "SALDO AWAL" (UI menggambar baris Saldo Awal sendiri dari PA)
  const data = all.filter((r) => String(r.KodeNota || "") !== "SALDO AWAL");
  const rows: BukuBesarRow[] = data.map((r, i) => ({
    urutan: i + 1,
    tgl: r.Tgl ? new Date(r.Tgl).toISOString().slice(0, 10) : "",
    ruleNo: String(r.RuleNo || ""),
    module: String(r.Module || ""),
    perkiraan: String(r.Perkiraan || ""),
    kodeNota: String(r.KodeNota || ""),
    keterangan: String(r.Keterangan || ""),
    masuk: Number(r.Masuk || 0),
    keluar: Number(r.Keluar || 0),
    saldo: Number(r.Saldo || 0),
  }));
  const totalMasuk = Math.round(rows.reduce((s, r) => s + r.masuk, 0) * 100) / 100;
  const totalKeluar = Math.round(rows.reduce((s, r) => s + r.keluar, 0) * 100) / 100;
  return {
    rows,
    totalMasuk,
    totalKeluar,
    totalRows: all.length,
    ownCount: data.length,
    sumber: "tvf" as const,
    saldoAwal: saldoAwalRaw,
    saldoAkhirPa: Number(range?.SaldoAkhir ?? 0),
    debetPa: Number(range?.Debet ?? 0),
    kreditPa: Number(range?.Kredit ?? 0),
  };
}
