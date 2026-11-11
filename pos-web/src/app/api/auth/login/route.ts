import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { masterUsers, masterLevelManager } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { verifyPasswordHash, createSession, hashPassword, getUserCabangs } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ error: "Email dan Password wajib diisi" }, { status: 400 });

    // Auto seed admin default kalau belum ada user (sama seperti D:\pos)
    const cnt = await db.select({ c: sql<number>`COUNT(*)::int` }).from(masterUsers).where(eq(masterUsers.isdelete, 0));
    if (!cnt[0] || Number(cnt[0].c) === 0) {
      await db.insert(masterLevelManager).values({ code: "ADMIN", name: "Admin" }).onConflictDoNothing();
      const [lvl] = await db.select().from(masterLevelManager).where(eq(masterLevelManager.code, "ADMIN")).limit(1);
      const last = await db.select({ code: masterUsers.code }).from(masterUsers).orderBy(desc(masterUsers.id)).limit(1);
      let n = 1;
      const m = /(\d{6})$/.exec(last[0]?.code || "");
      if (m) n = parseInt(m[1], 10) + 1;
      await db.insert(masterUsers).values({
        code: `USR/${String(n).padStart(6, "0")}`,
        name: "Admin",
        levelId: lvl?.id || null,
        aktif: 1, isActive: 1, isdelete: 0,
        email: "admin@yopmail.com",
        passwordHash: hashPassword("123456"),
        cabang: "00001/01",
      });
    }

    const [user] = await db.select().from(masterUsers)
      .where(and(eq(masterUsers.email, email), eq(masterUsers.isdelete, 0), eq(masterUsers.aktif, 1))).limit(1);
    if (!user) return NextResponse.json({ error: "User tidak terdaftar" }, { status: 401 });
    if (!verifyPasswordHash(user.passwordHash, password)) return NextResponse.json({ error: "Password salah" }, { status: 401 });

    const cabangs = getUserCabangs(user);
    const defaultCabang = cabangs[0] || "%";
    const needCabangSelection = cabangs.length > 1;
    const ttlHours = 24;
    const { token } = await createSession(
      user.id,
      ttlHours,
      needCabangSelection || defaultCabang === "%" ? null : defaultCabang
    );
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email },
      cabang: needCabangSelection ? "" : defaultCabang,
      cabangs,
      needCabangSelection,
    });
    res.cookies.set("session_token", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * ttlHours });
    res.cookies.set("x-user-id", String(user.id), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * ttlHours });
    res.cookies.set("x-cabang", needCabangSelection ? "" : defaultCabang, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * ttlHours });
    res.cookies.set("cabang_selected", needCabangSelection ? "0" : "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * ttlHours });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal login" }, { status: 500 });
  }
}
