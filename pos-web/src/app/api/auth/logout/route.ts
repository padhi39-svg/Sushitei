import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  const token = cookies().get("session_token")?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token)).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set("session_token", "", { path: "/", maxAge: 0 });
  res.cookies.set("x-user-id", "", { path: "/", maxAge: 0 });
  res.cookies.set("x-cabang", "", { path: "/", maxAge: 0 });
  res.cookies.set("cabang_selected", "", { path: "/", maxAge: 0 });
  return res;
}
