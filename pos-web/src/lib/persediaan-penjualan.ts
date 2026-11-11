import { queryMaster } from "@/lib/sqlserver";
import { db } from "@/db";
import { masterPenjualan, masterPenjualanItem, masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";

export type PenjualanRekapRow = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  totalQty: number;
  hpp: number;
  totalNilai: number;
};

export type PenjualanDetailRow = {
  penjualanCode: number;
  kodeNota: string;
  tgl: string;
  gudang: string;
  keterangan: string | null;
  pelangganNama: string | null;
  brgKode: string; // barang jadi
  brgNama: string;
  qtyJual: number;
  hppPerPcs: number;
  totalHpp: number;
  bahan: {
    bahanKode: string;
    bahanNama: string;
    satuan: string;
    qty: number;
    hpp: number;
    subTotal: number;
  }[];
};

export type PenjualanRekapResult = {
  mode: "rekap";
  tglAwal: string;
  tglAkhir: string;
  rows: PenjualanRekapRow[];
  totalNilai: number;
};

export type PenjualanDetailResult = {
  mode: "detail";
  tglAwal: string;
  tglAkhir: string;
  rows: PenjualanDetailRow[];
  totalHpp: number;
};

// Get HPP for a bahan baku from Omega DB for a given period
export async function getHppBahan(bahanKode: string, periode: number): Promise<number> {
  try {
    const rows = await queryMaster(
      `SELECT TOP 1 p.HrgPokokAwal, p.HrgPokokAkhir
       FROM dbo.PeriodeHrgPokok p
       WHERE p.Brg = @brgKode AND p.Periode = @periode AND p.MataUang = 'IDR'`,
      { brgKode: bahanKode, periode }
    );
    const hppAwal = Number((rows[0] as any)?.HrgPokokAwal || 0);
    const hppAkhir = Number((rows[0] as any)?.HrgPokokAkhir || 0);

    if (hppAwal === 0 && hppAkhir === 0) {
      // Try previous period
      const prevPeriode = periode % 100 === 1
        ? (Math.floor(periode / 100) - 1) * 100 + 12
        : periode - 1;
      const prevRows = await queryMaster(
        `SELECT TOP 1 p.HrgPokokAwal, p.HrgPokokAkhir
         FROM dbo.PeriodeHrgPokok p
         WHERE p.Brg = @brgKode AND p.Periode = @periode AND p.MataUang = 'IDR'`,
        { brgKode: bahanKode, periode: prevPeriode }
      );
      const prevAwal = Number((prevRows[0] as any)?.HrgPokokAwal || 0);
      const prevAkhir = Number((prevRows[0] as any)?.HrgPokokAkhir || 0);
      return prevAkhir > 0 ? prevAkhir : prevAwal;
    }

    return hppAkhir > 0 ? hppAkhir : hppAwal;
  } catch {
    return 0;
  }
}

// Get ingredient (BOM) for a barang jadi
export async function getIngredient(barangKode: string) {
  const [ingredient] = await db
    .select()
    .from(masterIngredient)
    .where(eq(masterIngredient.barangKode, barangKode))
    .limit(1);
  if (!ingredient) return null;

  const items = await db
    .select()
    .from(masterIngredientItem)
    .where(eq(masterIngredientItem.ingredientId, ingredient.id))
    .orderBy(masterIngredientItem.urutan);

  return { ingredient, items };
}

// Ambil nama bahan baku dari Omega
export async function getBahanNama(bahanKode: string): Promise<string> {
  try {
    const rows = await queryMaster(
      `SELECT Keterangan FROM dbo.Barang WHERE Kode = @kode`,
      { kode: bahanKode }
    );
    return (rows[0] as any)?.Keterangan || bahanKode;
  } catch {
    return bahanKode;
  }
}

export async function getPenjualanRekap(tglAwal: string, tglAkhir: string, gudang?: string, cabang?: string): Promise<PenjualanRekapResult> {
  // 1. Get Penjualan transactions + items
  const conds = [eq(masterPenjualan.status, "POSTED")];
  if (gudang && gudang !== "all") {
    conds.push(eq(masterPenjualan.gudang, gudang));
  }
  if (cabang && cabang !== "all" && cabang !== "%") {
    conds.push(eq(masterPenjualan.cabang, cabang));
  }

  const penjualanRows = await db
    .select()
    .from(masterPenjualan)
    .where(and(...conds))
    .orderBy(masterPenjualan.tgl);

  // Filter by date range (tanggal transaksi dicek dengan periodenya)
  const filteredPenjualan = penjualanRows.filter((p) => {
    const tgl = new Date(p.tgl).toISOString().slice(0, 10);
    return tgl >= tglAwal && tgl <= tglAkhir;
  });

  // 2. Collect all Penjualan items (barang jadi)
  const allItems: { penjualanId: number; tgl: string; brgKode: string; jml: number }[] = [];
  for (const p of filteredPenjualan) {
    const items = await db
      .select()
      .from(masterPenjualanItem)
      .where(eq(masterPenjualanItem.penjualanId, p.id));
    for (const it of items) {
      allItems.push({
        penjualanId: p.id,
        tgl: new Date(p.tgl).toISOString().slice(0, 10),
        brgKode: it.brgKode,
        jml: Number(it.jml || 0),
      });
    }
  }

  // 3. For each Penjualan item, get ingredient (BOM) and calculate bahan baku usage
  const bahanMap = new Map<string, { bahanKode: string; bahanNama: string; satuan: string; totalQty: number; hpp: number; totalNilai: number }>();

  // Cache ingredients
  const ingredientCache = new Map<string, any>();

  for (const item of allItems) {
    if (!ingredientCache.has(item.brgKode)) {
      ingredientCache.set(item.brgKode, await getIngredient(item.brgKode));
    }
    const ing = ingredientCache.get(item.brgKode);
    if (!ing || !ing.items.length) continue;

    const periode = Number(item.tgl.slice(0, 4) + item.tgl.slice(5, 7));

    for (const ingItem of ing.items) {
      const bahanKode = ingItem.bahanKode;
      const qtyBahan = Number(ingItem.qty || 0) * Number(ingItem.rasio || 1);
      const totalQtyBahan = item.jml * qtyBahan;
      const hpp = await getHppBahan(bahanKode, periode);
      const totalNilai = totalQtyBahan * hpp;

      if (!bahanMap.has(bahanKode)) {
        const bahanNama = await getBahanNama(bahanKode);
        bahanMap.set(bahanKode, {
          bahanKode,
          bahanNama,
          satuan: ingItem.satuan,
          totalQty: 0,
          hpp,
          totalNilai: 0,
        });
      }

      const entry = bahanMap.get(bahanKode)!;
      entry.totalQty += totalQtyBahan;
      entry.totalNilai += totalNilai;
      entry.hpp = hpp;
    }
  }

  const rows: PenjualanRekapRow[] = Array.from(bahanMap.values()).sort((a, b) => a.bahanKode.localeCompare(b.bahanKode));
  const totalNilai = rows.reduce((s, r) => s + r.totalNilai, 0);

  return {
    mode: "rekap",
    tglAwal,
    tglAkhir,
    rows,
    totalNilai,
  };
}

export async function getPenjualanDetail(tglAwal: string, tglAkhir: string, gudang?: string, cabang?: string): Promise<PenjualanDetailResult> {
  // 1. Get Penjualan transactions + items
  const conds = [eq(masterPenjualan.status, "POSTED")];
  if (gudang && gudang !== "all") {
    conds.push(eq(masterPenjualan.gudang, gudang));
  }
  if (cabang && cabang !== "all" && cabang !== "%") {
    conds.push(eq(masterPenjualan.cabang, cabang));
  }

  const penjualanRows = await db
    .select()
    .from(masterPenjualan)
    .where(and(...conds))
    .orderBy(masterPenjualan.tgl);

  const filteredPenjualan = penjualanRows.filter((p) => {
    const tgl = new Date(p.tgl).toISOString().slice(0, 10);
    return tgl >= tglAwal && tgl <= tglAkhir;
  });

  // 2. For each Penjualan transaction, get items + ingredients + HPP
  const rows: PenjualanDetailRow[] = [];
  let totalHpp = 0;

  for (const p of filteredPenjualan) {
    const items = await db
      .select()
      .from(masterPenjualanItem)
      .where(eq(masterPenjualanItem.penjualanId, p.id))
      .orderBy(masterPenjualanItem.urutan);

    for (const it of items) {
      const periode = Number(new Date(p.tgl).toISOString().slice(0, 4) + new Date(p.tgl).toISOString().slice(5, 7));
      // Hitung HPP per pcs barang jadi dari resep
      const ing = await getIngredient(it.brgKode);

      let hppPerPcs = 0;
      const bahan: PenjualanDetailRow["bahan"] = [];

      if (ing && ing.items.length > 0) {
        for (const ingItem of ing.items) {
          const bahanKode = ingItem.bahanKode;
          const qtyBahan = Number(ingItem.qty || 0) * Number(ingItem.rasio || 1);
          const totalQtyBahan = Number(it.jml || 0) * qtyBahan;
          const hpp = await getHppBahan(bahanKode, periode);
          const subTotal = totalQtyBahan * hpp;
          hppPerPcs += qtyBahan * hpp; // HPP per pcs = sum qty per pcs * hpp bahan

          const bahanNama = await getBahanNama(bahanKode);

          bahan.push({
            bahanKode,
            bahanNama,
            satuan: ingItem.satuan,
            qty: totalQtyBahan,
            hpp,
            subTotal,
          });
        }
      }

      const qtyJual = Number(it.jml || 0);
      const itemTotalHpp = qtyJual * hppPerPcs;
      totalHpp += itemTotalHpp;

      rows.push({
        penjualanCode: p.code,
        kodeNota: p.kodeNota,
        tgl: new Date(p.tgl).toISOString().slice(0, 10),
        gudang: p.gudang,
        keterangan: p.keterangan,
        pelangganNama: p.pelangganNama || null,
        brgKode: it.brgKode,
        brgNama: it.brgNama || it.brgKode,
        qtyJual,
        hppPerPcs,
        totalHpp: itemTotalHpp,
        bahan,
      });
    }
  }

  return {
    mode: "detail",
    tglAwal,
    tglAkhir,
    rows,
    totalHpp,
  };
}
