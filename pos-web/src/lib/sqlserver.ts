import sql from "mssql";

/**
 * Koneksi READ-ONLY ke SQL Server 2005/Omega (master).
 * Nama database bisa dipilih via settings (key: mssql_database), default env MSSQL_DATABASE / "Omega".
 * Web TIDAK sync master ke Postgres. Setiap butuh master, baca langsung ke sini.
 * Transaksi yang disimpan ke Postgres menyimpan SNAPSHOT (kode, nama, satuan, harga saat itu).
 */

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let cachedDbName: { value: string; at: number } | null = null;

function buildSqlConfig(database: string, poolMax = 5, requestTimeout = 180000): sql.config {
  const instanceName = process.env.MSSQL_INSTANCE || undefined;
  const port = process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : undefined;
  return {
    server: process.env.MSSQL_HOST || "localhost",
    database,
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "",
    ...(instanceName ? {} : { port: port || 1433 }),
    options: {
      ...(instanceName ? { instanceName } : {}),
      encrypt: process.env.MSSQL_ENCRYPT === "true",
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== "false",
      enableArithAbort: true,
    },
    pool: { max: poolMax, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout,
  };
}

export async function resetSqlPool() {
  const previousPoolPromise = poolPromise;
  poolPromise = null;
  cachedDbName = null;
  if (previousPoolPromise) {
    try {
      const previousPool = await previousPoolPromise;
      await previousPool.close();
    } catch {
      // Pool yang gagal konek tidak perlu ditutup.
    }
  }
}

async function getSelectedDbName(): Promise<string> {
  const now = Date.now();
  if (cachedDbName && now - cachedDbName.at < 30 * 1000) return cachedDbName.value;
  let name = process.env.MSSQL_DATABASE || "Omega";
  try {
    const { db } = await import("@/db");
    const { settings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(settings).where(eq(settings.settingKey, "mssql_database")).limit(1);
    const v = rows[0]?.settingValue?.trim();
    if (v) name = v;
  } catch {
    // fallback to env
  }
  cachedDbName = { value: name, at: now };
  return name;
}

export async function getSqlPool() {
  if (poolPromise) return poolPromise;
  const dbName = await getSelectedDbName();
  const pendingPool = new sql.ConnectionPool(buildSqlConfig(dbName)).connect();
  poolPromise = pendingPool;
  try {
    return await pendingPool;
  } catch (error) {
    if (poolPromise === pendingPool) poolPromise = null;
    throw error;
  }
}

export async function queryMaster<T = any>(sqlText: string, params?: Record<string, any>): Promise<T[]> {
  const pool = await getSqlPool();
  const req = pool.request();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (k === "periode") req.input(k, sql.Decimal(18, 0), Number(v));
      else if (k === "gudang") req.input(k, sql.VarChar(100), v);
      else if (k === "cabang") req.input(k, sql.VarChar(100), v);
      else if (typeof v === "number") req.input(k, sql.Decimal(18, 4), v);
      else req.input(k, sql.VarChar(500), v);
    }
  }
  const res = await req.query(sqlText);
  return res.recordset as T[];
}

// Helper pagination (aman: angka di-inline setelah dibatasi)
function pageArgs(page: any, pageSize: any, defSize = 20) {
  const ps = Math.max(5, Math.min(Number(pageSize) || defSize, 200));
  const p = Math.max(1, Number(page) || 1);
  return { p, ps, start: (p - 1) * ps + 1, end: p * ps };
}

// Master Barang (dari Omega.Barang) + nama kategori & merek — per halaman
export async function getBarangPage(search = "", page = 1, pageSize = 20) {
  const { p, ps, start, end } = pageArgs(page, pageSize);
  const where = `WHERE b.Aktif = 1 AND (@search = '' OR b.Kode LIKE '%' + @search + '%' OR b.Keterangan LIKE '%' + @search + '%')`;
  const [rows, countRows] = await Promise.all([
    queryMaster(
      `SELECT t.Kode, t.Keterangan, t.Kategori, t.KategoriNama, t.Merek, t.MerekNama,
              t.Variant, t.HPPStandart, t.Aktif, t.Golongan
       FROM (
         SELECT b.Kode, b.Keterangan, b.Kategori, bk.Keterangan AS KategoriNama,
                b.Merek, bm.Keterangan AS MerekNama, b.Variant, b.HPPStandart, b.Aktif, b.Golongan,
                ROW_NUMBER() OVER (ORDER BY b.Kode) AS __rn
         FROM dbo.Barang b
         LEFT JOIN dbo.BrgKategori bk ON bk.Kode = b.Kategori
         LEFT JOIN dbo.BrgMerek bm ON bm.Kode = b.Merek
         ${where}
       ) t WHERE t.__rn BETWEEN ${start} AND ${end} ORDER BY t.__rn`,
      { search }
    ),
    queryMaster(`SELECT COUNT(*) AS total FROM dbo.Barang b ${where}`, { search }),
  ]);
  return { rows, total: Number((countRows[0] as any)?.total || 0), page: p, pageSize: ps };
}

// Detail 1 barang (untuk halaman View) - termasuk nama kategori, merek, ikhtisar (akun persediaan)
export async function getBarangDetail(kode: string) {
  const rows = await queryMaster(
    `SELECT TOP 1 b.Kode, b.Keterangan, b.Kategori, bk.Keterangan AS KategoriNama,
            b.Spesifikasi, b.Merek, bm.Keterangan AS MerekNama, b.Variant,
            b.HPPStandart, b.Golongan, b.Aktif, b.TampilMenu, b.Gambar, b.Info, b.Hint,
            b.AliasKode, b.PLU, b.Berat, b.SU,
            (SELECT TOP 1 k.Persediaan FROM dbo.Kategori k) AS IkhtisarNomor,
            (SELECT TOP 1 p.Keterangan FROM dbo.Kategori k
               LEFT JOIN dbo.MasterPerkiraan p ON p.Nomor = k.Persediaan) AS IkhtisarNama
     FROM dbo.Barang b
     LEFT JOIN dbo.BrgKategori bk ON bk.Kode = b.Kategori
     LEFT JOIN dbo.BrgMerek bm ON bm.Kode = b.Merek
     WHERE b.Kode = @kode`,
    { kode }
  );
  return (rows[0] as any) || null;
}

// Master Satuan (dari Omega.Satuan) -> 1 barang bisa banyak satuan
export async function getSatuanByBarang(barangKode: string) {
  return queryMaster(
    `SELECT Brg, Rasio, Satuan, SatuanAktif, SatuanBeli, Prioritas, HargaSatuan
     FROM dbo.Satuan WHERE Brg = @kode ORDER BY Rasio`,
    { kode: barangKode }
  );
}

// Master Satuan (semua baris Omega.Satuan) + nama barang — per halaman
export async function getSatuanPage(search = "", page = 1, pageSize = 20) {
  const { p, ps, start, end } = pageArgs(page, pageSize);
  const where = `WHERE (@search = ''
            OR s.Brg LIKE '%' + @search + '%'
            OR s.Satuan LIKE '%' + @search + '%'
            OR b.Keterangan LIKE '%' + @search + '%')`;
  const [rows, countRows] = await Promise.all([
    queryMaster(
      `SELECT t.Brg, t.Keterangan, t.Rasio, t.Satuan, t.SatuanAktif, t.SatuanBeli, t.Prioritas, t.HargaSatuan
       FROM (
         SELECT s.Brg, b.Keterangan, s.Rasio, s.Satuan, s.SatuanAktif, s.SatuanBeli, s.Prioritas, s.HargaSatuan,
                ROW_NUMBER() OVER (ORDER BY s.Brg, s.Rasio) AS __rn
         FROM dbo.Satuan s
         LEFT JOIN dbo.Barang b ON b.Kode = s.Brg
         ${where}
       ) t WHERE t.__rn BETWEEN ${start} AND ${end} ORDER BY t.__rn`,
      { search }
    ),
    queryMaster(
      `SELECT COUNT(*) AS total FROM dbo.Satuan s LEFT JOIN dbo.Barang b ON b.Kode = s.Brg ${where}`,
      { search }
    ),
  ]);
  return { rows, total: Number((countRows[0] as any)?.total || 0), page: p, pageSize: ps };
}

// Master Harga Jual (semua baris Omega.BrgPrice) + nama barang & satuan — per halaman
export async function getHargaPage(search = "", page = 1, pageSize = 20) {
  const { p, ps, start, end } = pageArgs(page, pageSize);
  const where = `WHERE (@search = ''
            OR p.Brg LIKE '%' + @search + '%'
            OR b.Keterangan LIKE '%' + @search + '%'
            OR s.Satuan LIKE '%' + @search + '%')`;
  const [rows, countRows] = await Promise.all([
    queryMaster(
      `SELECT t.Brg, t.Keterangan, t.Rasio, t.Satuan, t.MataUang, t.Cabang, t.Tgl,
              t.HrgJual, t.HrgAkhir, t.HrgBandrol
       FROM (
         SELECT p.Brg, b.Keterangan, p.Rasio, s.Satuan, p.MataUang, p.Cabang, p.Tgl,
                p.HrgJual, p.HrgAkhir, p.HrgBandrol,
                ROW_NUMBER() OVER (ORDER BY p.Brg, p.Tgl DESC, p.Rasio) AS __rn
         FROM dbo.BrgPrice p
         LEFT JOIN dbo.Barang b ON b.Kode = p.Brg
         LEFT JOIN dbo.Satuan s ON s.Brg = p.Brg AND s.Rasio = p.Rasio
         ${where}
       ) t WHERE t.__rn BETWEEN ${start} AND ${end} ORDER BY t.__rn`,
      { search }
    ),
    queryMaster(
      `SELECT COUNT(*) AS total FROM dbo.BrgPrice p
       LEFT JOIN dbo.Barang b ON b.Kode = p.Brg
       LEFT JOIN dbo.Satuan s ON s.Brg = p.Brg AND s.Rasio = p.Rasio
       ${where}`,
      { search }
    ),
  ]);
  return { rows, total: Number((countRows[0] as any)?.total || 0), page: p, pageSize: ps };
}

// Master Harga Jual (dari Omega.BrgPrice) -> harga per satuan per tanggal
export async function getHargaByBarang(barangKode: string, cabang?: string) {
  return queryMaster(
    `SELECT p.Brg, p.Rasio, s.Satuan, p.MataUang, p.Cabang, p.Tgl,
            p.HrgJual, p.HrgAkhir, p.HrgBandrol
     FROM dbo.BrgPrice p
     LEFT JOIN dbo.Satuan s ON s.Brg = p.Brg AND s.Rasio = p.Rasio
     WHERE p.Brg = @kode ${cabang ? "AND p.Cabang = @cabang" : ""}
     ORDER BY p.Tgl DESC, p.Rasio`,
    cabang ? { kode: barangKode, cabang } : { kode: barangKode }
  );
}

// ReportList (query laporan lama) - diambil sebagai referensi, dijalankan langsung
export async function getReportById(id: number) {
  const rows = await queryMaster(
    `SELECT ID, Dept, Title, Class, Query1, Query2, Mandatory, ModeTampil, DBVersion
     FROM dbo.ReportList WHERE ID = @id`,
    { id }
  );
  return rows[0] as any;
}

export async function listReports(dept?: string) {
  if (dept) {
    return queryMaster(`SELECT ID, Dept, Title, Class, Mandatory FROM dbo.ReportList WHERE Dept = @dept ORDER BY ID`, { dept });
  }
  return queryMaster(`SELECT ID, Dept, Title, Class, Mandatory FROM dbo.ReportList ORDER BY Dept, ID`);
}

// ============================================================
// MASTER INGREDIENT (RESEP) - lookup barang + HPP dari Omega
//
// HPP diambil dari dbo.PeriodeHrgPokok untuk SATU periode saja.
// Periode diambil dari dbo.MstPeriode (kode periode + range tanggal),
// bukan dengan scanning seluruh tabel PeriodeHrgPokok.
// Nilai: HrgPokokAkhir, kalau 0 fallback HrgPokokAwal.
// ============================================================

// Periode terakhir (terbesar) dari master periode
let cachedPeriode: { kode: number; at: number } | null = null;
export async function getPeriodeTerakhir(): Promise<number> {
  const now = Date.now();
  if (cachedPeriode && now - cachedPeriode.at < 5 * 60 * 1000) return cachedPeriode.kode;
  const rows = await queryMaster<{ Kode: number }>(
    `SELECT TOP 1 Kode FROM dbo.MstPeriode ORDER BY Kode DESC`
  );
  const kode = Number(rows[0]?.Kode || 0);
  cachedPeriode = { kode, at: now };
  return kode;
}

export type BarangUnit = { satuan: string; rasio: number };
export type BarangMeta = {
  kode: string;
  nama: string;
  golongan: number;
  hpp: number;       // HPP per satuan dasar (Rasio = 1)
  units: BarangUnit[];
};

// Ambil nama + golongan + HPP + daftar satuan untuk sekumpulan kode barang (batch)
// HPP: satu query, khusus 1 periode (dari MstPeriode) -> cepat, tidak scan seluruh tabel.
export async function getBarangMetaMap(kodes: string[]): Promise<Record<string, BarangMeta>> {
  const uniq = Array.from(new Set((kodes || []).filter(Boolean)));
  const out: Record<string, BarangMeta> = {};
  if (!uniq.length) return out;

  const params: Record<string, any> = {};
  const inList = uniq.map((k, i) => { params[`k${i}`] = k; return `@k${i}`; }).join(",");
  const periode = await getPeriodeTerakhir();
  params["periode"] = periode;

  const [rows, units] = await Promise.all([
    queryMaster(
      `SELECT b.Kode, b.Keterangan, b.Golongan,
              COALESCE(NULLIF(h.HrgPokokAkhir, 0), h.HrgPokokAwal, 0) AS Hpp
       FROM dbo.Barang b
       LEFT JOIN dbo.PeriodeHrgPokok h
              ON h.Brg = b.Kode AND h.Periode = @periode AND h.MataUang = 'IDR'
       WHERE b.Kode IN (${inList})`,
      params
    ),
    queryMaster(
      `SELECT Brg, Satuan, Rasio FROM dbo.Satuan WHERE Brg IN (${inList}) ORDER BY Brg, Rasio`,
      params
    ),
  ]);

  for (const r of rows as any[]) {
    out[r.Kode] = {
      kode: r.Kode,
      nama: r.Keterangan || "",
      golongan: Number(r.Golongan ?? 0),
      hpp: Number(r.Hpp || 0),
      units: [],
    };
  }
  for (const u of units as any[]) {
    if (out[u.Brg]) out[u.Brg].units.push({ satuan: u.Satuan, rasio: Number(u.Rasio || 1) });
  }
  return out;
}

// Lookup untuk dropdown form:
//  - mode "jadi" : barang untukmakersep (Golongan 1 = Setengah Jadi, 2 = Barang Jadi)
//  - mode "bahan": bahan yang boleh dipakai di resep -> semua golongan (0/1/2)
// Semua info (nama + HPP + satuan) diambil dalam 1 query join agar tidak bolak-balik.
export async function getIngredientLookup(mode: "jadi" | "bahan", search = "") {
  const gol = mode === "jadi" ? "IN (1, 2)" : "IN (0, 1, 2)";
  const periode = await getPeriodeTerakhir();
  const rows = await queryMaster(
    `SELECT b.Kode, b.Keterangan, b.Golongan,
            COALESCE(NULLIF(h.HrgPokokAkhir, 0), h.HrgPokokAwal, 0) AS Hpp
     FROM dbo.Barang b
     LEFT JOIN dbo.PeriodeHrgPokok h
            ON h.Brg = b.Kode AND h.Periode = @periode AND h.MataUang = 'IDR'
     WHERE b.Aktif = 1 AND b.Golongan ${gol}
       AND (@search = '' OR b.Kode LIKE '%' + @search + '%' OR b.Keterangan LIKE '%' + @search + '%')
     ORDER BY b.Keterangan`,
    { search, periode }
  );
  const meta = await getBarangMetaMap((rows as any[]).map((r) => r.Kode));
  return (rows as any[]).map((r) => meta[r.Kode]).filter(Boolean);
}

// List databases on SQL Server (for settings dropdown)
export async function listSqlDatabases(): Promise<string[]> {
  const pool = await new sql.ConnectionPool(buildSqlConfig("master", 1, 30000)).connect();
  try {
    const res = await pool.request().query(`SELECT name FROM sys.databases WHERE state = 0 ORDER BY name`);
    return (res.recordset as any[]).map((r) => String(r.name));
  } finally {
    await pool.close();
  }
}

// Validate that a DB has Omega schema
export async function validateOmegaDb(dbName: string): Promise<{ valid: boolean; error?: string; missing?: string[] }> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await new sql.ConnectionPool(buildSqlConfig(dbName, 1, 30000)).connect();
    const res = await pool.request().query(`
      SELECT name
      FROM sys.objects
      WHERE schema_id = SCHEMA_ID('dbo')
        AND type IN ('U', 'V', 'SN')
        AND name IN ('Barang', 'Gudang', 'Satuan', 'BrgPrice', 'MstPeriode')
    `);
    const found = new Set((res.recordset as any[]).map((row) => String(row.name)));
    const required = ["Barang", "Gudang", "Satuan", "BrgPrice", "MstPeriode"];
    const missing = required.filter((name) => !found.has(name));
    return missing.length ? { valid: false, missing } : { valid: true };
  } catch (error: any) {
    return { valid: false, error: error?.message || "Tidak dapat terhubung ke database" };
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
}
