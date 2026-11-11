import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterPenjualan, masterPenjualanItem, kartuStok } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { getHargaJualMap, buatKodeNota } from "@/lib/penjualan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/penjualan?q=&page=&pageSize=&status=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const cabang = (searchParams.get("cabang") || "").trim();
    const unreconciled = searchParams.get("unreconciled") === "1";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(Number(searchParams.get("pageSize") || 20), 200));
    const all = searchParams.get("all") === "1";

    const conds = [];
    if (q) {
      conds.push(sql`(${masterPenjualan.code}::text ILIKE ${"%" + q + "%"} OR ${masterPenjualan.kodeNota} ILIKE ${"%" + q + "%"} OR ${masterPenjualan.keterangan} ILIKE ${"%" + q + "%"} OR ${masterPenjualan.gudang} ILIKE ${"%" + q + "%"} OR ${masterPenjualan.pelangganNama} ILIKE ${"%" + q + "%"})`);
    }
    if (status) conds.push(eq(masterPenjualan.status, status));
    if (cabang && cabang !== "%") conds.push(eq(masterPenjualan.cabang, cabang));
    if (unreconciled) {
      conds.push(sql`NOT EXISTS (SELECT 1 FROM kartu_stok ks WHERE ks.penjualan_id = ${masterPenjualan.id} AND ks.is_void = 0)`);
    }
    const where = conds.length ? and(...conds) : undefined;

    const countRows = await db.select({ total: sql<number>`COUNT(*)::int` }).from(masterPenjualan).where(where);
    const headers = all
      ? await db.select().from(masterPenjualan).where(where).orderBy(desc(masterPenjualan.id))
      : await db.select().from(masterPenjualan).where(where).orderBy(desc(masterPenjualan.id)).limit(pageSize).offset((page - 1) * pageSize);

    const enriched = await Promise.all(
      headers.map(async (h) => {
        const items = await db.select({ c: sql<number>`COUNT(*)::int` }).from(masterPenjualanItem).where(eq(masterPenjualanItem.penjualanId, h.id));
        return { ...h, itemCount: Number(items[0]?.c || 0) };
      })
    );

    return NextResponse.json({ rows: enriched, total: Number(countRows[0]?.total || 0), page, pageSize });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat data penjualan" }, { status: 500 });
  }
}

// POST /api/penjualan — buat baru (harga diambil dari Omega saat simpan pertama)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = await getCurrentUserServer();
    const gudang = String(body.gudang || "").trim();
    if (!gudang) return NextResponse.json({ error: "Gudang wajib dipilih" }, { status: 400 });
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: "Detail barang wajib diisi" }, { status: 400 });

    // validasi barang + ambil harga dari Omega (snapshot saat simpan)
    const kodes = items.map((it: any) => String(it.brgKode || "").trim()).filter(Boolean);
    const { map, errors } = await getHargaJualMap(kodes);
    if (errors.length) return NextResponse.json({ error: errors.map((e) => e.pesan).join("; "), errors }, { status: 400 });

    const tgl = body.tgl ? new Date(body.tgl) : new Date();
    const cabang = String(body.cabang || "00001/01").trim();

    // urutan code global + urutan nota per bulan
    const [last] = await db.select({ code: masterPenjualan.code }).from(masterPenjualan).orderBy(desc(masterPenjualan.code)).limit(1);
    const nextCode = (last?.code || 0) + 1;
    const yyyymm = `${tgl.getFullYear()}${String(tgl.getMonth() + 1).padStart(2, "0")}`;
    // hitung urut nota bulan ini dari semua kode nota
    const allNota = await db.select({ n: masterPenjualan.kodeNota }).from(masterPenjualan);
    let maxUrutBulan = 0;
    for (const r of allNota) {
      const parts = String(r.n || "").split("/");
      if (parts[3] === yyyymm) maxUrutBulan = Math.max(maxUrutBulan, Number(parts[4] || 0) || 0);
    }
    const urutBulan = maxUrutBulan + 1;
    const kodeNota = buatKodeNota(cabang, tgl, urutBulan);

    const itemsWithHarga = items.map((it: any, idx: number) => {
      const meta = map[String(it.brgKode || "").trim()]!;
      const jml = Number(it.jml || 0);
      if (!jml || jml <= 0) throw new Error(`Qty baris ${idx + 1} harus lebih dari 0`);
      return {
        brgKode: String(it.brgKode || "").trim(),
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
    const total = itemsWithHarga.reduce((s: number, it: any) => s + Number(it.subtotal), 0);

    const created = await db.transaction(async (tx) => {
      const [header] = await tx.insert(masterPenjualan).values({
        code: nextCode,
        kodeNota,
        tgl,
        cabang,
        gudang,
        pelangganKode: body.pelangganKode || null,
        pelangganNama: body.pelangganNama || null,
        keterangan: body.keterangan || null,
        total: String(total),
        status: "POSTED",
        userCreate: user?.id ?? null,
        userEdit: user?.id ?? null,
      }).returning({ id: masterPenjualan.id, code: masterPenjualan.code, kodeNota: masterPenjualan.kodeNota });

      await tx.insert(masterPenjualanItem).values(itemsWithHarga.map((it: any) => ({ ...it, penjualanId: header.id })));
      return header;
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal menyimpan penjualan" }, { status: 500 });
  }
}
