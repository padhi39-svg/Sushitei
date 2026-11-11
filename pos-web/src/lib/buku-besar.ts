import { queryMaster } from "@/lib/sqlserver";

export type BukuBesarRow = {
  urutan: number;
  tgl: string;
  perkiraan: string;
  namaAkun: string;
  kodeNota: string;
  module: string;
  costCenter: string;
  keterangan: string;
  masuk: number;
  keluar: number;
  saldo: number;
  masukAsing: number;
  keluarAsing: number;
  saldoAsing: number;
};

export type BukuBesarHeader = {
  noPerkiraan: string;
  namaAkun: string;
  sifat: string;
  saldoAwal: number;
  tglAwal: string;
  tglAkhir: string;
};

export type BukuBesarFooter = {
  jumlahTransaksi: number;
  totalMasuk: number;
  totalKeluar: number;
  saldoAkhir: number;
};

export type BukuBesarResult = {
  header: BukuBesarHeader;
  rows: BukuBesarRow[];
  footer: BukuBesarFooter;
};

export async function getBukuBesarPeriodeList() {
  return queryMaster(
    `SELECT p.Kode AS Kode, p.Keterangan AS Keterangan,
            p.TglMulai AS TglMulai, p.TglAkhir AS TglAkhir
     FROM dbo.MstPeriode p
     WHERE EXISTS (SELECT 1 FROM dbo.PeriodeAkuntansi pa WHERE pa.Periode = p.Kode)
     ORDER BY p.Kode DESC`
  );
}

export async function getBukuBesarAkunList() {
  return queryMaster(
    `SELECT Nomor AS code, Keterangan AS name,
            CASE WHEN Sifat = 1 THEN 'Debit' ELSE 'Kredit' END AS sifat
     FROM dbo.MasterPerkiraan
     WHERE IsDetail = 1
     ORDER BY Nomor`
  );
}

export async function getBukuBesarData(
  noPerkiraan: string,
  tglAwal: string,
  tglAkhir: string
): Promise<BukuBesarResult> {
  const tglAwalDt = new Date(tglAwal);
  const tglAkhirDt = new Date(tglAkhir);

  // Header: info akun + saldo awal (query ringan)
  const headerRows = await queryMaster(
    `SELECT mp.Nomor, mp.Keterangan,
            CASE WHEN mp.Sifat = 1 THEN 'Debit' ELSE 'Kredit' END AS sifat
     FROM dbo.MasterPerkiraan mp
     WHERE mp.Nomor = @noPerkiraan`,
    { noPerkiraan }
  );
  const h = (headerRows[0] || {}) as any;

  // Saldo awal dari PeriodeAkuntansi (query ringan, terpisah)
  const saldoAwalRows = await queryMaster(
    `SELECT TOP 1 pa.SaldoAwal
     FROM dbo.PeriodeAkuntansi pa
     WHERE pa.NoPerkiraan = @noPerkiraan
       AND pa.Periode <= @periodeAwal
     ORDER BY pa.Periode DESC`,
    { noPerkiraan, periodeAwal: Number(tglAwal.slice(0, 4) + tglAwal.slice(5, 7)) }
  );
  const saldoAwal = Number((saldoAwalRows[0] as any)?.SaldoAwal || 0);

  // Detail transaksi (query berat - AktivitasAkuntansi)
  const detailRows = await queryMaster(
    `SELECT a.Urutan, a.Tgl, a.Perkiraan, a.KodeNota, a.Module, a.Keterangan,
            a.Masuk, a.Keluar, a.Saldo,
            a.MasukAsing, a.KeluarAsing, a.SaldoAsing
     FROM dbo.AktivitasAkuntansi(@noPerkiraan, @tglAwal, @tglAkhir) a
     WHERE a.Tgl >= @tglAwal AND a.Tgl <= @tglAkhir
     ORDER BY a.Urutan`,
    { noPerkiraan, tglAwal, tglAkhir }
  );

  const rows: BukuBesarRow[] = (detailRows as any[]).map((r) => ({
    urutan: Number(r.Urutan || 0),
    tgl: r.Tgl ? new Date(r.Tgl).toISOString().slice(0, 10) : "",
    perkiraan: r.Perkiraan || "",
    namaAkun: r.Keterangan || "",
    kodeNota: r.KodeNota || "",
    module: r.Module || "",
    costCenter: r.CostCenter || "",
    keterangan: r.Keterangan || "",
    masuk: Number(r.Masuk || 0),
    keluar: Number(r.Keluar || 0),
    saldo: Number(r.Saldo || 0),
    masukAsing: Number(r.MasukAsing || 0),
    keluarAsing: Number(r.KeluarAsing || 0),
    saldoAsing: Number(r.SaldoAsing || 0),
  }));

  // Footer: total
  const lastRow = rows[rows.length - 1];
  const footer: BukuBesarFooter = {
    jumlahTransaksi: rows.length,
    totalMasuk: rows.reduce((s, r) => s + r.masuk, 0),
    totalKeluar: rows.reduce((s, r) => s + r.keluar, 0),
    saldoAkhir: lastRow ? lastRow.saldo : saldoAwal,
  };

  return {
    header: {
      noPerkiraan: h.Nomor || noPerkiraan,
      namaAkun: h.Keterangan || "",
      sifat: h.sifat || "Debit",
      saldoAwal,
      tglAwal,
      tglAkhir,
    },
    rows,
    footer,
  };
}
