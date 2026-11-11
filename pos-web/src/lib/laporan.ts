import { queryMaster, getPeriodeTerakhir } from "@/lib/sqlserver";

export { getPeriodeTerakhir };

/**
 * LAPORAN REKAP MUTASI NILAI PERSEDIAAN PER PERIODE PER GUDANG
 * Acuan: dbo.ReportList ID 5056 (Omega).
 *
 * Query asliOmega memakai tabel temp (#kategori, #staff) yang dibuat oleh aplikasi desktop.
 * Di web ini diganti parameter biasa:
 *   - @periode : kode periode (YYYYMM) dari dbo.MstPeriode
 *   - @gudang  : kode gudang, '%' = semua gudang
 *
 * SQL Server 2005 compatible (tanpa CTE/window function pada query utama).
 */

// Daftar periode (master periode) untuk dropdown filter
export async function getListPeriode() {
  return queryMaster(
    `SELECT p.Kode AS Kode, p.Keterangan AS Keterangan, p.TglMulai AS TglMulai, p.TglAkhir AS TglAkhir
     FROM dbo.MstPeriode p
     ORDER BY p.Kode DESC`
  );
}

// Daftar gudang untuk dropdown filter
export async function getListGudang(cabang?: string) {
  const where = cabang && cabang !== "%" && cabang !== "all"
    ? `WHERE g.Kode LIKE @cabang + '%'`
    : "";
  return queryMaster(
    `SELECT g.Kode AS Kode, g.Keterangan AS Keterangan
     FROM dbo.Gudang g
     ${where}
     ORDER BY g.Kode`,
    cabang && cabang !== "%" && cabang !== "all" ? { cabang } : undefined
  );
}

export type MutasiFilter = {
  periode: number;
  gudang?: string;      // "%" atau kosong = semua gudang
  q?: string;           // pencarian kode/nama barang
  page?: number;
  pageSize?: number;
};

// Query utama laporan (satu baris per barang + gudang)
//
// Catatan: pencarian (q) TIDAK memakai "@q = '' OR ..." di dalam subquery.
// SQL Server 2005 salah mengoptimasi pola itu sehingga hasil bisa 0 baris.
// Filter pencarian dipasang sebagai JOIN di dalam subquery -> selalu benar & cepat.
function buildMutasiQuery(f: { periode: number; gudang: string; q: string; offset: number; limit: number }) {
  const filterBarang = f.q
    ? `AND (b2.Keterangan LIKE '%' + @q + '%' OR b2.Kode LIKE '%' + @q + '%')`
    : "";
  return `
    SELECT * FROM (
      SELECT ROW_NUMBER() OVER (ORDER BY b.Kode, g.Kode) AS __rn,
             b.Kode AS KodeBarang, b.Keterangan AS NamaBarang,
             g.Kode AS KodeGudang, g.Keterangan AS Gudang,
             bk.Keterangan AS Kategori,
             CASE WHEN b.Golongan = 0 THEN 'BAHAN BAKU'
                  WHEN b.Golongan = 1 THEN 'BARANG SETENGAH JADI'
                  ELSE 'BARANG JADI' END AS Golongan,
             ISNULL(x.stokawal, 0) AS StokAwal,
             ISNULL(x.pembelian, 0) AS Pembelian,
             ISNULL(x.returjual, 0) AS ReturJual,
             ISNULL(x.transfermasuk, 0) AS TransferMasuk,
             ISNULL(x.lain2masuk, 0) AS Lain2Masuk,
             ISNULL(x.penjualan, 0) AS Penjualan,
             ISNULL(x.returbeli, 0) AS ReturBeli,
             ISNULL(x.transferkeluar, 0) AS TransferKeluar,
             ISNULL(x.lain2keluar, 0) AS Lain2Keluar,
             ISNULL(x.stokakhir, 0) AS StokAkhir,
             ISNULL(x.stokawal * y.HargaPokokAwal, 0) AS NilaiPersediaanAwal,
             ISNULL(x.pembelian * y.HargaPokokAkhir, 0) AS NilaiPembelian,
             ISNULL(x.returjual * y.HargaPokokAkhir, 0) AS NilaiReturJual,
             ISNULL(x.lain2masuk * y.HargaPokokAkhir, 0) AS NilaiLain2Masuk,
             ISNULL(x.penjualan * y.HargaPokokAkhir, 0) AS NilaiPenjualan,
             ISNULL(x.returbeli * y.HargaPokokAkhir, 0) AS NilaiReturBeli,
             ISNULL(x.lain2keluar * y.HargaPokokAkhir, 0) AS NilaiLain2Keluar,
             ISNULL(x.stokakhir * y.HargaPokokAkhir, 0) AS NilaiPersediaanAkhir,
             ISNULL(y.hargapokokawal, 0) AS HargaPokokAwal,
             ISNULL(y.hargapokokakhir, 0) AS HargaPokokAkhir,
             (SELECT TOP 1 st.satuan FROM dbo.Satuan st
               WHERE st.Brg = b.Kode AND st.SatuanAktif = 1 ORDER BY st.Rasio ASC) AS SatuanTerkecil,
             (SELECT TOP 1 st.satuan FROM dbo.Satuan st
               WHERE st.Brg = b.Kode AND st.SatuanAktif = 1 ORDER BY st.Rasio DESC) AS SatuanTerbesar,
             CAST(ISNULL(x.stokakhir, 0) / NULLIF((SELECT TOP 1 s.rasio FROM dbo.Satuan s
               WHERE s.Brg = b.Kode AND s.SatuanAktif = 1 ORDER BY s.Rasio DESC), 0) AS float) AS JumlahBesar
      FROM (
        SELECT p.Brg, p.Gudang,
               CAST(SUM(p.StokAwal) AS MONEY) AS stokawal,
               CAST(SUM(p.Pembelian) AS MONEY) AS pembelian,
               CAST(SUM(p.ReturJual) AS MONEY) AS returjual,
               CAST(SUM(p.TransferMasuk) AS MONEY) AS transfermasuk,
               CAST(SUM(p.Lain2Masuk) AS MONEY) AS lain2masuk,
               CAST(SUM(p.Penjualan) AS MONEY) AS penjualan,
               CAST(SUM(p.ReturBeli) AS MONEY) AS returbeli,
               CAST(SUM(p.TransferKeluar) AS MONEY) AS transferkeluar,
               CAST(SUM(p.Lain2Keluar) AS MONEY) AS lain2keluar,
               CAST(SUM(p.StokAkhir) AS MONEY) AS stokakhir
        FROM dbo.PeriodeBrg p
        JOIN dbo.Barang b2 ON b2.Kode = p.Brg
        WHERE p.Periode = @periode
          AND p.Gudang LIKE @gudang
          ${filterBarang}
        GROUP BY p.Brg, p.Gudang
      ) x
      JOIN dbo.Barang b ON b.Kode = x.Brg
      JOIN dbo.Gudang g ON g.Kode = x.Gudang
      JOIN dbo.BrgKategori bk ON b.Kategori = bk.Kode
      LEFT JOIN (
        SELECT p.Brg,
               CAST(SUM(p.HrgPokokAwal) AS MONEY) AS HargaPokokAwal,
               CAST(SUM(p.HrgPokokAkhir) AS MONEY) AS HargaPokokAkhir
        FROM dbo.PeriodeHrgPokok p
        WHERE p.Periode = @periode
        GROUP BY p.Brg
      ) y ON b.Kode = y.Brg
    ) t
    WHERE t.__rn BETWEEN ${f.offset + 1} AND ${f.offset + f.limit}`;
}

// Total baris (untuk pagination) + total nilai (footer)
async function countAndTotals(f: { periode: number; gudang: string; q: string }) {
  const filterBarang = f.q
    ? `AND (b2.Keterangan LIKE '%' + @q + '%' OR b2.Kode LIKE '%' + @q + '%')`
    : "";
  return queryMaster(
    `SELECT COUNT(*) AS total,
            CAST(SUM(ISNULL(x.stokawal, 0)) AS MONEY) AS StokAwal,
            CAST(SUM(ISNULL(x.pembelian, 0)) AS MONEY) AS Pembelian,
            CAST(SUM(ISNULL(x.returjual, 0)) AS MONEY) AS ReturJual,
            CAST(SUM(ISNULL(x.transfermasuk, 0)) AS MONEY) AS TransferMasuk,
            CAST(SUM(ISNULL(x.lain2masuk, 0)) AS MONEY) AS Lain2Masuk,
            CAST(SUM(ISNULL(x.penjualan, 0)) AS MONEY) AS Penjualan,
            CAST(SUM(ISNULL(x.returbeli, 0)) AS MONEY) AS ReturBeli,
            CAST(SUM(ISNULL(x.transferkeluar, 0)) AS MONEY) AS TransferKeluar,
            CAST(SUM(ISNULL(x.lain2keluar, 0)) AS MONEY) AS Lain2Keluar,
            CAST(SUM(ISNULL(x.stokakhir, 0)) AS MONEY) AS StokAkhir,
            CAST(SUM(ISNULL(x.stokawal * y.HargaPokokAwal, 0)) AS MONEY) AS NilaiPersediaanAwal,
            CAST(SUM(ISNULL(x.pembelian * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiPembelian,
            CAST(SUM(ISNULL(x.returjual * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiReturJual,
            CAST(SUM(ISNULL(x.lain2masuk * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiLain2Masuk,
            CAST(SUM(ISNULL(x.penjualan * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiPenjualan,
            CAST(SUM(ISNULL(x.returbeli * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiReturBeli,
            CAST(SUM(ISNULL(x.lain2keluar * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiLain2Keluar,
            CAST(SUM(ISNULL(x.stokakhir * y.HargaPokokAkhir, 0)) AS MONEY) AS NilaiPersediaanAkhir
     FROM (
       SELECT p.Brg, p.Gudang,
              CAST(SUM(p.StokAwal) AS MONEY) AS stokawal,
              CAST(SUM(p.Pembelian) AS MONEY) AS pembelian,
              CAST(SUM(p.ReturJual) AS MONEY) AS returjual,
              CAST(SUM(p.TransferMasuk) AS MONEY) AS transfermasuk,
              CAST(SUM(p.Lain2Masuk) AS MONEY) AS lain2masuk,
              CAST(SUM(p.Penjualan) AS MONEY) AS penjualan,
              CAST(SUM(p.ReturBeli) AS MONEY) AS returbeli,
              CAST(SUM(p.TransferKeluar) AS MONEY) AS transferkeluar,
              CAST(SUM(p.Lain2Keluar) AS MONEY) AS lain2keluar,
              CAST(SUM(p.StokAkhir) AS MONEY) AS stokakhir
       FROM dbo.PeriodeBrg p
       JOIN dbo.Barang b2 ON b2.Kode = p.Brg
       WHERE p.Periode = @periode
         AND p.Gudang LIKE @gudang
         ${filterBarang}
       GROUP BY p.Brg, p.Gudang
     ) x
     JOIN dbo.Barang b ON b.Kode = x.Brg
     LEFT JOIN (
       SELECT p.Brg,
              CAST(SUM(p.HrgPokokAwal) AS MONEY) AS HargaPokokAwal,
              CAST(SUM(p.HrgPokokAkhir) AS MONEY) AS HargaPokokAkhir
       FROM dbo.PeriodeHrgPokok p
       WHERE p.Periode = @periode
       GROUP BY p.Brg
     ) y ON b.Kode = y.Brg`,
    { periode: f.periode, gudang: f.gudang, q: f.q }
  );
}

// Jalankan laporan (semua baris, TANPA pagination)
export async function getLaporanMutasiPersediaan(f: MutasiFilter) {
  const gudang = f.gudang && f.gudang !== "all" ? f.gudang : "%";
  const q = (f.q || "").trim();

  const params = { periode: f.periode, gudang, q };
  // Tanpilkan semua baris sekaligus: offset 0 dengan batas sangat besar
  const [rows, aggRows] = await Promise.all([
    queryMaster(buildMutasiQuery({ ...params, offset: 0, limit: 100000 }), params),
    countAndTotals(params),
  ]);

  const agg = (aggRows[0] || {}) as any;
  return {
    rows: (rows as any[]).map((r: any) => {
      const { __rn, ...rest } = r;
      return rest;
    }),
    total: Number(agg.total || 0),
    totals: agg,
  };
}
