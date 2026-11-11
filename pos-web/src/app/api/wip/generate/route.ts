import { NextRequest, NextResponse } from "next/server";
import { queryMaster } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/wip/generate -> returns list of barang with Golongan=1 (Setengah Jadi)
export async function GET(req: NextRequest) {
  try {
    const rows = await queryMaster(
      `SELECT b.Kode, b.Keterangan, b.Golongan
       FROM dbo.Barang b
       WHERE b.Golongan = 1 AND b.Aktif = 1
       ORDER BY b.Keterangan`
    );

    // Enrich with satuan list from Omega.Satuan
    const enriched = await Promise.all(
      (rows as any[]).map(async (r) => {
        const satuanRows = await queryMaster(
          `SELECT Satuan, Rasio FROM dbo.Satuan WHERE Brg = @kode ORDER BY Rasio`,
          { kode: r.Kode }
        );
        return {
          brgKode: r.Kode,
          brgNama: r.Keterangan || "",
          satuanList: (satuanRows as any[]).map((s) => ({
            satuan: s.Satuan,
            rasio: Number(s.Rasio || 1),
          })),
          defaultSatuan: (satuanRows as any[])[0]?.Satuan || "",
          defaultRasio: Number((satuanRows as any[])[0]?.Rasio || 1),
        };
      })
    );

    return NextResponse.json({ rows: enriched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal generate data" }, { status: 500 });
  }
}
