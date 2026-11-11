import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterPenjualan, masterPenjualanItem } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/penjualan/[id] — baca dari Postgres (snapshot, tidak ke Omega)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    const [header] = await db.select().from(masterPenjualan).where(eq(masterPenjualan.id, id)).limit(1);
    if (!header) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    const items = await db.select().from(masterPenjualanItem).where(eq(masterPenjualanItem.penjualanId, id)).orderBy(masterPenjualanItem.urutan);
    return NextResponse.json({ header, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat data" }, { status: 500 });
  }
}

// PUT /api/penjualan/[id] — edit (hanya boleh POSTED yang belum void; harga tetap snapshot lama, TIDAK ditarik ulang)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    const body = await req.json();
    const user = await getCurrentUserServer();
    const gudang = String(body.gudang || "").trim();
    if (!gudang) return NextResponse.json({ error: "Gudang wajib dipilih" }, { status: 400 });
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: "Detail barang wajib diisi" }, { status: 400 });

    const [existing] = await db.select().from(masterPenjualan).where(eq(masterPenjualan.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    if (existing.status === "VOID" || Number(existing.isVoid) === 1) return NextResponse.json({ error: "Transaksi void tidak bisa diedit" }, { status: 400 });

    // Baris lama yang sudah ada: pakai snapshot lama. Baris baru (brgKode belum ada): ambil dari Omega.
    const oldItems = await db.select().from(masterPenjualanItem).where(eq(masterPenjualanItem.penjualanId, id));
    const oldByKode: Record<string, any> = {};
    for (const o of oldItems as any[]) oldByKode[o.brgKode] = o;

    const { getHargaJualMap } = await import("@/lib/penjualan");
    const baru = items.filter((it: any) => !oldByKode[String(it.brgKode || "").trim()]);
    const kodesBaru = baru.map((it: any) => String(it.brgKode || "").trim()).filter(Boolean);
    const { map } = await getHargaJualMap(kodesBaru);

    const built = items.map((it: any, idx: number) => {
      const kode = String(it.brgKode || "").trim();
      const old = oldByKode[kode];
      const jml = Number(it.jml || 0);
      if (!jml || jml <= 0) throw new Error(`Qty baris ${idx + 1} harus lebih dari 0`);
      if (old) {
        return {
          brgKode: kode,
          brgNama: old.brgNama,
          gudang: it.gudang || gudang,
          jml: String(jml),
          rasio: String(old.rasio || 1),
          satuan: old.satuan,
          hrgSatuan: String(old.hrgSatuan || 0),
          subtotal: String(Math.round(jml * Number(old.hrgSatuan || 0) * 100) / 100),
          keterangan: it.keterangan || null,
          urutan: idx + 1,
        };
      }
      const meta = map[kode];
      if (!meta) throw new Error(`Kode ${kode} belum ada harga jual di Omega`);
      return {
        brgKode: kode,
        brgNama: it.brgNama || meta.nama,
        gudang: it.gudang || gudang,
        jml: String(jml),
        rasio: String(meta.rasio || 1),
        satuan: meta.satuan,
        hrgSatuan: String(meta.harga || 0),
        subtotal: String(Math.round(jml * (meta.harga || 0) * 100) / 100),
        keterangan: it.keterangan || null,
        urutan: idx + 1,
      };
    });
    const total = built.reduce((s: number, it: any) => s + Number(it.subtotal), 0);

    await db.transaction(async (tx) => {
      await tx.update(masterPenjualan).set({
        tgl: body.tgl ? new Date(body.tgl) : existing.tgl,
        cabang: body.cabang || existing.cabang,
        gudang,
        pelangganKode: body.pelangganKode ?? existing.pelangganKode,
        pelangganNama: body.pelangganNama ?? existing.pelangganNama,
        keterangan: body.keterangan ?? existing.keterangan,
        total: String(total),
        userEdit: user?.id ?? null,
        updatedAt: new Date(),
      }).where(eq(masterPenjualan.id, id));

      await tx.delete(masterPenjualanItem).where(eq(masterPenjualanItem.penjualanId, id));
      await tx.insert(masterPenjualanItem).values(built.map((it: any) => ({ ...it, penjualanId: id })));
    });

    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal mengupdate penjualan" }, { status: 500 });
  }
}

// PATCH /api/penjualan/[id] — void (batal), data tetap tersimpan
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    const user = await getCurrentUserServer();
    const updated = await db.update(masterPenjualan)
      .set({ isVoid: 1, status: "VOID", userEdit: user?.id ?? null, updatedAt: new Date() })
      .where(eq(masterPenjualan.id, id))
      .returning({ id: masterPenjualan.id });
    if (!updated.length) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal void penjualan" }, { status: 500 });
  }
}
