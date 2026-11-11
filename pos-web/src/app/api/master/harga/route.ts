import { NextRequest, NextResponse } from "next/server";
import { getHargaPage } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/master/harga?search=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 20);
    const result = await getHargaPage(search, page, pageSize);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal baca SQL Server" }, { status: 500 });
  }
}
