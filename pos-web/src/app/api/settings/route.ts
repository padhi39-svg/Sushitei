import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterUsers, masterLevelManager, levelPermissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserBySessionToken } from "@/lib/auth";
import { getGeneralSettings, saveGeneralSettings } from "@/lib/settings-server";
import { GENERAL_SETTING_FIELDS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cek apakah user punya izin pada sebuah menu.
 * ADMIN/SUPERADMIN = akses penuh.
 */
async function hasPermission(userId: number, menuCode: string, permissionCode: string): Promise<boolean> {
  const [u] = await db
    .select()
    .from(masterUsers)
    .where(and(eq(masterUsers.id, userId), eq(masterUsers.isdelete, 0)))
    .limit(1);
  if (!u) return false;

  const levelId = (u as any).levelId ?? null;
  if (!levelId) return false;

  const [lvl] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.id, levelId)).limit(1);
  const levelCode = lvl?.code?.toUpperCase() || "";
  if (levelCode === "ADMIN" || levelCode === "SUPERADMIN") return true;

  const [p] = await db
    .select()
    .from(levelPermissions)
    .where(
      and(
        eq(levelPermissions.levelId, levelId),
        eq(levelPermissions.menuCode, menuCode),
        eq(levelPermissions.permissionCode, permissionCode),
        eq(levelPermissions.allowed, 1)
      )
    )
    .limit(1);
  return !!p;
}

async function currentUser(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

/**
 * GET /api/settings
 * - ?public=1 -> hanya untuk halaman login, tanpa butuh login
 * - tanpa param -> untuk halaman Pengaturan Umum (butuh login)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isPublic = searchParams.get("public") === "1";

  if (!isPublic) {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getGeneralSettings();
  return NextResponse.json({ settings: data });
}

/**
 * POST /api/settings
 * Simpan pengaturan umum. Hak akses ditentukan Level Manager:
 * menu `setting_umum` dengan permission `EDIT` (ADMIN/SUPERADMIN otomatis boleh).
 */
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await hasPermission(user.id, "setting_umum", "EDIT");
  if (!allowed) {
    return NextResponse.json({ error: "Anda tidak punya izin mengubah Pengaturan Umum" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const incoming = body?.settings && typeof body.settings === "object" ? body.settings : body;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const payload: Record<string, string> = {};
  for (const key of GENERAL_SETTING_FIELDS) {
    if (key in (incoming as any)) payload[key] = String((incoming as any)[key] ?? "");
  }

  const res = await saveGeneralSettings(payload);
  const data = await getGeneralSettings();
  return NextResponse.json({ ok: true, saved: res.saved, settings: data });
}
