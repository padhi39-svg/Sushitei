import { NextRequest, NextResponse } from "next/server";
import { getIngredientLookup } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ingredient/lookup?mode=jadi|bahan&q=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") === "bahan" ? "bahan" : "jadi";
    const q = (searchParams.get("q") || "").trim();
    const rows = await getIngredientLookup(mode, q);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat lookup barang" }, { status: 500 });
  }
}
