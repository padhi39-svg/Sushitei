import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterWip, masterWipItem } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";
import { queryMaster } from "@/lib/sqlserver";
import { masterIngredient, masterIngredientItem } from "@/db/schema";

export const runtime = "nodejs";

// Helper: calculate HPP per pcs for a WIP item
async function calculateHpp(brgKode: string, periode: number): Promise<number> {
  try {
    const [ingredient] = await db
      .select()
      .from(masterIngredient)
      .where(eq(masterIngredient.barangKode, brgKode))
      .limit(1);
    if (!ingredient) return 0;

    const items = await db
      .select()
      .from(masterIngredientItem)
      .where(eq(masterIngredientItem.ingredientId, ingredient.id));
    if (items.length === 0) return 0;

    const prevPeriode = periode % 100 === 1
      ? (Math.floor(periode / 100) - 1) * 100 + 12
      : periode - 1;

    let totalHpp = 0;
    for (const it of items) {
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
  } catch {
    return 0;
  }
}
export const dynamic = "force-dynamic";

// GET /api/wip/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const [header] = await db.select().from(masterWip).where(eq(masterWip.id, id)).limit(1);
    if (!header) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });

    const items = await db
      .select()
      .from(masterWipItem)
      .where(eq(masterWipItem.wipId, id))
      .orderBy(masterWipItem.urutan);

    return NextResponse.json({ header, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat data" }, { status: 500 });
  }
}

// PUT /api/wip/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const body = await req.json();
    const user = await getCurrentUserServer();

    const gudang = String(body.gudang || "").trim();
    if (!gudang) {
      return NextResponse.json({ error: "Gudang wajib dipilih" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const tgl = body.tgl ? new Date(body.tgl) : new Date();
    const periode = Number(tgl.toISOString().slice(0, 4) + tgl.toISOString().slice(5, 7));

    // Calculate HPP for each item
    const itemsWithHpp = await Promise.all(
      items.map(async (it: any) => {
        const hppPerPcs = await calculateHpp(it.brgKode, periode);
        const qty = Number(it.jml || 0);
        const totalHpp = qty * hppPerPcs;
        return { ...it, hpp: hppPerPcs, totalHpp };
      })
    );

    const totalHpp = itemsWithHpp.reduce((s: number, it: any) => s + it.totalHpp, 0);

    await db.transaction(async (tx) => {
      await tx
        .update(masterWip)
        .set({
          tgl,
          cabang: body.cabang || undefined,
          gudang,
          keterangan: body.keterangan || null,
          total: String(body.total || 0),
          totalHpp: String(totalHpp),
          status: "POSTED",
          userEdit: user?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(masterWip.id, id));

      // Hapus item lama, insert baru
      await tx.delete(masterWipItem).where(eq(masterWipItem.wipId, id));
      if (itemsWithHpp.length > 0) {
        await tx.insert(masterWipItem).values(
          itemsWithHpp.map((it: any, idx: number) => ({
            wipId: id,
            brgKode: it.brgKode,
            brgNama: it.brgNama || null,
            gudang: it.gudang || gudang,
            jml: String(it.jml || 0),
            rasio: String(it.rasio || 1),
            satuan: it.satuan || "",
            hrgSatuan: String(it.hrgSatuan || 0),
            hpp: String(it.hpp || 0),
            totalHpp: String(it.totalHpp || 0),
            keterangan: it.keterangan || null,
            urutan: idx + 1,
          }))
        );
      }
    });

    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal mengupdate WIP" }, { status: 500 });
  }
}

// PATCH /api/wip/[id] -> void (batal) - data tetap tersimpan, is_void = 1
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

    const user = await getCurrentUserServer();
    const updated = await db
      .update(masterWip)
      .set({ isVoid: 1, status: "VOID", userEdit: user?.id ?? null, updatedAt: new Date() })
      .where(eq(masterWip.id, id))
      .returning({ id: masterWip.id });

    if (!updated.length) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal void WIP" }, { status: 500 });
  }
}

// DELETE dinonaktifkan - data tidak dihapus, hanya void
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ error: "Hapus dinonaktifkan. Gunakan Void/Batal." }, { status: 405 });
}
