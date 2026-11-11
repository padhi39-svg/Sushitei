import { NextRequest, NextResponse } from "next/server";
import {
  getTrialBalanceRows,
  getPeriodeAkuntansiTerakhir,
  getPeriodeListAkuntansi,
} from "@/lib/trialBalance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/laporan/neraca-percobaan?periode=&cabang=&mode=periode
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

    const rows = await getTrialBalanceRows(periode, cabang);

    const totalDebit = rows.reduce((s, r) => s + r.debitBal, 0);
    const totalKredit = rows.reduce((s, r) => s + r.kreditBal, 0);
    const totalMutasiDebet = rows.reduce((s, r) => s + r.debet, 0);
    const totalMutasiKredit = rows.reduce((s, r) => s + r.kredit, 0);

    const list = await getPeriodeListAkuntansi();
    const idx = list.findIndex((p: any) => Number(p.Kode) === periode);
    const info = list[idx] as any;

    return NextResponse.json({
      periode,
      periodeInfo: {
        keterangan: info?.Keterangan || "",
        tglMulai: info?.TglMulai || null,
        tglAkhir: info?.TglAkhir || null,
      },
      rows,
      totals: {
        totalDebit,
        totalKredit,
        selisih: totalDebit - totalKredit,
        totalMutasiDebet,
        totalMutasiKredit,
        count: rows.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat neraca percobaan" }, { status: 500 });
  }
}
