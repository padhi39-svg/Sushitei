import sql from "mssql";
import { queryMaster, getSqlPool } from "@/lib/sqlserver";

/**
 * LAPORAN NERACA (Balance Sheet)
 * - Sumber: dbo.PeriodAkuntansi (saldo), dbo.MasterPerkiraan (master akun), dbo.Kategori (batas kelas)
 * - Tampilan mengikuti neraca Omega (contoh gambar Periode SEPTEMBER 2026):
 *     * Kolom: Saldo <bulan ini> (SaldoAkhir) | Saldo <bulan lalu> (SaldoAwal) | Perubahan (Akhir-Awal)
 *     * Akun ditampilkan per induk; nilai akun = saldo miliknya sendiri
 *       (akun induk tidak punya baris di PeriodeAkuntansi -> menampilkan 0).
 *     * Nilai akun Kredit ditampilkan positif (dibalik tanda), nilai negatif
 *       ditampilkan dalam tanda kurung, mis. (1.575.492.696,00).
 *     * Ada baris "Jumlah ..." untuk tiap kelompok induk dan
 *       "JMLAH KELOMPOK AKTIVA / PASIVA" di bagian bawah.
 *     * Neraca hanya berisi Aktiva (1) vs Kewajiban (2) + Modal (3);
 *       akun pendapatan/HPP/biaya (4/5/6/7) TIDAK ditampilkan terpisah
 *       karena laba/rugilah sudah tercermin di akun SALDO LABA (319...).
 */

export type NeracaRow = {
  kode: string;
  nama: string;
  level: number;
  isDetail: boolean;
  sifat: "Debit" | "Kredit";
  saldoAwal: number;
  saldoAkhir: number;
  perubahan: number;
};

export type NeracaDisplayRow = {
  kode: string;
  nama: string;
  tipe: "header" | "line" | "jumlah" | "grand";
  level: number;
  section: "aktif" | "pasiva";
  saldoAwal: number | null;
  saldoAkhir: number | null;
  perubahan: number | null;
};

export async function getNeracaKonfigurasi(cabang = "00001/01") {
  const rows = await queryMaster(
    `SELECT TOP 1 Cabang, Branch, NamaCabang, Divisi, NamaDivisi,
            Aktiva, Pasiva, Modal, RugiLaba, Penjualan, HPP
     FROM dbo.Kategori WHERE Cabang = @cabang`,
    { cabang }
  );
  const k = (rows[0] || {}) as any;
  const ambil = (v: string) => String(v || "").slice(9);
  return {
    cabang: k.Cabang || cabang,
    branch: k.Branch || "",
    namaCabang: k.NamaCabang || "",
    divisi: k.Divisi || "",
    namaDivisi: k.NamaDivisi || "",
    batas: {
      aktiva: ambil(k.Aktiva),
      pasiva: ambil(k.Pasiva),
      modal: ambil(k.Modal),
      rugiLaba: ambil(k.RugiLaba),
      penjualan: ambil(k.Penjualan),
      hpp: ambil(k.HPP),
    },
  };
}

type RawRow = {
  kode: string;
  nama: string;
  isDetail: boolean;
  sifat: boolean;
  awalRaw: number;
  akhirRaw: number;
};

const coreOf = (kode: string) => kode.replace(/0+$/, "");
const trailingZeros = (kode: string) => kode.length - coreOf(kode).length;
const levelOf = (kode: string) => 7 - trailingZeros(kode);

// Nilai tampil = saldo sesuai sifat akun (Debit: apa adanya, Kredit: dibalik tanda)
const disp = (raw: number, isDebit: boolean) => (isDebit ? raw : -raw);

export async function getNeracaRows(periode: number, cabang = "00001/01") {
  const branch = `${cabang}/`;
  const req = (await getSqlPool()).request();
  req.input("periode", sql.Decimal(18, 0), periode);
  req.input("branch", sql.VarChar(50), branch);
  const res = await req.query(`
    SELECT mp.Nomor, mp.Keterangan, mp.IsDetail, mp.Sifat,
           ISNULL(pa.SaldoAwal, 0) AS SaldoAwal,
           ISNULL(pa.SaldoAkhir, 0) AS SaldoAkhir
    FROM dbo.MasterPerkiraan mp
    LEFT JOIN dbo.PeriodeAkuntansi pa
           ON pa.NoPerkiraan = mp.Nomor AND pa.Periode = @periode
    WHERE mp.Nomor LIKE @branch + '%'
    ORDER BY mp.Nomor`);
  const rows = res.recordset as any[];
  return rows.map((r) => ({
    kode: String(r.Nomor).slice(9),
    nama: r.Keterangan || "",
    level: levelOf(String(r.Nomor).slice(9)),
    isDetail: !!r.IsDetail,
    sifat: !!r.Sifat,
    awalRaw: Number(r.SaldoAwal || 0),
    akhirRaw: Number(r.SaldoAkhir || 0),
  })) as (Omit<NeracaRow, "saldoAwal" | "saldoAkhir" | "perubahan" | "sifat"> & {
    sifat: boolean;
    awalRaw: number;
    akhirRaw: number;
  })[];
}

/**
 * Susun tampilan persis gambar:
 *  - baris header bawahan untuk akun induk (blank, bold)
 *  - baris rincian (akun level 5 = kode berakhir "00") dengan saldo tampil
 *  - baris "Jumlah ..." untuk tiap induk (bold + garis atas)
 *  - baris grand total "Jumlah ..." + "JMLAH KELOMPOK AKTIVA/PASIVA"
 */
export function buildNeracaDisplay(rawRows: RawRow[]) {
  const rows = rawRows.filter((r) => r.kode.startsWith("1") || r.kode.startsWith("2") || r.kode.startsWith("3"));
  const byKode = new Map<string, RawRow>();
  for (const r of rows) byKode.set(r.kode, r);

  const detailRows = rows.filter((r) => r.isDetail);

  // 1) Baris rincian: agregasi per 5 digit pertama
  const lineByPrefix = new Map<string, { awal: number; akhir: number }>();
  for (const d of detailRows) {
    const h = d.kode.slice(0, 5);
    const cur = lineByPrefix.get(h) || { awal: 0, akhir: 0 };
    cur.awal += d.awalRaw ?? (d as any).saldoAwal ?? 0;
    cur.akhir += d.akhirRaw ?? (d as any).saldoAkhir ?? 0;
    lineByPrefix.set(h, cur);
  }

  type Line = { kode: string; nama: string; sifat: boolean; awal: number; akhir: number };
  const lines: Line[] = [];
  lineByPrefix.forEach((tot, h) => {
    const labelKode = `${h}00`;
    const label = byKode.get(labelKode);
    if (!label) return;
    lines.push({ kode: labelKode, nama: label.nama, sifat: !!label.sifat, awal: tot.awal, akhir: tot.akhir });
  });
  lines.sort((a, b) => a.kode.localeCompare(b.kode));

  const lineRows: NeracaDisplayRow[] = lines.map((l) => {
    const dispAwal = disp(l.awal, l.sifat);
    const dispAkhir = disp(l.akhir, l.sifat);
    return {
      kode: l.kode,
      nama: l.nama,
      tipe: "line" as const,
      level: levelOf(l.kode),
      section: l.kode.startsWith("1") ? ("aktif" as const) : ("pasiva" as const),
      saldoAwal: dispAwal,
      saldoAkhir: dispAkhir,
      perubahan: dispAkhir - dispAwal,
    };
  });

  // 2) Header induk (level 1-3 saja, sama seperti gambar)
  const headers = rows
    .filter((r) => !r.isDetail && levelOf(r.kode) <= 3 && (r.kode.startsWith("1") || r.kode.startsWith("2") || r.kode.startsWith("3")))
    .map((r) => ({ kode: r.kode, nama: r.nama, level: levelOf(r.kode) }))
    .sort((a, b) => a.kode.localeCompare(b.kode));

  // 3) Jumlah untuk tiap induk = sum line-row yang dimulai dengan core induk
  const jumlahOf = (headerKode: string) => {
    const core = coreOf(headerKode);
    let awal = 0;
    let akhir = 0;
    for (const l of lines) {
      if (!l.kode.startsWith(core)) continue;
      // jangan hitung ganda: line dengan core sama dengan core induk dari level lebih dalam sudah termasuk
      const awal0 = lineRows.find((x) => x.kode === l.kode);
      if (!awal0) continue;
      awal += awal0.saldoAwal || 0;
      akhir += awal0.saldoAkhir || 0;
    }
    return { awal, akhir, perubahan: akhir - awal };
  };

  // 4) Susun urutan: header, lalu line, sisipkan "Jumlah ..." setelah line terakhir grup
  const headerLastLine = new Map<string, string>();
  for (const h of headers) {
    const core = coreOf(h.kode);
    const under = lines.filter((l) => l.kode.startsWith(core));
    if (under.length) headerLastLine.set(h.kode, under[under.length - 1].kode);
  }

  const items: NeracaDisplayRow[] = [];
  const merged = [
    ...headers.map((h) => ({ kind: "header" as const, kode: h.kode, nama: h.nama, level: h.level })),
    ...lineRows.map((l) => ({ kind: "line" as const, kode: l.kode, nama: l.nama, level: l.level, row: l })),
  ].sort((a, b) => a.kode.localeCompare(b.kode));

  // untuk menentukan kapan Jumlah disisipkan: setelah line yang menjadi "line terakhir" suatu header
  const afterLine = new Map<string, typeof headers>();
  for (const h of headers) {
    const last = headerLastLine.get(h.kode);
    if (!last) continue;
    if (!afterLine.has(last)) afterLine.set(last, []);
    afterLine.get(last)!.push(h);
  }

  for (const it of merged) {
    if (it.kind === "header") {
      items.push({
        kode: it.kode,
        nama: it.nama,
        tipe: "header",
        level: it.level,
        section: it.kode.startsWith("1") ? "aktif" : "pasiva",
        saldoAwal: null,
        saldoAkhir: null,
        perubahan: null,
      });
    } else {
      items.push(it.row);
      const hs = afterLine.get(it.kode);
      if (hs) {
        // urutkan jumlah dari yang paling dalam (level besar) ke paling luar
        hs.sort((a, b) => b.level - a.level);
        for (const h of hs) {
          const tot = jumlahOf(h.kode);
          items.push({
            kode: h.kode,
            nama: `Jumlah ${h.nama}`.toUpperCase(),
            tipe: "jumlah",
            level: h.level,
            section: h.kode.startsWith("1") ? "aktif" : "pasiva",
            saldoAwal: tot.awal,
            saldoAkhir: tot.akhir,
            perubahan: tot.perubahan,
          });
        }
      }
    }
  }

  // 5) Grand total per sisi
  const totalOf = (section: "aktif" | "pasiva") => {
    let awal = 0;
    let akhir = 0;
    for (const l of lineRows) {
      if (l.section !== section) continue;
      awal += l.saldoAwal || 0;
      akhir += l.saldoAkhir || 0;
    }
    return { awal, akhir, perubahan: akhir - awal };
  };
  const tAktif = totalOf("aktif");
  const tPasiva = totalOf("pasiva");

  // JMLAH KELOMPOK AKTIVA = Jumlah AKTIVA (duplikat persis seperti gambar)
  // JMLAH KELOMPOK PASIVA = Jumlah Kewajiban + Jumlah Ekuitas, di akhir laporan
  const idxLastAktif = items.map((x, i) => (x.section === "aktif" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  if (idxLastAktif >= 0) {
    items.splice(idxLastAktif + 1, 0, {
      kode: "1000000",
      nama: "JMLAH KELOMPOK AKTIVA",
      tipe: "grand",
      level: 1,
      section: "aktif",
      saldoAwal: tAktif.awal,
      saldoAkhir: tAktif.akhir,
      perubahan: tAktif.perubahan,
    });
  }
  const idxLastPasiva = items.map((x, i) => (x.section === "pasiva" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  if (idxLastPasiva >= 0) {
    items.splice(idxLastPasiva + 1, 0, {
      kode: "2000000",
      nama: "JMLAH KELOMPOK PASIVA",
      tipe: "grand",
      level: 1,
      section: "pasiva",
      saldoAwal: tPasiva.awal,
      saldoAkhir: tPasiva.akhir,
      perubahan: tPasiva.perubahan,
    });
  }

  return {
    rows: items,
    totals: {
      aktivaAwal: tAktif.awal,
      aktivaAkhir: tAktif.akhir,
      pasivaAwal: tPasiva.awal,
      pasivaAkhir: tPasiva.akhir,
      selisihAwal: tAktif.awal - tPasiva.awal,
      selisihAkhir: tAktif.akhir - tPasiva.akhir,
    },
  };
}

// Kompatibilitas: susunNeraca lama dipakai route lama -> sekarang tidak dipakai,
// tapi dipertahankan agar type-check lain tidak rusak bila ada import lama.
export function susunNeraca(rows: any[], _batas: any) {
  return {
    aktiva: { rows: [], totalAwal: 0, totalAkhir: 0 },
    pasiva: { rows: [], totalAwal: 0, totalAkhir: 0 },
    modal: { rows: [], totalAwal: 0, totalAkhir: 0 },
    pendapatan: { rows: [], totalAwal: 0, totalAkhir: 0 },
    hpp: { rows: [], totalAwal: 0, totalAkhir: 0 },
    labaRugi: 0,
    rows,
  };
}

export async function getPeriodeListAkuntansi() {
  return queryMaster(
    `SELECT p.Kode AS Kode, p.Keterangan AS Keterangan,
            p.TglMulai AS TglMulai, p.TglAkhir AS TglAkhir
     FROM dbo.MstPeriode p
     WHERE EXISTS (SELECT 1 FROM dbo.PeriodeAkuntansi pa WHERE pa.Periode = p.Kode)
     ORDER BY p.Kode DESC`
  );
}

export async function getPeriodeAkuntansiTerakhir() {
  const rows = await queryMaster(
    `SELECT TOP 1 Periode FROM dbo.PeriodeAkuntansi ORDER BY Periode DESC`
  );
  return Number(rows[0]?.Periode || 0);
}
