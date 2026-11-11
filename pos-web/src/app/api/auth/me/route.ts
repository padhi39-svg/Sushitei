import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { masterUsers, masterLevelManager, levelPermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserBySessionToken, getUserCabangs } from "@/lib/auth";
import { SYSTEM_MENUS } from "@/lib/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = cookies().get("session_token")?.value;
  if (!token) return NextResponse.json({ user: null });
  const user = await getUserBySessionToken(token);
  if (!user) return NextResponse.json({ user: null });

  let levelId: number | null = (user as any).levelId ?? null;
  let levelCode: string | null = null;
  if (levelId) {
    const [lvl] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.id, levelId)).limit(1);
    levelCode = lvl?.code || null;
  }
  let allowedPaths: string[] = ["/"];
  let permissions: any[] = [];
  if (levelId) {
    const rows = await db.select().from(levelPermissions).where(eq(levelPermissions.levelId, levelId));
    permissions = rows.map((r) => ({ menu_code: r.menuCode, permission_code: r.permissionCode, allowed: r.allowed }));
    const viewCodes = new Set(rows.filter((r) => r.permissionCode === "VIEW" && r.allowed === 1).map((r) => r.menuCode.toLowerCase()));
    // SUPERADMIN/ADMIN full access
    if (levelCode === "ADMIN" || levelCode === "SUPERADMIN") allowedPaths = ["/"];
    else {
      allowedPaths = SYSTEM_MENUS.filter((m) => viewCodes.has(m.code.toLowerCase())).map((m) => m.path);
      if (!allowedPaths.length) allowedPaths = ["/dashboard"];
    }
  } else {
    allowedPaths = ["/dashboard"];
  }

  const allowedCabangs = getUserCabangs(user);
  const sessionCabang = (user as any).selectedCabang || null;
  const cabangSelectionRequired = allowedCabangs.length > 1 && !sessionCabang;
  const selectedCabang = sessionCabang || allowedCabangs[0] || "%";
  return NextResponse.json({
    user: {
      id: user.id, name: user.name, email: user.email,
      code: (user as any).code, levelId, levelCode, allowedPaths, permissions,
      cabang: selectedCabang,
      cabangs: allowedCabangs,
      cabangSelectionRequired,
    },
  });
}
