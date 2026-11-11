import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterPenjualan, masterPenjualanItem } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { getHargaJualMap, buatKodeNota } from "@/lib/penjualan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/penjualan/import — import Excel (Kode Barang + Qty), langsung POSTED.
// form-data: file (.xlsx/.xls), tgl (2026-09-01), gudang, pelangganNama, keterangan (opsional)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "File Excel wajib dipilih" }, { status: 400 });

    const gudang = String(form.get("gudang") || "").trim();
    if (!gudang) return NextResponse.json({ error: "Gudang wajib dipilih" }, { status: 400 });

    const tgl = form.get("tgl") ? new Date(String(form.get("tgl"))) : new Date();
    const cabang = String(form.get("cabang") || "00001/01").trim();
    const pelangganNama = form.get("pelangganNama") ? String(form.get("pelangganNama")) : null;
    const pelangganKode = form.get("pelangganKode") ? String(form.get("pelangganKode")) : null;
    const keterangan = form.get("keterangan") ? String(form.get("keterangan")) : null;

    const buf = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" }) as Record<string, any>[];
    if (!json.length) return NextResponse.json({ error: "Sheet Excel kosong" }, { status: 400 });

    const pick = (r: Record<string, any>, ...names: string[]) => {
      const keys = Object.keys(r);
      for (const n of names) {
        const k = keys.find((x) => x.trim().toLowerCase() === n.toLowerCase());
        if (k && String(r[k]).trim() !== "") return String(r[k]).trim();
      }
      return "";
    };

    type Baris = { baris: number; kode: string; qty: number };
    const barisList: Baris[] = [];
    const gagalParse: { baris: number; pesan: string }[] = [];
    json.forEach((r, idx) => {
      const kode = pick(r, "Kode Barang", "Kode", "kode barang", "kode");
      const qtyRaw = pick(r, "Qty", "qty", "Jml", "Jumlah");
      const qty = Number(qtyRaw);
      const rowNum = idx + 2;
      if (!kode || !(qty > 0)) {
        gagalParse.push({ baris: rowNum, pesan: `Kode/Qty tidak valid (Kode="${kode}", Qty="${qtyRaw}")` });
        return;
      }
      barisList.push({ baris: rowNum, kode, qty });
    });

    if (!barisList.length) {
      return NextResponse.json({ error: "Tidak ada baris valid di file", errors: gagalParse }, { status: 400 });
    }

    const kodes = Array.from(new Set(barisList.map((b) => b.kode)));
    const { map, errors } = await getHargaJualMap(kodes);
    const gagal: { baris: number; pesan: string }[] = [...gagalParse];
    const valid: { baris: number; kode: string; qty: number }[] = [];
    for (const b of barisList) {
      if (map[b.kode]) valid.push(b);
      else {
        const e = errors.find((x) => x.kode === b.kode);
        gagal.push({ baris: b.baris, pesan: e ? e.pesan : `Kode ${b.kode} tidak bisa dipakai` });
      }
    }
    if (!valid.length) {
      return NextResponse.json({ error: "Semua baris gagal divalidasi", errors: gagal }, { status: 400 });
    }

    const [last] = await db.select({ code: masterPenjualan.code }).from(masterPenjualan).orderBy(desc(masterPenjualan.code)).limit(1);
    const nextCode = (last?.code || 0) + 1;
    const allNota = await db.select({ n: masterPenjualan.kodeNota }).from(masterPenjualan);
    let maxUrutBulan = 0;
    for (const r of allNota) {
      const parts = String(r.n || "").split("/");
      if (parts[3] === `${tgl.getFullYear()}${String(tgl.getMonth() + 1).padStart(2, "0")}`) maxUrutBulan = Math.max(maxUrutBulan, Number(parts[4] || 0) || 0);
    }
    const kodeNota = buatKodeNota(cabang, tgl, maxUrutBulan + 1);

    const itemsWithHarga = valid.map((b, idx) => {
      const meta = map[b.kode];
      return {
        brgKode: b.kode,
        brgNama: meta.nama,
        gudang,
        jml: String(b.qty),
        rasio: String(meta.rasio || 1),
        satuan: meta.satuan,
        hrgSatuan: String(meta.harga || 0),
        subtotal: String(Math.round(b.qty * (meta.harga || 0) * 100) / 100),
        keterangan: null,
        urutan: idx + 1,
      };
    });
    const total = itemsWithHarga.reduce((s, it) => s + Number(it.subtotal), 0);

    const created = await db.transaction(async (tx) => {
      const [header] = await tx.insert(masterPenjualan).values({
        code: nextCode,
        kodeNota,
        tgl,
        cabang,
        gudang,
        pelangganKode,
        pelangganNama,
        keterangan,
        total: String(total),
        status: "POSTED",
        userCreate: user?.id ?? null,
        userEdit: user?.id ?? null,
      }).returning({ id: masterPenjualan.id, code: masterPenjualan.code, kodeNota: masterPenjualan.kodeNota });

      await tx.insert(masterPenjualanItem).values(itemsWithHarga.map((it) => ({ ...it, penjualanId: header.id })));
      return header;
    });

    return NextResponse.json({
      success: true,
      ...created,
      imported: valid.length,
      totalRows: barisList.length,
      errors: gagal,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal import penjualan" }, { status: 500 });
  }
}
