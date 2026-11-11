import { NextResponse } from "next/server";
import { db } from "@/db";
import { masterIngredient, masterIngredientItem } from "@/db/schema";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getBarangMetaMap, type BarangMeta } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Batch lookup supaya aman terhadap batas parameter SQL Server (2100).
async function getMetaMapBatched(codes: string[]): Promise<Record<string, BarangMeta>> {
  const uniq = Array.from(new Set(codes.map((k) => String(k || "").trim()).filter(Boolean)));
  const out: Record<string, BarangMeta> = {};
  const BATCH = 500;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const part = await getBarangMetaMap(uniq.slice(i, i + BATCH));
    Object.assign(out, part);
  }
  return out;
}

// GET /api/laporan/daftar-ingredient
// Mengembalikan seluruh resep (tanpa pagination) + rincian bahan untuk laporan.
export async function GET() {
  try {
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
      .where(eq(masterIngredient.isdelete, 0))
      .orderBy(desc(masterIngredient.id));

    if (!headers.length) {
      return NextResponse.json({
        recipes: [],
        items: [],
        generatedAt: new Date().toISOString(),
      });
    }

    const ids = headers.map((h) => h.id);
    const detail = await db
      .select()
      .from(masterIngredientItem)
      .where(inArray(masterIngredientItem.ingredientId, ids))
      .orderBy(
        asc(masterIngredientItem.ingredientId),
        asc(masterIngredientItem.urutan),
        asc(masterIngredientItem.id)
      );

    const meta = await getMetaMapBatched([
      ...headers.map((h) => String(h.barangKode)),
      ...detail.map((it) => String(it.bahanKode)),
    ]);

    const headerById = new Map(headers.map((h) => [h.id, h]));
    const itemsByIngredient = new Map<number, typeof detail>();
    for (const it of detail) {
      const list = itemsByIngredient.get(it.ingredientId) || [];
      list.push(it);
      itemsByIngredient.set(it.ingredientId, list);
    }

    const recipes = headers.map((h) => {
      const list = itemsByIngredient.get(h.id) || [];
      const totalQty = list.reduce(
        (sum, it) => sum + Number(it.qty || 0) * Number(it.rasio || 1),
        0
      );
      return {
        id: h.id,
        code: h.code,
        barangKode: h.barangKode,
        barangNama: meta[String(h.barangKode)]?.nama || h.name || "",
        name: h.name,
        portion: Number(h.portion || 0),
        description: h.description || "",
        aktif: h.aktif,
        status: Number(h.aktif) === 1 ? "Aktif" : "Nonaktif",
        itemCount: list.length,
        totalQty,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
      };
    });

    const items = detail.map((it) => {
      const h = headerById.get(it.ingredientId);
      const qty = Number(it.qty || 0);
      const rasio = Number(it.rasio || 1);
      return {
        id: it.id,
        ingredientId: it.ingredientId,
        code: h?.code || "",
        barangKode: h?.barangKode || "",
        barangNama: h ? meta[String(h.barangKode)]?.nama || h.name || "" : "",
        name: h?.name || "",
        portion: Number(h?.portion || 0),
        aktif: h?.aktif ?? 0,
        status: Number(h?.aktif) === 1 ? "Aktif" : "Nonaktif",
        bahanKode: it.bahanKode,
        bahanNama: meta[String(it.bahanKode)]?.nama || "",
        qty,
        satuan: it.satuan,
        rasio,
        stokDasar: qty * rasio,
        catatan: it.catatan || "",
        urutan: it.urutan,
      };
    });

    return NextResponse.json({
      recipes,
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal memuat laporan daftar ingredient" },
      { status: 500 }
    );
  }
}
