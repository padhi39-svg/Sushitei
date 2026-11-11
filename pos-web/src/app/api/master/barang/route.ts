import { NextRequest, NextResponse } from "next/server";
import { getBarangPage, getBarangDetail, getSatuanByBarang, getHargaByBarang } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/master/barang?search=&page=&pageSize=   -> { rows, total, page, pageSize }
// GET /api/master/barang?kode=00001/184            -> detail + satuan + riwayat harga
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const kode = searchParams.get("kode") || "";

    if (kode) {
      const [barang, satuan, harga] = await Promise.all([
        getBarangDetail(kode),
        getSatuanByBarang(kode),
        getHargaByBarang(kode),
      ]);
      if (!barang) return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ barang, satuan, harga });
    }

    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 20);
    const result = await getBarangPage(search, page, pageSize);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal baca SQL Server" }, { status: 500 });
  }
}
