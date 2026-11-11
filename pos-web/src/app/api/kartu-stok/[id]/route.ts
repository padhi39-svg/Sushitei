import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kartuStok, kartuStokItem } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUserServer } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    const [header] = await db.select().from(kartuStok).where(eq(kartuStok.id, id)).limit(1);
    if (!header) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
    const items = await db.select().from(kartuStokItem).where(eq(kartuStokItem.kartuStokId, id)).orderBy(kartuStokItem.urutan);
    return NextResponse.json({ header, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat" }, { status: 500 });
  }
}

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUserServer();
    const id = Number(params.id);
    const [row] = await db.update(kartuStok).set({ status: "VOID", isVoid: 1, userEdit: user?.id ?? null, updatedAt: new Date() }).where(eq(kartuStok.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal void" }, { status: 500 });
  }
}