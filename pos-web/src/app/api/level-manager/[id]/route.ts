import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterLevelManager, levelPermissions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [level] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.id, id));
  if (!level) return NextResponse.json({ error: "tidak ditemukan" }, { status: 404 });
  const perms = await db.select().from(levelPermissions).where(eq(levelPermissions.levelId, id));
  return NextResponse.json({ ...level, permissions: perms });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const patch: any = { updatedAt: new Date() };
  if (body.name) patch.name = String(body.name).trim();
  if (body.code) patch.code = String(body.code).trim().toUpperCase();
  await db.update(masterLevelManager).set(patch).where(eq(masterLevelManager.id, id));

  if (Array.isArray(body.permissions)) {
    // Ganti total matriks izin level ini (upsert sederhana: hapus lalu insert)
    await db.delete(levelPermissions).where(eq(levelPermissions.levelId, id));
    for (const p of body.permissions) {
      await db.insert(levelPermissions).values({
        levelId: id,
        menuCode: String(p.menu_code || ""),
        permissionCode: String(p.permission_code || ""),
        allowed: p.allowed ? 1 : 0,
      });
    }
  }
  const [level] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.id, id));
  return NextResponse.json(level);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const [row] = await db.update(masterLevelManager).set({ isdelete: 1 }).where(eq(masterLevelManager.id, Number(params.id))).returning();
  return NextResponse.json(row);
}
export const dynamic = "force-dynamic";
void sql;
void and;
