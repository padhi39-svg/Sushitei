import { db } from "@/db";
import { kartuStok, kartuStokItem, masterPenjualan, masterPenjualanItem, masterIngredient, masterIngredientItem } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { queryMaster } from "@/lib/sqlserver";
import { getIngredient, getBahanNama, getHppBahan } from "@/lib/persediaan-penjualan";

export type KartuStokPreviewItem = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  pemakaianLaporan: number;
  saldoAwal: number | null;
  masuk: number;
  sisa: number | null;
  pemakaianAktual: number;
  selisih: number;
  hpp: number;
  totalHppLaporan: number;
  totalHppAktual: number;
  totalHppSelisih: number;
};

export type KartuStokPreview = {
  penjualan: { id: number; code: number; kodeNota: string; tgl: string; gudang: string; cabang: string };
  items: KartuStokPreviewItem[];
};

// Ambil sisa terakhir untuk bahan baku + gudang + cabang (transaksi sebelumnya)
export async function getLastSisa(bahanKode: string, gudang: string, cabang: string): Promise<number | null> {
  const rows = await db
    .select({ sisa: kartuStokItem.sisa })
    .from(kartuStokItem)
    .innerJoin(kartuStok, eq(kartuStok.id, kartuStokItem.kartuStokId))
    .where(
      and(
        eq(kartuStokItem.bahanKode, bahanKode),
        eq(kartuStok.gudang, gudang),
        eq(kartuStok.cabang, cabang),
        eq(kartuStok.isVoid, 0),
        eq(kartuStok.status, "POSTED")
      )
    )
    .orderBy(desc(kartuStok.tgl), desc(kartuStok.code), desc(kartuStokItem.id))
    .limit(1);
  if (!rows.length) return null;
  return Number(rows[0].sisa || 0);
}

export async function computeKartuStokPreview(penjualanId: number): Promise<KartuStokPreview | null> {
  const [p] = await db.select().from(masterPenjualan).where(eq(masterPenjualan.id, penjualanId)).limit(1);
  if (!p) return null;

  const items = await db
    .select()
    .from(masterPenjualanItem)
    .where(eq(masterPenjualanItem.penjualanId, p.id))
    .orderBy(masterPenjualanItem.urutan);

  const periode = Number(new Date(p.tgl).toISOString().slice(0, 4) + new Date(p.tgl).toISOString().slice(5, 7));

  // Aggregate bahan baku across all barang jadi in this penjualan
  const bahanMap = new Map<string, { bahanKode: string; bahanNama: string; satuan: string; qty: number }>();

  for (const it of items) {
    const ing = await getIngredient(it.brgKode);
    if (!ing || !ing.items.length) continue;
    const qtyJual = Number(it.jml || 0);
    for (const ingItem of ing.items) {
      const bahanKode = ingItem.bahanKode;
      const qtyBahan = Number(ingItem.qty || 0) * Number(ingItem.rasio || 1) * qtyJual;
      const satuan = ingItem.satuan;
      const bahanNama = await getBahanNama(bahanKode);
      if (!bahanMap.has(bahanKode)) {
        bahanMap.set(bahanKode, { bahanKode, bahanNama, satuan, qty: 0 });
      }
      const entry = bahanMap.get(bahanKode)!;
      entry.qty += qtyBahan;
      if (!entry.bahanNama) entry.bahanNama = bahanNama;
      if (!entry.satuan) entry.satuan = satuan;
    }
  }

  const resultItems: KartuStokPreviewItem[] = [];
  for (const entry of Array.from(bahanMap.values())) {
    const hpp = await getHppBahan(entry.bahanKode, periode);
    const saldoAwal = await getLastSisa(entry.bahanKode, p.gudang, p.cabang || "");
    const pemakaianLaporan = entry.qty;
    const masuk = 0;
    const sisa = null;
    const pemakaianAktual = (saldoAwal ?? 0) + masuk - (sisa ?? 0);
    const selisih = pemakaianAktual - pemakaianLaporan;
    resultItems.push({
      bahanKode: entry.bahanKode,
      bahanNama: entry.bahanNama,
      satuan: entry.satuan,
      pemakaianLaporan,
      saldoAwal: saldoAwal ?? 0,
      masuk,
      sisa: sisa ?? 0,
      pemakaianAktual,
      selisih,
      hpp,
      totalHppLaporan: pemakaianLaporan * hpp,
      totalHppAktual: pemakaianAktual * hpp,
      totalHppSelisih: selisih * hpp,
    });
  }

  return {
    penjualan: {
      id: p.id,
      code: p.code,
      kodeNota: p.kodeNota,
      tgl: new Date(p.tgl).toISOString().slice(0, 10),
      gudang: p.gudang,
      cabang: p.cabang || "",
    },
    items: resultItems,
  };
}