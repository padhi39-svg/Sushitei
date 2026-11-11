import { queryMaster } from "@/lib/sqlserver";
import { db } from "@/db";
import { masterWip, masterWipItem, masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";

export type WipRekapRow = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  totalQty: number;
  hpp: number;
  totalNilai: number;
};

export type WipDetailRow = {
  wipCode: number;
  tgl: string;
  gudang: string;
  keterangan: string | null;
  brgKode: string;
  brgNama: string;
  qtyWip: number;
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

export type WipRekapResult = {
  mode: "rekap";
  tglAwal: string;
  tglAkhir: string;
  rows: WipRekapRow[];
  totalNilai: number;
};

export type WipDetailResult = {
  mode: "detail";
  tglAwal: string;
  tglAkhir: string;
  rows: WipDetailRow[];
  totalHpp: number;
};

// Get HPP for a bahan baku from Omega DB for a given period
async function getHppBahan(bahanKode: string, periode: number): Promise<number> {
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

// Get ingredient (BOM) for a WIP item
async function getIngredient(brgKode: string) {
  const [ingredient] = await db
    .select()
    .from(masterIngredient)
    .where(eq(masterIngredient.barangKode, brgKode))
    .limit(1);
  if (!ingredient) return null;

  const items = await db
    .select()
    .from(masterIngredientItem)
    .where(eq(masterIngredientItem.ingredientId, ingredient.id))
    .orderBy(masterIngredientItem.urutan);

  return { ingredient, items };
}

export async function getWipRekap(tglAwal: string, tglAkhir: string, gudang?: string, cabang?: string): Promise<WipRekapResult> {
  // 1. Get WIP transactions + items
  const conds = [eq(masterWip.status, "POSTED")];
  if (gudang && gudang !== "all") {
    conds.push(eq(masterWip.gudang, gudang));
  }
  if (cabang && cabang !== "all" && cabang !== "%") {
    conds.push(eq(masterWip.cabang, cabang));
  }

  const wipRows = await db
    .select()
    .from(masterWip)
    .where(and(...conds))
    .orderBy(masterWip.tgl);

  // Filter by date range
  const filteredWip = wipRows.filter((w) => {
    const tgl = new Date(w.tgl).toISOString().slice(0, 10);
    return tgl >= tglAwal && tgl <= tglAkhir;
  });

  // 2. Collect all WIP items
  const allItems: { wipId: number; tgl: string; brgKode: string; jml: number }[] = [];
  for (const w of filteredWip) {
    const items = await db
      .select()
      .from(masterWipItem)
      .where(eq(masterWipItem.wipId, w.id));
    for (const it of items) {
      allItems.push({
        wipId: w.id,
        tgl: new Date(w.tgl).toISOString().slice(0, 10),
        brgKode: it.brgKode,
        jml: Number(it.jml || 0),
      });
    }
  }

  // 3. For each WIP item, get ingredient (BOM) and calculate bahan baku usage
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
        // Get bahan name from Omega
        const barangRows = await queryMaster(
          `SELECT Keterangan FROM dbo.Barang WHERE Kode = @kode`,
          { kode: bahanKode }
        );
        const bahanNama = (barangRows[0] as any)?.Keterangan || bahanKode;
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
      // Update HPP to latest (use the last one, or average - we'll use the last)
      entry.hpp = hpp;
    }
  }

  const rows: WipRekapRow[] = Array.from(bahanMap.values()).sort((a, b) => a.bahanKode.localeCompare(b.bahanKode));
  const totalNilai = rows.reduce((s, r) => s + r.totalNilai, 0);

  return {
    mode: "rekap",
    tglAwal,
    tglAkhir,
    rows,
    totalNilai,
  };
}

export async function getWipDetail(tglAwal: string, tglAkhir: string, gudang?: string, cabang?: string): Promise<WipDetailResult> {
  // 1. Get WIP transactions + items
  const conds = [eq(masterWip.status, "POSTED")];
  if (gudang && gudang !== "all") {
    conds.push(eq(masterWip.gudang, gudang));
  }
  if (cabang && cabang !== "all" && cabang !== "%") {
    conds.push(eq(masterWip.cabang, cabang));
  }

  const wipRows = await db
    .select()
    .from(masterWip)
    .where(and(...conds))
    .orderBy(masterWip.tgl);

  const filteredWip = wipRows.filter((w) => {
    const tgl = new Date(w.tgl).toISOString().slice(0, 10);
    return tgl >= tglAwal && tgl <= tglAkhir;
  });

  // 2. For each WIP transaction, get items + ingredients + HPP
  const rows: WipDetailRow[] = [];
  let totalHpp = 0;

  for (const w of filteredWip) {
    const items = await db
      .select()
      .from(masterWipItem)
      .where(eq(masterWipItem.wipId, w.id))
      .orderBy(masterWipItem.urutan);

    for (const it of items) {
      const periode = Number(new Date(w.tgl).toISOString().slice(0, 4) + new Date(w.tgl).toISOString().slice(5, 7));
      const hppPerPcs = Number(it.hpp || 0) > 0 ? Number(it.hpp) : await calculateHppOnTheFly(it.brgKode, periode);
      const qtyWip = Number(it.jml || 0);
      const itemTotalHpp = qtyWip * hppPerPcs;
      totalHpp += itemTotalHpp;

      // Get ingredient (BOM)
      const ing = await getIngredient(it.brgKode);

      const bahan: WipDetailRow["bahan"] = [];
      if (ing && ing.items.length > 0) {
        for (const ingItem of ing.items) {
          const bahanKode = ingItem.bahanKode;
          const qtyBahan = Number(ingItem.qty || 0) * Number(ingItem.rasio || 1);
          const totalQtyBahan = qtyWip * qtyBahan;
          const hpp = await getHppBahan(bahanKode, periode);
          const subTotal = totalQtyBahan * hpp;

          // Get bahan name from Omega
          const barangRows = await queryMaster(
            `SELECT Keterangan FROM dbo.Barang WHERE Kode = @kode`,
            { kode: bahanKode }
          );
          const bahanNama = (barangRows[0] as any)?.Keterangan || bahanKode;

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

      rows.push({
        wipCode: w.code,
        tgl: new Date(w.tgl).toISOString().slice(0, 10),
        gudang: w.gudang,
        keterangan: w.keterangan,
        brgKode: it.brgKode,
        brgNama: it.brgNama || it.brgKode,
        qtyWip,
        hppPerPcs: hppPerPcs,
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

// Helper: calculate HPP on the fly (fallback if not stored)
async function calculateHppOnTheFly(brgKode: string, periode: number): Promise<number> {
  const ing = await getIngredient(brgKode);
  if (!ing || !ing.items.length) return 0;

  const prevPeriode = periode % 100 === 1
    ? (Math.floor(periode / 100) - 1) * 100 + 12
    : periode - 1;

  let totalHpp = 0;
  for (const it of ing.items) {
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
}
