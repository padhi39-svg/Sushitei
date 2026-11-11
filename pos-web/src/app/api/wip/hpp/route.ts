import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterIngredient, masterIngredientItem } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { queryMaster } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/wip/hpp?brgKode=00001/WIP001&periode=202610
// Returns HPP per pcs for a WIP item based on its ingredients and the period's HPP
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brgKode = searchParams.get("brgKode") || "";
    const periodeStr = searchParams.get("periode") || "";

    if (!brgKode) {
      return NextResponse.json({ error: "brgKode wajib diisi" }, { status: 400 });
    }

    const periode = periodeStr ? Number(periodeStr) : 0;
    if (!periode) {
      return NextResponse.json({ error: "periode wajib diisi (YYYYMM)" }, { status: 400 });
    }

    // 1. Find ingredient (BOM) for this barang
    const [ingredient] = await db
      .select()
      .from(masterIngredient)
      .where(eq(masterIngredient.barangKode, brgKode))
      .limit(1);

    if (!ingredient) {
      return NextResponse.json({ hpp: 0, items: [], message: "Resep tidak ditemukan" });
    }

    // 2. Get ingredient items
    const items = await db
      .select()
      .from(masterIngredientItem)
      .where(eq(masterIngredientItem.ingredientId, ingredient.id))
      .orderBy(masterIngredientItem.urutan);

    if (items.length === 0) {
      return NextResponse.json({ hpp: 0, items: [], message: "Resep kosong" });
    }

    // 3. Calculate previous period (for fallback)
    const prevPeriode = periode % 100 === 1
      ? (Math.floor(periode / 100) - 1) * 100 + 12
      : periode - 1;

    // 4. For each ingredient item, get HPP from PeriodeHrgPokok
    const hppItems = await Promise.all(
      items.map(async (it) => {
        const bahanKode = it.bahanKode;
        const qty = Number(it.qty || 0);
        const rasio = Number(it.rasio || 1);
        const satuan = it.satuan;

        // Query HPP for current period
        const hppRows = await queryMaster(
          `SELECT TOP 1 p.HrgPokokAwal, p.HrgPokokAkhir
           FROM dbo.PeriodeHrgPokok p
           WHERE p.Brg = @brgKode AND p.Periode = @periode AND p.MataUang = 'IDR'`,
          { brgKode: bahanKode, periode }
        );
        let hppAwal = Number((hppRows[0] as any)?.HrgPokokAwal || 0);
        let hppAkhir = Number((hppRows[0] as any)?.HrgPokokAkhir || 0);

        // If current period has no data, try previous period
        if (hppAwal === 0 && hppAkhir === 0) {
          const prevRows = await queryMaster(
            `SELECT TOP 1 p.HrgPokokAwal, p.HrgPokokAkhir
             FROM dbo.PeriodeHrgPokok p
             WHERE p.Brg = @brgKode AND p.Periode = @periode AND p.MataUang = 'IDR'`,
            { brgKode: bahanKode, periode: prevPeriode }
          );
          hppAwal = Number((prevRows[0] as any)?.HrgPokokAwal || 0);
          hppAkhir = Number((prevRows[0] as any)?.HrgPokokAkhir || 0);
        }

        // HPP = Akhir if > 0, else Awal
        const hpp = hppAkhir > 0 ? hppAkhir : hppAwal;
        const subTotal = qty * rasio * hpp;

        return {
          bahanKode,
          qty,
          satuan,
          rasio,
          hppAwal,
          hppAkhir,
          hpp,
          subTotal,
        };
      })
    );

    const totalHpp = hppItems.reduce((s, it) => s + it.subTotal, 0);

    return NextResponse.json({
      brgKode,
      periode,
      prevPeriode,
      hpp: totalHpp,
      items: hppItems,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal menghitung HPP" }, { status: 500 });
  }
}
