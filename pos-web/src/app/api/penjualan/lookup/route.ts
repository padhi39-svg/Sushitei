import { NextRequest, NextResponse } from "next/server";
import { queryMaster } from "@/lib/sqlserver";
import { getHargaJualMap } from "@/lib/penjualan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/penjualan/lookup?q= -> daftar Barang Jadi (Golongan=2) untuk dropdown
// GET /api/penjualan/lookup?brg=kode -> satu barang: nama + satuan terkecil + harga per terkecil (dari Omega)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brg = (searchParams.get("brg") || "").trim();
    if (brg) {
      const { map, errors } = await getHargaJualMap([brg]);
      if (errors.length) return NextResponse.json({ error: errors[0].pesan }, { status: 400 });
      return NextResponse.json({ meta: map[brg] });
    }
    const q = (searchParams.get("q") || "").trim();
    const rows = q
      ? await queryMaster(
          `SELECT TOP 200 b.Kode, b.Keterangan
           FROM dbo.Barang b
           WHERE b.Golongan = 2
             AND (b.Kode LIKE '%' + @q + '%' OR b.Keterangan LIKE '%' + @q + '%')
           ORDER BY b.Kode`,
          { q }
        )
      : await queryMaster(
          `SELECT TOP 200 b.Kode, b.Keterangan
           FROM dbo.Barang b
           WHERE b.Golongan = 2
           ORDER BY b.Kode`
        );
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat daftar barang" }, { status: 500 });
  }
}
