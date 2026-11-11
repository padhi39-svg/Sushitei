import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kartuStok, kartuStokItem, masterPenjualan } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { computeKartuStokPreview } from "@/lib/kartu-stok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/kartu-stok?q=&page=&pageSize=&status=&cabang=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const cabang = (searchParams.get("cabang") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(Number(searchParams.get("pageSize") || 20), 200));

    const conds: any[] = [];
    if (q) {
      conds.push(sql`(${kartuStok.code}::text ILIKE ${"%" + q + "%"} OR ${kartuStok.kodeNota} ILIKE ${"%" + q + "%"} OR ${kartuStok.kodeNotaPenjualan} ILIKE ${"%" + q + "%"} OR ${kartuStok.gudang} ILIKE ${"%" + q + "%"})`);
    }
    if (status) conds.push(eq(kartuStok.status, status));
    if (cabang && cabang !== "%") conds.push(eq(kartuStok.cabang, cabang));

    const where = conds.length ? and(...conds) : undefined;
    const countRows = await db.select({ total: sql<number>`COUNT(*)::int` }).from(kartuStok).where(where);
    const headers = await db
      .select()
      .from(kartuStok)
      .where(where)
      .orderBy(desc(kartuStok.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // enrich with item count
    const enriched = await Promise.all(
      headers.map(async (h) => {
        const items = await db.select({ c: sql<number>`COUNT(*)::int` }).from(kartuStokItem).where(eq(kartuStokItem.kartuStokId, h.id));
        return { ...h, itemCount: Number(items[0]?.c || 0) };
      })
    );

    return NextResponse.json({ rows: enriched, total: Number(countRows[0]?.total || 0), page, pageSize });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat kartu stok" }, { status: 500 });
  }
}

// POST /api/kartu-stok
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    const body = await req.json().catch(() => ({}));
    const penjualanId = Number(body.penjualanId);
    if (!penjualanId) return NextResponse.json({ error: "Penjualan wajib dipilih" }, { status: 400 });

    // unique check
    const existing = await db.select().from(kartuStok).where(eq(kartuStok.penjualanId, penjualanId)).limit(1);
    if (existing.length && existing[0].isVoid === 0) {
      return NextResponse.json({ error: "Penjualan ini sudah memiliki rekonsiliasi" }, { status: 400 });
    }

    const [p] = await db.select().from(masterPenjualan).where(eq(masterPenjualan.id, penjualanId)).limit(1);
    if (!p) return NextResponse.json({ error: "Penjualan tidak ditemukan" }, { status: 404 });
    if (p.status !== "POSTED") return NextResponse.json({ error: "Penjualan harus berstatus POSTED" }, { status: 400 });

    // Nomor urut internal dan Kode Nota per cabang/bulan.
    const [last] = await db.select({ code: kartuStok.code }).from(kartuStok).orderBy(desc(kartuStok.code)).limit(1);
    const nextCode = (last?.code || 0) + 1;

    const tgl = body.tgl ? new Date(body.tgl) : new Date();
    const cabang = String(body.cabang || p.cabang || "").trim();
    const gudang = String(body.gudang || p.gudang || "").trim();
    const yyyymm = `${tgl.getFullYear()}${String(tgl.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `${cabang}/RPP/${yyyymm}/`;
    const existingNotas = await db.select({ kodeNota: kartuStok.kodeNota }).from(kartuStok);
    const nextMonthly = existingNotas.reduce((max, row) => {
      const nota = String(row.kodeNota || "");
      if (!nota.startsWith(prefix)) return max;
      const urut = Number(nota.slice(prefix.length));
      return Number.isFinite(urut) ? Math.max(max, urut) : max;
    }, 0) + 1;
    const kodeNota = `${prefix}${String(nextMonthly).padStart(4, "0")}`;
    const keterangan = body.keterangan || null;

    const inputItems = Array.isArray(body.items) ? body.items : [];

    // If no items provided, compute from preview
    let itemsToSave = inputItems;
    if (!itemsToSave.length) {
      const preview = await computeKartuStokPreview(penjualanId);
      if (!preview) return NextResponse.json({ error: "Gagal menghitung preview" }, { status: 500 });
      itemsToSave = preview.items.map((it, idx) => ({
        bahanKode: it.bahanKode,
        bahanNama: it.bahanNama,
        satuan: it.satuan,
        pemakaianLaporan: it.pemakaianLaporan,
        saldoAwal: it.saldoAwal,
        masuk: it.masuk,
        sisa: it.sisa,
        hpp: it.hpp,
        keterangan: "",
        urutan: idx + 1,
      }));
    }

    // Recompute aktual/selisih/totalHpp on server
    const normalized = itemsToSave.map((it: any, idx: number) => {
      const pemakaianLaporan = Number(it.pemakaianLaporan || 0);
      const saldoAwal = Number(it.saldoAwal || 0);
      const masuk = Number(it.masuk || 0);
      const sisa = Number(it.sisa || 0);
      const pemakaianAktual = saldoAwal + masuk - sisa;
      const selisih = pemakaianAktual - pemakaianLaporan;
      const hpp = Number(it.hpp || 0);
      return {
        bahanKode: String(it.bahanKode || "").trim(),
        bahanNama: it.bahanNama || null,
        satuan: it.satuan || null,
        pemakaianLaporan: String(pemakaianLaporan),
        saldoAwal: String(saldoAwal),
        masuk: String(masuk),
        sisa: String(sisa),
        pemakaianAktual: String(pemakaianAktual),
        selisih: String(selisih),
        hpp: String(hpp),
        totalHppLaporan: String(pemakaianLaporan * hpp),
        totalHppAktual: String(pemakaianAktual * hpp),
        totalHppSelisih: String(selisih * hpp),
        keterangan: it.keterangan || null,
        urutan: Number(it.urutan || idx + 1),
      };
    });

    const created = await db.transaction(async (tx) => {
      const [header] = await tx.insert(kartuStok).values({
        code: nextCode,
        kodeNota,
        tgl,
        cabang,
        penjualanId,
        kodeNotaPenjualan: p.kodeNota,
        gudang,
        keterangan,
        status: "POSTED",
        userCreate: user?.id ?? null,
        userEdit: user?.id ?? null,
      }).returning({ id: kartuStok.id, code: kartuStok.code, kodeNota: kartuStok.kodeNota });

      await tx.insert(kartuStokItem).values(normalized.map((it: any) => ({ ...it, kartuStokId: header.id })));
      return header;
    });

    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal menyimpan kartu stok" }, { status: 500 });
  }
}
