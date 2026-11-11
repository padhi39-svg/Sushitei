const sql = require("mssql");

(async () => {
  const pool = await sql.connect({
    server: "localhost",
    database: "Omega",
    user: "sa",
    password: "omega",
    options: {
      instanceName: "SQLEXPRESS",
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  });
  const b = await pool.request().query("SELECT TOP 3 Kode, Keterangan FROM dbo.Barang ORDER BY Kode");
  const s = await pool.request().query("SELECT TOP 3 Brg, Satuan FROM dbo.Satuan ORDER BY Brg");
  const h = await pool.request().query("SELECT TOP 3 Brg, Rasio, HrgJual FROM dbo.BrgPrice ORDER BY Brg");
  console.log("Barang:", JSON.stringify(b.recordset));
  console.log("Satuan:", JSON.stringify(s.recordset));
  console.log("Harga :", JSON.stringify(h.recordset));
  await pool.close();
  process.exit(0);
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
