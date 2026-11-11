import { NextRequest, NextResponse } from "next/server";
import { computeKartuStokPreview } from "@/lib/kartu-stok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const penjualanId = Number(searchParams.get("penjualanId") || 0);
    if (!penjualanId) return NextResponse.json({ error: "penjualanId wajib" }, { status: 400 });
    const preview = await computeKartuStokPreview(penjualanId);
    if (!preview) return NextResponse.json({ error: "Penjualan tidak ditemukan" }, { status: 404 });
    return NextResponse.json(preview);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat preview" }, { status: 500 });
  }
}