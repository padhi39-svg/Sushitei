import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings, masterUsers, masterLevelManager, levelPermissions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getUserBySessionToken } from "@/lib/auth";
import { listSqlDatabases, validateOmegaDb, resetSqlPool } from "@/lib/sqlserver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

async function isAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select().from(masterUsers).where(and(eq(masterUsers.id, userId), eq(masterUsers.isdelete, 0))).limit(1);
  if (!u) return false;
  const levelId = (u as any).levelId ?? null;
  if (!levelId) return false;
  const [lvl] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.id, levelId)).limit(1);
  const code = (lvl?.code || "").toUpperCase();
  return code === "ADMIN" || code === "SUPERADMIN";
}

export async function GET(req: NextRequest) {
  try {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({ error: "Sesi login tidak ditemukan. Silakan login kembali." }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Hanya admin yang dapat mengatur database." }, { status: 403 });

    const rows = await db.select().from(settings).where(eq(settings.settingKey, "mssql_database")).limit(1);
    const current = rows[0]?.settingValue?.trim() || process.env.MSSQL_DATABASE || "Omega";
    const databases = await listSqlDatabases();
    return NextResponse.json({ current, databases });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat daftar database SQL Server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({ error: "Sesi login tidak ditemukan. Silakan login kembali." }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Hanya admin yang dapat mengatur database." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dbName = String(body?.database || "").trim();
    if (!dbName) return NextResponse.json({ error: "Nama database wajib diisi" }, { status: 400 });

    const validation = await validateOmegaDb(dbName);
    if (!validation.valid) {
      const message = validation.missing?.length
        ? `Database tidak memiliki objek Omega: ${validation.missing.join(", ")}`
        : `Tidak dapat menggunakan database ${dbName}: ${validation.error || "schema Omega tidak valid"}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Simpan pilihan, lalu tutup pool lama agar request berikutnya memakai database baru.
    const existing = await db.select().from(settings).where(eq(settings.settingKey, "mssql_database")).limit(1);
    if (existing.length) {
      await db.update(settings).set({ settingValue: dbName, updatedAt: new Date() }).where(eq(settings.settingKey, "mssql_database"));
    } else {
      await db.insert(settings).values({ settingKey: "mssql_database", settingValue: dbName, settingGroup: "database", description: "Database SQL Server yang dibaca (master data)" });
    }

    await resetSqlPool();
    return NextResponse.json({ ok: true, database: dbName });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal menerapkan database SQL Server" }, { status: 500 });
  }
}
