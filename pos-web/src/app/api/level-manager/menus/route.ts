import { NextResponse } from "next/server";
import { SYSTEM_MENUS, MENU_GROUPS } from "@/lib/menus";
import { db } from "@/db";
import { masterPermissions, menuPermissions } from "@/db/schema";

// GET menu + permission yang tersedia per menu (untuk form matriks Level Manager)
// Prioritas: isi menu_permissions dari DB, fallback ke DEFAULT di bawah kalau kosong.
const DEFAULT_MENU_PERMS: Record<string, string[]> = {
  dashboard: ["VIEW"],
  barang: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"],
  barang_satuan: ["VIEW", "CREATE", "EDIT", "DELETE"],
  barang_harga: ["VIEW", "CREATE", "EDIT", "DELETE"],
  barang_ingredient: ["VIEW", "CREATE", "EDIT", "DELETE", "IMPORT"],
  laporan_mutasi_persediaan: ["VIEW", "EXPORT", "PRINT"],
  laporan_neraca: ["VIEW", "EXPORT", "PRINT"],
  laporan_neraca_percobaan: ["VIEW", "EXPORT", "PRINT"],
  laporan_buku_besar: ["VIEW", "EXPORT", "PRINT"],
  laporan_persediaan_penjualan: ["VIEW", "EXPORT", "PRINT"],
  laporan_daftar_ingredient: ["VIEW", "EXPORT", "PRINT"],
  wip: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "PRINT"],
  penjualan: ["VIEW", "CREATE", "EDIT", "DELETE", "IMPORT", "EXPORT", "PRINT"],
  users: ["VIEW", "CREATE", "EDIT", "DELETE"],
  level_manager: ["VIEW", "CREATE", "EDIT", "DELETE"],
  setting_umum: ["VIEW", "EDIT"],
  setting_database: ["VIEW", "EDIT"],
  setting_reset_data: ["VIEW", "DELETE"],
  kartu_stok: ["VIEW", "CREATE", "EDIT", "DELETE", "PRINT", "EXPORT"],
};

export async function GET() {
  let permissions: any[] = [];
  try {
    permissions = await db.select().from(masterPermissions).orderBy(masterPermissions.sortOrder);
  } catch { permissions = []; }
  if (!permissions.length) {
    permissions = [
      { code: "VIEW", name: "View" }, { code: "CREATE", name: "Create" },
      { code: "EDIT", name: "Edit" }, { code: "DELETE", name: "Delete" },
      { code: "EXPORT", name: "Export" }, { code: "IMPORT", name: "Import" },
      { code: "APPROVE", name: "Approve" }, { code: "PRINT", name: "Print" },
      { code: "BACKDATE", name: "Backdate" }, { code: "EDIT_PRICE", name: "Edit Harga" },
    ];
  }

  // coba baca menu_permissions DB, kalau kosong pakai default
  let menus = SYSTEM_MENUS.map((m) => ({ ...m, permissions: DEFAULT_MENU_PERMS[m.code] || ["VIEW"] }));
  try {
    const mp = await db.select().from(menuPermissions);
    if (mp.length) {
      const map: Record<string, string[]> = {};
      for (const r of mp) (map[r.menuCode] ||= []).push(r.permissionCode);
      menus = SYSTEM_MENUS.map((m) => ({ ...m, permissions: map[m.code] || ["VIEW"] }));
    }
  } catch {}

  return NextResponse.json({ menus, permissions, groups: MENU_GROUPS });
}
