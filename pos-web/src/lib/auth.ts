import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions, masterUsers } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(stored: string | null | undefined, password: string): boolean {
  if (!stored) return false;
  // Format kita: salt:hash (scrypt)
  const parts = stored.split(":");
  if (parts.length === 2) {
    const [salt, hash] = parts;
    try {
      const test = crypto.scryptSync(password, salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
    } catch { return false; }
  }
  // Format lama D:\pos: sha256:salt:hash
  if (parts.length === 3 && parts[0] === "sha256") {
    const [, salt, hash] = parts;
    const test = crypto.createHash("sha256").update(salt + password).digest("hex");
    try { return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash)); } catch { return false; }
  }
  return false;
}

export async function createSession(userId: number, ttlHours = 24, cabang?: string | null) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  await db.insert(sessions).values({ userId, token, expiresAt, cabang: cabang || null });
  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!s) return null;
  if (s.expiresAt < new Date()) return null;
  const [u] = await db.select().from(masterUsers).where(and(eq(masterUsers.id, s.userId), eq(masterUsers.isdelete, 0), eq(masterUsers.aktif, 1))).limit(1);
  if (!u) return null;
  return { ...u, selectedCabang: s.cabang || null } as any;
}

export async function getCurrentUserServer() {
  try {
    const token = cookies().get("session_token")?.value;
    if (!token) return null;
    return await getUserBySessionToken(token);
  } catch { return null; }
}

export function getUserCabangs(user: any): string[] {
  const raw = String(user?.cabang || "").trim();
  if (!raw) return ["%"];
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["%"];
}

export async function getSessionByToken(token: string) {
  const [s] = await db.select().from(sessions).where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()))).limit(1);
  return s || null;
}
