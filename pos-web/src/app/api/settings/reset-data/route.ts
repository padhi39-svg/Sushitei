import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  masterWip, masterWipItem, masterPenjualan, masterPenjualanItem,
  masterIngredient, masterIngredientItem, kartuStok, kartuStokItem,
} from "@/db/schema";
import { masterUsers, masterLevelManager } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getUserBySessionToken } from "@/lib/auth";

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

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "").trim(); // "trx" | "trx+ingredient"
    const confirm = String(body?.confirm || "").trim();
    if (confirm !== "HAPUS") return NextResponse.json({ error: "Konfirmasi tidak valid (ketik HAPUS)" }, { status: 400 });
    if (mode !== "trx" && mode !== "trx+ingredient") {
      return NextResponse.json({ error: "Mode tidak valid" }, { status: 400 });
    }

    // Backup seluruh transaksi terlebih dahulu, lalu hapus dalam satu transaksi DB.
    const result = await db.transaction(async (tx) => {
      const wipItems = await tx.select().from(masterWipItem);
      const wipHeaders = await tx.select().from(masterWip);
      const pjItems = await tx.select().from(masterPenjualanItem);
      const pjHeaders = await tx.select().from(masterPenjualan);
      const kartuItems = await tx.select().from(kartuStokItem);
      const kartuHeaders = await tx.select().from(kartuStok);
      const backup: Record<string, any[]> = {
        master_wip_item: wipItems,
        master_wip: wipHeaders,
        master_penjualan_item: pjItems,
        master_penjualan: pjHeaders,
        kartu_stok_item: kartuItems,
        kartu_stok: kartuHeaders,
      };

      let ingredientCount = 0;
      let ingredientItemCount = 0;
      if (mode === "trx+ingredient") {
        const ingItems = await tx.select().from(masterIngredientItem);
        const ingHeaders = await tx.select().from(masterIngredient);
        backup.master_ingredient_item = ingItems;
        backup.master_ingredient = ingHeaders;
        ingredientCount = ingHeaders.length;
        ingredientItemCount = ingItems.length;
      }

      // Hapus child terlebih dahulu. Kartu stok mereferensikan penjualan.
      await tx.delete(kartuStokItem);
      await tx.delete(kartuStok);
      await tx.delete(masterWipItem);
      await tx.delete(masterWip);
      await tx.delete(masterPenjualanItem);
      await tx.delete(masterPenjualan);

      if (mode === "trx+ingredient") {
        await tx.delete(masterIngredientItem);
        await tx.delete(masterIngredient);
        // Kode resep memakai sequence khusus, bukan sequence kolom id.
        // RESTART WITH 1 bersifat transaksional; resep berikutnya menjadi ING/000001.
        await tx.execute(sql`ALTER SEQUENCE master_ingredient_code_seq RESTART WITH 1`);
      }

      return {
        backup,
        deleted: {
          wip: wipHeaders.length,
          wipItems: wipItems.length,
          penjualan: pjHeaders.length,
          penjualanItems: pjItems.length,
          kartuStok: kartuHeaders.length,
          kartuStokItems: kartuItems.length,
          ingredient: ingredientCount,
          ingredientItems: ingredientItemCount,
        },
      };
    });

    // Reset sequences (id) ke 1 setelah seluruh delete berhasil.
    const resetTables = ["kartu_stok", "kartu_stok_item", "master_wip", "master_wip_item", "master_penjualan", "master_penjualan_item"];
    if (mode === "trx+ingredient") resetTables.push("master_ingredient", "master_ingredient_item");
    for (const table of resetTables) {
      try {
        await db.execute(sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), 1, false)`);
      } catch {
        // Beberapa tabel memakai identity sequence yang tidak terdaftar sebagai serial.
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      deleted: result.deleted,
      ingredientCodeSequenceReset: mode === "trx+ingredient",
      backup: result.backup,
    });
  } catch (error: any) {
    console.error("Reset data gagal:", error);
    return NextResponse.json({ error: error?.message || "Terjadi kesalahan saat menghapus data" }, { status: 500 });
  }
}
