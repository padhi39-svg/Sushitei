import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const [row] = await db.select().from(masterUsers).where(eq(masterUsers.id, Number(params.id)));
  if (!row) return NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
  const { passwordHash, ...safe } = row as any;
  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: any = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.email !== undefined) patch.email = String(body.email).trim().toLowerCase();
  if (body.level_id !== undefined || body.levelId !== undefined) patch.levelId = Number(body.level_id ?? body.levelId);
  if (body.cabang !== undefined) {
    patch.cabang = (Array.isArray(body.cabang) ? body.cabang : String(body.cabang || "").split(","))
      .map((value: unknown) => String(value).trim()).filter(Boolean).join(",") || null;
  }
  if (body.aktif !== undefined) { patch.aktif = body.aktif ? 1 : 0; patch.isActive = body.aktif ? 1 : 0; }
  if (body.password) {
    const salt = crypto.randomBytes(16).toString("hex");
    patch.passwordHash = `${salt}:${crypto.scryptSync(String(body.password), salt, 64).toString("hex")}`;
  }
  const [row] = await db.update(masterUsers).set(patch).where(eq(masterUsers.id, Number(params.id))).returning();
  return NextResponse.json(row);
}

// soft delete seperti referensi
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const [row] = await db.update(masterUsers).set({ isdelete: 1, aktif: 0 }).where(eq(masterUsers.id, Number(params.id))).returning();
  return NextResponse.json(row);
}
