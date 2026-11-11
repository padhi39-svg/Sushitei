import sql from "mssql";
import { queryMaster, getSqlPool } from "@/lib/sqlserver";

/**
 * LAPORAN NERACA PERCOBAAN (Trial Balance)
 * - Hanya akun DETAIL/paling bawah (IsDetail = 1) — akun yang benar-benar
 *   punya Buku Besar (punya baris transaksi di PeriodeAkuntansi).
 * - Hanya golongan 1 (Aktiva), 2 (Kewajiban), 3 (Modal/Ekuitas) — sama
 *   seperti batas tampil neraca. Akun 4-7 (Pendapatan/HPP/Biaya/Lain)
 *   tidak ditampilkan karena laba/rugilah sudah di akun SALDO LABA (319...).
 * - Saldo ditampilkan sebagai kolom Debit / Kredit sesuai posisi saldo:
 *     Debit  = max(saldo tampil, 0)
 *     Kredit = max(-saldo tampil, 0)
 *   dengan saldo tampil = Sifat Debit ? SaldoAkhir : -SaldoAkhir
 *   (sama seperti aturan tanda di Laporan Neraca).
 * - Nilai ditampilkan apa adanya (belum direkalkulasi).
 */

export type TrialRow = {
  nomor: string;
  kode: string;
  nama: string;
  sifat: "Debit" | "Kredit";
  saldoAwal: number;
  debet: number;
  kredit: number;
  saldoAkhir: number;
  debitBal: number;
  kreditBal: number;
};

export async function getTrialBalanceRows(periode: number, cabang = "00001/01") {
  const branch = `${cabang}/`;
  const req = (await getSqlPool()).request();
  req.input("periode", sql.Decimal(18, 0), periode);
  req.input("branch", sql.VarChar(50), branch);
  const res = await req.query(`
    SELECT mp.Nomor, mp.Keterangan, mp.Sifat,
           ISNULL(pa.SaldoAwal, 0) AS SaldoAwal,
           ISNULL(pa.Debet, 0) AS Debet,
           ISNULL(pa.Kredit, 0) AS Kredit,
           ISNULL(pa.SaldoAkhir, 0) AS SaldoAkhir
    FROM dbo.MasterPerkiraan mp
    LEFT JOIN dbo.PeriodeAkuntansi pa
           ON pa.NoPerkiraan = mp.Nomor AND pa.Periode = @periode
    WHERE mp.Nomor LIKE @branch + '%'
      AND mp.IsDetail = 1
      AND SUBSTRING(mp.Nomor, 10, 1) IN ('1','2','3')
    ORDER BY mp.Nomor`);
  const rows = res.recordset as any[];
  return rows.map((r) => {
    const isDebit = !!r.Sifat;
    const awalRaw = Number(r.SaldoAwal || 0);
    const akhirRaw = Number(r.SaldoAkhir || 0);
    const dispAwal = isDebit ? awalRaw : -awalRaw;
    const dispAkhir = isDebit ? akhirRaw : -akhirRaw;
    return {
      nomor: String(r.Nomor),
      kode: String(r.Nomor).slice(9),
      nama: r.Keterangan || "",
      sifat: (isDebit ? "Debit" : "Kredit") as "Debit" | "Kredit",
      saldoAwal: dispAwal,
      debet: Number(r.Debet || 0),
      kredit: Number(r.Kredit || 0),
      saldoAkhir: dispAkhir,
      // Trial balance: kolom Debit/Kredit ditentukan tanda saldo mentahnya
      // (saldo debet -> kolom Debit, saldo kredit -> kolom Kredit, apa pun sifat akunnya)
      debitBal: Math.max(akhirRaw, 0),
      kreditBal: Math.max(-akhirRaw, 0),
    } satisfies TrialRow;
  });
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
