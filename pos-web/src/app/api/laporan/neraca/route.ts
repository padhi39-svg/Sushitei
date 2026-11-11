import { NextRequest, NextResponse } from "next/server";
import {
  getNeracaKonfigurasi,
  getNeracaRows,
  getPeriodeAkuntansiTerakhir,
  getPeriodeListAkuntansi,
  buildNeracaDisplay,
} from "@/lib/neraca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/laporan/neraca?periode=&cabang=&mode=periode
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "data";

    if (mode === "periode") {
      const rows = await getPeriodeListAkuntansi();
      return NextResponse.json({ rows });
    }

    const cabang = searchParams.get("cabang") || "00001/01";
    const periode =
      Number(searchParams.get("periode") || 0) || (await getPeriodeAkuntansiTerakhir());

    const konf = await getNeracaKonfigurasi(cabang);
    const raw = await getNeracaRows(periode, konf.cabang);
    const disp = buildNeracaDisplay(raw as any);

    // info periode (untuk header "Periode : SEPTEMBER 2026 (01/09/2026 s/d 30/09/2026)")
    const list = await getPeriodeListAkuntansi();
    const idx = list.findIndex((p: any) => Number(p.Kode) === periode);
    const info = list[idx] as any;
    const prevInfo = (list[idx + 1] || {}) as any;

    return NextResponse.json({
      periode,
      periodeInfo: {
        keterangan: info?.Keterangan || "",
        tglMulai: info?.TglMulai || null,
        tglAkhir: info?.TglAkhir || null,
        prevKeterangan: prevInfo?.Keterangan || "",
      },
      konfigurasi: konf,
      rows: disp.rows,
      totals: disp.totals,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat neraca" }, { status: 500 });
  }
}
