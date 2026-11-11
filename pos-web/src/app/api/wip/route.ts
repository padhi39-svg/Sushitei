import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterWip, masterWipItem, masterIngredient, masterIngredientItem } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { queryMaster } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper: calculate HPP per pcs for a WIP item based on its ingredient and period
async function calculateHpp(brgKode: string, periode: number): Promise<number> {
  try {
    // 1. Find ingredient (BOM)
    const [ingredient] = await db
      .select()
      .from(masterIngredient)
      .where(eq(masterIngredient.barangKode, brgKode))
      .limit(1);
    if (!ingredient) return 0;

    // 2. Get ingredient items
    const items = await db
      .select()
      .from(masterIngredientItem)
      .where(eq(masterIngredientItem.ingredientId, ingredient.id));
    if (items.length === 0) return 0;

    // 3. Previous period (for fallback)
    const prevPeriode = periode % 100 === 1
      ? (Math.floor(periode / 100) - 1) * 100 + 12
      : periode - 1;

    // 4. For each ingredient item, get HPP from PeriodeHrgPokok
    let totalHpp = 0;
    for (const it of items) {
      const bahanKode = it.bahanKode;
      const qty = Number(it.qty || 0);
      const rasio = Number(it.rasio || 1);

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

      const hpp = hppAkhir > 0 ? hppAkhir : hppAwal;
      totalHpp += qty * rasio * hpp;
    }

    return totalHpp;
  } catch {
    return 0;
  }
}

// GET /api/wip?q=&page=&pageSize=&status=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const cabang = (searchParams.get("cabang") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(Number(searchParams.get("pageSize") || 20), 200));
    const all = searchParams.get("all") === "1";

    const conds = [];
    if (q) {
      conds.push(sql`(${masterWip.code}::text ILIKE ${"%" + q + "%"} OR ${masterWip.keterangan} ILIKE ${"%" + q + "%"} OR ${masterWip.gudang} ILIKE ${"%" + q + "%"})`);
    }
    if (status) {
      conds.push(eq(masterWip.status, status));
    }
    if (cabang && cabang !== "%") {
      conds.push(eq(masterWip.cabang, cabang));
    }
    const where = conds.length ? and(...conds) : undefined;

    const countRows = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(masterWip)
      .where(where);

    const headers = all
      ? await db
          .select()
          .from(masterWip)
          .where(where)
          .orderBy(desc(masterWip.id))
      : await db
          .select()
          .from(masterWip)
          .where(where)
          .orderBy(desc(masterWip.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize);

    // Enrich with item count
    const enriched = await Promise.all(
      headers.map(async (h) => {
        const items = await db
          .select({ c: sql<number>`COUNT(*)::int` })
          .from(masterWipItem)
          .where(eq(masterWipItem.wipId, h.id));
        return { ...h, itemCount: Number(items[0]?.c || 0) };
      })
    );

    return NextResponse.json({
      rows: enriched,
      total: Number(countRows[0]?.total || 0),
      page,
      pageSize,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat data WIP" }, { status: 500 });
  }
}

// POST /api/wip
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = await getCurrentUserServer();

    const gudang = String(body.gudang || "").trim();
    if (!gudang) {
      return NextResponse.json({ error: "Gudang wajib dipilih" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Detail barang wajib diisi" }, { status: 400 });
    }

    // Auto-generate code: sequential number (1, 2, 3, ...)
    const [last] = await db
      .select({ code: masterWip.code })
      .from(masterWip)
      .orderBy(desc(masterWip.code))
      .limit(1);
    const nextCode = (last?.code || 0) + 1;

    const cabang = String(body.cabang || "00001/01").trim();
    const tgl = body.tgl ? new Date(body.tgl) : new Date();
    const tahun = tgl.getFullYear();
    const kodenota = `${cabang}/WIP/${tahun}/${String(nextCode).padStart(6, "0")}`;
    const periode = Number(tgl.toISOString().slice(0, 4) + tgl.toISOString().slice(5, 7));

    // Calculate HPP for each item before saving
    const itemsWithHpp = await Promise.all(
      items.map(async (it: any) => {
        const hppPerPcs = await calculateHpp(it.brgKode, periode);
        const qty = Number(it.jml || 0);
        const totalHpp = qty * hppPerPcs;
        return { ...it, hpp: hppPerPcs, totalHpp };
      })
    );

    const totalHpp = itemsWithHpp.reduce((s: number, it: any) => s + it.totalHpp, 0);

    const created = await db.transaction(async (tx) => {
      const [header] = await tx
        .insert(masterWip)
        .values({
          code: nextCode,
          kodenota,
          tgl,
          cabang,
          gudang,
          keterangan: body.keterangan || null,
          total: String(body.total || 0),
          totalHpp: String(totalHpp),
          status: "POSTED",
          userCreate: user?.id ?? null,
          userEdit: user?.id ?? null,
        })
        .returning({ id: masterWip.id, code: masterWip.code });

      await tx.insert(masterWipItem).values(
        itemsWithHpp.map((it: any, idx: number) => ({
          wipId: header.id,
          brgKode: it.brgKode,
          brgNama: it.brgNama || null,
          gudang: it.gudang || gudang,
          jml: String(it.jml || 0),
          rasio: String(it.rasio || 1),
          satuan: it.satuan || "",
          hrgSatuan: String(it.hrgSatuan || 0),
          hpp: String(it.hpp || 0),
          totalHpp: String(it.totalHpp || 0),
          keterangan: it.keterangan || null,
          urutan: idx + 1,
        }))
      );

      return header;
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal menyimpan WIP" }, { status: 500 });
  }
}
