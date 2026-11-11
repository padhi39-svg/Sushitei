import { NextRequest, NextResponse } from "next/server";
import { getPenjualanRekap, getPenjualanDetail } from "@/lib/persediaan-penjualan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/laporan/persediaan-penjualan?mode=rekap|detail&tglAwal=&tglAkhir=&gudang=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "rekap";
    const tglAwal = searchParams.get("tglAwal") || "";
    const tglAkhir = searchParams.get("tglAkhir") || "";
    const gudang = searchParams.get("gudang") || "all";
    const cabang = searchParams.get("cabang") || "";

    if (!tglAwal || !tglAkhir) {
      return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 });
    }

    if (mode === "rekap") {
      const result = await getPenjualanRekap(tglAwal, tglAkhir, gudang, cabang);
      return NextResponse.json(result);
    } else {
      const result = await getPenjualanDetail(tglAwal, tglAkhir, gudang, cabang);
      return NextResponse.json(result);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat laporan pemakaian penjualan" }, { status: 500 });
  }
}
