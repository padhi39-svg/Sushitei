import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterLevelManager, levelPermissions, masterPermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.max(1, Math.min(Number(searchParams.get("pageSize") || 10), 200));

  const base = db
    .select({
      id: masterLevelManager.id, code: masterLevelManager.code, name: masterLevelManager.name,
      permissionsCount: sql<number>`(SELECT COUNT(*)::int FROM level_permissions WHERE level_id = ${masterLevelManager.id} AND allowed = 1)`,
      createdAt: masterLevelManager.createdAt,
    })
    .from(masterLevelManager)
    .where(eq(masterLevelManager.isdelete, 0));

  if (all) {
    const rows = await base.orderBy(masterLevelManager.name);
    return NextResponse.json({ rows, total: rows.length, page: 1, pageSize: rows.length });
  }

  const countRows = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(masterLevelManager)
    .where(eq(masterLevelManager.isdelete, 0));

  const rows = await base
    .orderBy(masterLevelManager.name)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ rows, total: Number(countRows[0]?.total || 0), page, pageSize });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const permissions: any[] = Array.isArray(body.permissions) ? body.permissions : [];
  if (!code || !name) return NextResponse.json({ error: "Kode dan Nama wajib" }, { status: 400 });

  const [row] = await db.insert(masterLevelManager).values({ code, name }).returning();
  for (const p of permissions) {
    await db.insert(levelPermissions).values({
      levelId: row.id,
      menuCode: String(p.menu_code || ""),
      permissionCode: String(p.permission_code || ""),
      allowed: p.allowed ? 1 : 0,
    });
  }
  void masterPermissions;
  return NextResponse.json(row, { status: 201 });
}
