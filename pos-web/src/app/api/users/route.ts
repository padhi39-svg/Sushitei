import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterUsers, masterLevelManager } from "@/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("pageSize") || 10), 200));

  const conds = [eq(masterUsers.isdelete, 0)];
  if (q) {
    conds.push(or(
      ilike(masterUsers.code, `%${q}%`),
      ilike(masterUsers.name, `%${q}%`),
      ilike(masterUsers.email, `%${q}%`),
    )!);
  }
  const where = and(...conds);

  const countRows = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(masterUsers)
    .where(where);

  const rows = await db
    .select({
      id: masterUsers.id, code: masterUsers.code, name: masterUsers.name,
      levelId: masterUsers.levelId, levelName: masterLevelManager.name,
      aktif: masterUsers.aktif, email: masterUsers.email, cabang: masterUsers.cabang,
      createdAt: masterUsers.createdAt,
    })
    .from(masterUsers)
    .leftJoin(masterLevelManager, eq(masterLevelManager.id, masterUsers.levelId))
    .where(where)
    .orderBy(desc(masterUsers.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ rows, total: Number(countRows[0]?.total || 0), page, pageSize });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const levelId = Number(body.level_id ?? body.levelId ?? 0) || null;
  const password = String(body.password || "");
  if (!name || !levelId) return NextResponse.json({ error: "Nama dan Level wajib" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email wajib" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Password wajib untuk user baru" }, { status: 400 });

  const last = await db.select({ code: masterUsers.code }).from(masterUsers).orderBy(desc(masterUsers.id)).limit(1);
  let n = 0;
  const m = /USR\/(\d+)$/.exec(last[0]?.code || "");
  if (m) n = parseInt(m[1], 10);
  const code = `USR/${String(n + 1).padStart(6, "0")}`;

  const [row] = await db.insert(masterUsers).values({
    code, name, levelId, email, passwordHash: hashPassword(password),
    cabang: (Array.isArray(body.cabang) ? body.cabang : String(body.cabang || "").split(","))
      .map((value: unknown) => String(value).trim()).filter(Boolean).join(",") || null,
    aktif: body.aktif === false ? 0 : 1, isActive: body.aktif === false ? 0 : 1,
  }).returning();
  // allowedJenis disimpan terpisah di tabel user_barang_jenis (req body.allowedJenis = [1,2,3])
  return NextResponse.json(row, { status: 201 });
}
