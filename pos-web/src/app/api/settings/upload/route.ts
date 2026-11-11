import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { masterUsers, masterLevelManager, levelPermissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserBySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

/** Sama seperti /api/settings: hanya ADMIN/SUPERADMIN atau level dengan izin EDIT */
async function canEditSettings(userId: number): Promise<boolean> {
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
        eq(levelPermissions.menuCode, "setting_umum"),
        eq(levelPermissions.permissionCode, "EDIT"),
        eq(levelPermissions.allowed, 1)
      )
    )
    .limit(1);
  return !!p;
}

/**
 * POST /api/settings/upload
 * Body: multipart/form-data dengan field `file` dan opsional `kind` (logo|background)
 * Simpan file ke public/uploads lalu kembalikan URL publiknya.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserBySessionToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await canEditSettings(user.id))) {
    return NextResponse.json({ error: "Anda tidak punya izin mengubah Pengaturan Umum" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as unknown as File | null;
  const kind = String(form?.get("kind") || "general");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Ukuran file maksimal 3 MB" }, { status: 400 });
  }

  const original = file.name || "upload";
  const ext = path.extname(original).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: "Format harus PNG/JPG/JPEG/WEBP/GIF/SVG" }, { status: 400 });
  }

  const prefix = kind === "logo" ? "logo" : kind === "background" ? "bg" : "setting";
  const fname = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, fname), buf);

  return NextResponse.json({ ok: true, url: `/uploads/${fname}` });
}

/** DELETE /api/settings/upload?path=/uploads/xxx -> hapus file lama */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserBySessionToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await canEditSettings(user.id))) {
    return NextResponse.json({ error: "Anda tidak punya izin mengubah Pengaturan Umum" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const p = String(searchParams.get("path") || "");
  if (!p.startsWith("/uploads/")) {
    return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
  }

  const fname = path.basename(p);
  const target = path.join(UPLOAD_DIR, fname);
  // pastikan file benar-benar di dalam UPLOAD_DIR
  if (!target.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
  }

  try {
    await fs.unlink(target);
  } catch {
    // file sudah tidak ada -> tetap sukses
  }
  return NextResponse.json({ ok: true });
}
