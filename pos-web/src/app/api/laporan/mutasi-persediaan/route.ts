import { NextRequest, NextResponse } from "next/server";
import { getLaporanMutasiPersediaan, getListPeriode, getListGudang, getPeriodeTerakhir } from "@/lib/laporan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/laporan/mutasi-persediaan?periode=&gudang=&q=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "data";

    if (mode === "periode") {
      const rows = await getListPeriode();
      return NextResponse.json({ rows });
    }
    if (mode === "gudang") {
      const cabang = searchParams.get("cabang") || "";
      const rows = await getListGudang(cabang);
      return NextResponse.json({ rows });
    }

    const periode = Number(searchParams.get("periode") || 0) || (await getPeriodeTerakhir());
    const result = await getLaporanMutasiPersediaan({
      periode,
      gudang: searchParams.get("gudang") || "all",
      q: searchParams.get("q") || "",
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 50),
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat laporan" }, { status: 500 });
  }
}
