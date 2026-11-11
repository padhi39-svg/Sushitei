import { NextRequest, NextResponse } from "next/server";
import { getWipRekap, getWipDetail } from "@/lib/persediaan-wip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/laporan/persediaan-wip?mode=rekap|detail&tglAwal=&tglAkhir=&gudang=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "rekap";
    const tglAwal = searchParams.get("tglAwal") || "2026-10-01";
    const tglAkhir = searchParams.get("tglAkhir") || "2026-10-31";
    const gudang = searchParams.get("gudang") || "all";
    const cabang = searchParams.get("cabang") || "";

    if (mode === "rekap") {
      const result = await getWipRekap(tglAwal, tglAkhir, gudang, cabang);
      return NextResponse.json(result);
    }

    if (mode === "detail") {
      const result = await getWipDetail(tglAwal, tglAkhir, gudang, cabang);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Mode tidak valid (rekap/detail)" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat laporan" }, { status: 500 });
  }
}
