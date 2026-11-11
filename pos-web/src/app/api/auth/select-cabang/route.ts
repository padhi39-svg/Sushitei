import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, masterUsers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserBySessionToken, getUserCabangs } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("session_token")?.value;
    if (!token) return NextResponse.json({ error: "Tidak ada session" }, { status: 401 });
    const user = await getUserBySessionToken(token);
    if (!user) return NextResponse.json({ error: "Session tidak valid" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cabang = String(body.cabang || "").trim();
    if (!cabang) return NextResponse.json({ error: "Cabang wajib dipilih" }, { status: 400 });

    const allowed = getUserCabangs(user);
    if (!allowed.includes(cabang) && !allowed.includes("%")) {
      return NextResponse.json({ error: "Cabang tidak diizinkan untuk user ini" }, { status: 403 });
    }

    await db.update(sessions).set({ cabang: cabang === "%" ? null : cabang }).where(eq(sessions.token, token));

    const res = NextResponse.json({ ok: true, cabang });
    res.cookies.set("x-cabang", cabang, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
    res.cookies.set("cabang_selected", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memilih cabang" }, { status: 500 });
  }
}
