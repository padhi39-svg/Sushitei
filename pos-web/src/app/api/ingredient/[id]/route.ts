import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { enrichIngredientDetail, resolveIngredientInput } from "@/lib/ingredient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// GET /api/ingredient/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const [header] = await db
      .select()
      .from(masterIngredient)
      .where(and(eq(masterIngredient.id, id), eq(masterIngredient.isdelete, 0)))
      .limit(1);

    if (!header) return NextResponse.json({ error: "Resep tidak ditemukan" }, { status: 404 });

    const detail = await enrichIngredientDetail(header);
    return NextResponse.json(detail);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat resep" }, { status: 500 });
  }
}

// PUT /api/ingredient/[id]  -> update header + ganti semua item
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const [existing] = await db
      .select({ id: masterIngredient.id })
      .from(masterIngredient)
      .where(and(eq(masterIngredient.id, id), eq(masterIngredient.isdelete, 0)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Resep tidak ditemukan" }, { status: 404 });

    const body = await req.json();
    const resolved = await resolveIngredientInput(body);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const data = resolved.data;

    const [dup] = await db
      .select({ id: masterIngredient.id })
      .from(masterIngredient)
      .where(and(
        eq(masterIngredient.barangKode, data.barangKode),
        eq(masterIngredient.isdelete, 0),
        ne(masterIngredient.id, id)
      ))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        { error: `Resep untuk barang ${data.barangKode} sudah ada.` },
        { status: 409 }
      );
    }

    const user = await getCurrentUserServer();

    await db.transaction(async (tx) => {
      await tx
        .update(masterIngredient)
        .set({
          barangKode: data.barangKode,
          name: data.name,
          portion: data.portion,
          description: data.description,
          aktif: data.aktif,
          userEdit: user?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(masterIngredient.id, id));

      await tx
        .delete(masterIngredientItem)
        .where(eq(masterIngredientItem.ingredientId, id));

      await tx.insert(masterIngredientItem).values(
        data.items.map((it) => ({
          ingredientId: id,
          bahanKode: it.bahanKode,
          qty: String(it.qty),
          satuan: it.satuan,
          rasio: String(it.rasio),
          catatan: it.catatan,
          urutan: it.urutan,
        }))
      );
    });

    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    if (e?.code === "23505") {
      return NextResponse.json({ error: "Resep untuk barang ini sudah ada (duplikat)." }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message || "Gagal menyimpan resep" }, { status: 500 });
  }
}

// DELETE dinonaktifkan - hanya aktif/nonaktif via PUT (aktif field)
