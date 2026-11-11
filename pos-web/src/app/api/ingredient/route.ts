import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, ilike, or, desc, sql } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { enrichIngredientHeaders, resolveIngredientInput } from "@/lib/ingredient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ingredient?q=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(Number(searchParams.get("pageSize") || 10), 200));

    const conds = [eq(masterIngredient.isdelete, 0)];
    if (q) {
      conds.push(or(
        ilike(masterIngredient.code, `%${q}%`),
        ilike(masterIngredient.name, `%${q}%`),
        ilike(masterIngredient.barangKode, `%${q}%`)
      )!);
    }
    const where = and(...conds);

    const countRows = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(masterIngredient)
      .where(where);

    const headers = await db
      .select({
        id: masterIngredient.id,
        code: masterIngredient.code,
        barangKode: masterIngredient.barangKode,
        name: masterIngredient.name,
        portion: masterIngredient.portion,
        description: masterIngredient.description,
        aktif: masterIngredient.aktif,
        createdAt: masterIngredient.createdAt,
        updatedAt: masterIngredient.updatedAt,
      })
      .from(masterIngredient)
      .where(where)
      .orderBy(desc(masterIngredient.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const rows = await enrichIngredientHeaders(headers);
    return NextResponse.json({
      rows,
      total: Number(countRows[0]?.total || 0),
      page,
      pageSize,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat resep" }, { status: 500 });
  }
}

// POST /api/ingredient
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resolved = await resolveIngredientInput(body);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const data = resolved.data;

    const [dup] = await db
      .select({ id: masterIngredient.id })
      .from(masterIngredient)
      .where(and(eq(masterIngredient.barangKode, data.barangKode), eq(masterIngredient.isdelete, 0)))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        { error: `Resep untuk barang ${data.barangKode} sudah ada. Gunakan Edit untuk mengubah.` },
        { status: 409 }
      );
    }

    const user = await getCurrentUserServer();

    const created = await db.transaction(async (tx) => {
      const [header] = await tx
        .insert(masterIngredient)
        .values({
          barangKode: data.barangKode,
          name: data.name,
          portion: data.portion,
          description: data.description,
          aktif: data.aktif,
          userCreate: user?.id ?? null,
          userEdit: user?.id ?? null,
        })
        .returning({ id: masterIngredient.id, code: masterIngredient.code });

      await tx.insert(masterIngredientItem).values(
        data.items.map((it) => ({
          ingredientId: header.id,
          bahanKode: it.bahanKode,
          qty: String(it.qty),
          satuan: it.satuan,
          rasio: String(it.rasio),
          catatan: it.catatan,
          urutan: it.urutan,
        }))
      );

      return header;
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "23505") {
      return NextResponse.json(
        { error: "Resep untuk barang ini sudah ada (duplikat)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: e?.message || "Gagal menyimpan resep" }, { status: 500 });
  }
}
