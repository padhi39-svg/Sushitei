import { NextResponse } from "next/server";
import { queryMaster } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Kategori menyimpan kode sekaligus nama cabang pada master Omega.
    const rows = await queryMaster<{ Kode: string; Nama: string }>(`
      SELECT LTRIM(RTRIM(Cabang)) AS Kode,
             MAX(LTRIM(RTRIM(NamaCabang))) AS Nama
      FROM dbo.Kategori
      WHERE Cabang IS NOT NULL AND LTRIM(RTRIM(Cabang)) <> ''
      GROUP BY LTRIM(RTRIM(Cabang))
      ORDER BY LTRIM(RTRIM(Cabang))
    `);
    return NextResponse.json({ rows: rows.map((row) => ({
      kode: String(row.Kode || "").trim(),
      nama: String(row.Nama || "").trim() || String(row.Kode || "").trim(),
    })).filter((row) => row.kode) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Gagal memuat daftar cabang dari Omega" }, { status: 500 });
  }
}
