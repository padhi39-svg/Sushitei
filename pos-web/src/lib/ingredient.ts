import { db } from "@/db";
import { masterIngredientItem } from "@/db/schema";
import { inArray, asc, eq } from "drizzle-orm";
import { masterUsers } from "@/db/schema";
import { getBarangMetaMap } from "@/lib/sqlserver";

// ============================================================
// Helper bersama untuk Master Ingredient (resep)
// ============================================================

export type ItemInput = {
  bahanKode?: string;
  qty?: any;
  satuan?: string;
  catatan?: string;
};

export type ResolvedItem = {
  bahanKode: string;
  qty: number;
  satuan: string;
  rasio: number;
  catatan: string | null;
  urutan: number;
};

export type ResolvedIngredient = {
  barangKode: string;
  name: string;
  portion: string;
  description: string | null;
  aktif: number;
  items: ResolvedItem[];
};

type ResolveError = { error: string; status: number };
type ResolveOk = { data: ResolvedIngredient };

// Validasi input form + resolusi satuan/rasio dari Omega (server-side, jangan percaya client)
export async function resolveIngredientInput(body: any): Promise<ResolveOk | ResolveError> {
  const barangKode = String(body?.barangKode || "").trim();
  const rawItems: ItemInput[] = Array.isArray(body?.items) ? body.items : [];

  if (!barangKode) return { error: "Barang (jadi / setengah jadi) wajib dipilih", status: 400 };
  if (!rawItems.length) return { error: "Minimal harus ada 1 bahan", status: 400 };

  const meta = await getBarangMetaMap([
    barangKode,
    ...rawItems.map((i) => String(i?.bahanKode || "").trim()),
  ]);

  const bj = meta[barangKode];
  if (!bj) return { error: `Barang "${barangKode}" tidak ditemukan di Omega`, status: 400 };
  if (![1, 2].includes(bj.golongan)) {
    return { error: `Barang "${barangKode}" bukan Barang Jadi / Setengah Jadi`, status: 400 };
  }

  const items: ResolvedItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i] || {};
    const bahanKode = String(it.bahanKode || "").trim();
    const qty = Number(it.qty);
    const satuan = String(it.satuan || "").trim();
    const m = meta[bahanKode];

    if (!bahanKode) return { error: `Bahan baris ${i + 1} belum dipilih`, status: 400 };
    if (!m) return { error: `Bahan "${bahanKode}" tidak ditemukan di Omega`, status: 400 };
    // Semua golongan boleh jadi bahan: 0=Bahan Baku, 1=Setengah Jadi, 2=Barang Jadi
    if (![0, 1, 2].includes(m.golongan)) {
      return { error: `Barang "${bahanKode}" tidak bisa dipakai sebagai bahan`, status: 400 };
    }
    if (!isFinite(qty) || qty <= 0) {
      return { error: `Qty baris ${i + 1} harus lebih dari 0`, status: 400 };
    }

    const unit = m.units.find((u) => u.satuan.toLowerCase() === satuan.toLowerCase());
    if (!unit) {
      return { error: `Satuan "${satuan}" tidak valid untuk bahan ${bahanKode}`, status: 400 };
    }

    const key = `${bahanKode}|${unit.satuan.toLowerCase()}`;
    if (seen.has(key)) {
      return { error: `Bahan ${bahanKode} dengan satuan ${unit.satuan} dipilih lebih dari sekali`, status: 400 };
    }
    seen.add(key);

    items.push({
      bahanKode,
      qty,
      satuan: unit.satuan,
      rasio: unit.rasio || 1,
      catatan: it.catatan ? String(it.catatan) : null,
      urutan: i + 1,
    });
  }

  const portionNum = Number(body?.portion);
  const portion = isFinite(portionNum) && portionNum > 0 ? portionNum : 1;

  return {
    data: {
      barangKode,
      name: String(body?.name || "").trim() || bj.nama || barangKode,
      portion: String(portion),
      description: body?.description ? String(body.description) : null,
      aktif: body?.aktif === false || body?.aktif === 0 || body?.aktif === "0" ? 0 : 1,
      items,
    },
  };
}

// Lengkapi header resep dengan nama barang, jumlah bahan, dan total HPP
export async function enrichIngredientHeaders(headers: any[]) {
  if (!headers.length) return [];

  const ids = headers.map((h) => Number(h.id));
  const items = await db
    .select()
    .from(masterIngredientItem)
    .where(inArray(masterIngredientItem.ingredientId, ids))
    .orderBy(asc(masterIngredientItem.ingredientId), asc(masterIngredientItem.urutan));

  const meta = await getBarangMetaMap([
    ...headers.map((h) => String(h.barangKode)),
    ...items.map((i) => String(i.bahanKode)),
  ]);

  const byIngredient = new Map<number, any[]>();
  for (const it of items) {
    const list = byIngredient.get(Number(it.ingredientId)) || [];
    list.push(it);
    byIngredient.set(Number(it.ingredientId), list);
  }

  return headers.map((h) => {
    const list = byIngredient.get(Number(h.id)) || [];
    const totalQty = list.reduce((sum, it) => {
      return sum + Number(it.qty || 0) * Number(it.rasio || 1);
    }, 0);

    return {
      ...h,
      barangNama: meta[String(h.barangKode)]?.nama || "",
      itemCount: list.length,
      totalQty,
    };
  });
}

// Detail 1 resep: header + item lengkap dengan nama & HPP live dari Omega
export async function enrichIngredientDetail(header: any) {
  const items = await db
    .select()
    .from(masterIngredientItem)
    .where(inArray(masterIngredientItem.ingredientId, [Number(header.id)]))
    .orderBy(asc(masterIngredientItem.urutan), asc(masterIngredientItem.id));

  const meta = await getBarangMetaMap([
    String(header.barangKode),
    ...items.map((i) => String(i.bahanKode)),
  ]);

  const enrichedItems = items.map((it) => {
    const m = meta[String(it.bahanKode)];
    const stokDasar = Number(it.qty || 0) * Number(it.rasio || 1);
    return {
      ...it,
      bahanNama: m?.nama || "",
      stokDasar,
    };
  });

  const totalQty = enrichedItems.reduce((s, it) => s + it.stokDasar, 0);

  // Lookup user names for audit info
  let userNameCreate = "";
  let userNameEdit = "";
  if (header.userCreate) {
    const [u] = await db.select({ name: masterUsers.name }).from(masterUsers).where(eq(masterUsers.id, header.userCreate)).limit(1);
    userNameCreate = u?.name || "";
  }
  if (header.userEdit && header.userEdit !== header.userCreate) {
    const [u] = await db.select({ name: masterUsers.name }).from(masterUsers).where(eq(masterUsers.id, header.userEdit)).limit(1);
    userNameEdit = u?.name || "";
  } else if (header.userEdit === header.userCreate) {
    userNameEdit = userNameCreate;
  }

  return {
    header: {
      ...header,
      barangNama: meta[String(header.barangKode)]?.nama || "",
      totalQty,
      userNameCreate,
      userNameEdit,
    },
    items: enrichedItems,
  };
}
