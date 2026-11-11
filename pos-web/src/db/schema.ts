import { pgTable, integer, varchar, text, timestamp, numeric, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * BASE DULU: Master User + Master Level Manager (mirip D:\pos)
 * Semua id pakai generatedAlwaysAsIdentity() -> urut 1,2,3,4,5...
 *
 * Tabel master Barang/Satuan/Harga TIDAK ada di Postgres.
 * Itu dibaca langsung dari SQL Server 2005 Omega (tanpa sync).
 * Tabel transaksi belum dibuat (sesuai permintaan: jangan buat form transaksi dulu).
 */

// ---------- MASTER LEVEL MANAGER ----------
export const masterLevelManager = pgTable("master_level_manager", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 100 }).notNull().unique(), // mis: SUPERADMIN, KASIR, GUDANG
  name: varchar("name", { length: 200 }).notNull(),
  isdelete: integer("isdelete").notNull().default(0), // soft delete
  userCreate: integer("user_create"),
  userEdit: integer("user_edit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- MASTER PERMISSIONS (daftar izin yang tersedia) ----------
export const masterPermissions = pgTable("master_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 100 }).notNull().unique(), // VIEW, CREATE, EDIT, DELETE, EXPORT, IMPORT, APPROVE, PRINT, BACKDATE, EDIT_PRICE, QTY_MINUS
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isdelete: integer("isdelete").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Izin apa saja yang tersedia per menu (mis: menu purchase boleh VIEW,CREATE,EDIT,DELETE,PRINT,APPROVE)
export const menuPermissions = pgTable("menu_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  menuCode: varchar("menu_code", { length: 100 }).notNull(),
  permissionCode: varchar("permission_code", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: index("uq_menu_permissions").on(t.menuCode, t.permissionCode),
}));

// Matriks izin per level: level X boleh apa di menu Y
export const levelPermissions = pgTable("level_permissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  levelId: integer("level_id").notNull().references(() => masterLevelManager.id),
  menuCode: varchar("menu_code", { length: 100 }).notNull(),
  permissionCode: varchar("permission_code", { length: 100 }).notNull(),
  allowed: integer("allowed").notNull().default(0), // 1=boleh, 0=tidak
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: index("uq_level_permissions").on(t.levelId, t.menuCode, t.permissionCode),
}));

// ---------- MASTER USERS ----------
export const masterUsers = pgTable("master_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 100 }).unique(), // USR/000001 auto-generate
  name: varchar("name", { length: 200 }),
  levelId: integer("level_id").references(() => masterLevelManager.id),
  aktif: integer("aktif").notNull().default(1),
  isActive: integer("is_active").notNull().default(1),
  isdelete: integer("isdelete").notNull().default(0),
  email: varchar("email", { length: 200 }).unique(),
  passwordHash: text("password_hash"),
  cabang: text("cabang"), // daftar cabang yang boleh diakses, pisah koma; kosong/% = semua (pusat)
  userCreate: integer("user_create"),
  userEdit: integer("user_edit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxEmail: index("idx_master_users_email").on(t.email),
  idxAktif: index("idx_master_users_aktif").on(t.aktif),
}));

// Jenis barang yang diizinkan per user: 1=Barang Jadi, 2=Bahan Baku, 3=Barang Pembantu
export const userBarangJenis = pgTable("user_barang_jenis", {
  userId: integer("user_id").notNull().references(() => masterUsers.id, { onDelete: "cascade" }),
  jenis: integer("jenis").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.jenis] }),
}));

// ---------- SESSIONS (login) ----------
export const sessions = pgTable("sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => masterUsers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  cabang: varchar("cabang", { length: 50 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxToken: index("idx_sessions_token").on(t.token),
  idxUser: index("idx_sessions_user_id").on(t.userId),
}));

// ---------- SETTINGS ----------
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  settingKey: varchar("setting_key", { length: 200 }).notNull().unique(),
  settingValue: text("setting_value"),
  settingGroup: varchar("setting_group", { length: 100 }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- KARTU STOK (REKONSILIASI PEMAKAIAN PER PENJUALAN) ----------
export const kartuStok = pgTable("kartu_stok", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: integer("code").notNull().unique(), // nomor urut transaksi
  kodeNota: varchar("kode_nota", { length: 100 }).notNull().unique(),
  tgl: timestamp("tgl", { withTimezone: true }).notNull().defaultNow(),
  cabang: varchar("cabang", { length: 50 }),
  penjualanId: integer("penjualan_id").notNull().references(() => masterPenjualan.id, { onDelete: "restrict" }),
  kodeNotaPenjualan: varchar("kode_nota_penjualan", { length: 100 }),
  gudang: varchar("gudang", { length: 100 }),
  keterangan: text("keterangan"),
  status: varchar("status", { length: 20 }).notNull().default("POSTED"),
  isVoid: integer("is_void").notNull().default(0),
  userCreate: integer("user_create").references(() => masterUsers.id),
  userEdit: integer("user_edit").references(() => masterUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxPenjualan: index("idx_kartu_stok_penjualan").on(t.penjualanId),
  idxCabang: index("idx_kartu_stok_cabang").on(t.cabang),
  idxTgl: index("idx_kartu_stok_tgl").on(t.tgl),
}));

export const kartuStokItem = pgTable("kartu_stok_item", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  kartuStokId: integer("kartu_stok_id").notNull().references(() => kartuStok.id, { onDelete: "cascade" }),
  bahanKode: varchar("bahan_kode", { length: 100 }).notNull(),
  bahanNama: varchar("bahan_nama", { length: 200 }),
  satuan: varchar("satuan", { length: 20 }),
  pemakaianLaporan: numeric("pemakaian_laporan", { precision: 18, scale: 4 }).notNull().default("0"),
  saldoAwal: numeric("saldo_awal", { precision: 18, scale: 4 }).notNull().default("0"),
  masuk: numeric("masuk", { precision: 18, scale: 4 }).notNull().default("0"),
  sisa: numeric("sisa", { precision: 18, scale: 4 }).notNull().default("0"),
  pemakaianAktual: numeric("pemakaian_aktual", { precision: 18, scale: 4 }).notNull().default("0"),
  selisih: numeric("selisih", { precision: 18, scale: 4 }).notNull().default("0"),
  hpp: numeric("hpp", { precision: 18, scale: 4 }).notNull().default("0"),
  totalHppLaporan: numeric("total_hpp_laporan", { precision: 18, scale: 2 }).notNull().default("0"),
  totalHppAktual: numeric("total_hpp_aktual", { precision: 18, scale: 2 }).notNull().default("0"),
  totalHppSelisih: numeric("total_hpp_selisih", { precision: 18, scale: 2 }).notNull().default("0"),
  keterangan: text("keterangan"),
  urutan: integer("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxKartu: index("idx_kartu_stok_item_kartu").on(t.kartuStokId),
  idxBahan: index("idx_kartu_stok_item_bahan").on(t.bahanKode),
}));
// Header transaksi Persediaan WIP.
// Code: auto-generate angka urut (1, 2, 3, ...) agar mudah diseleksi.
export const masterWip = pgTable("master_wip", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: integer("code").notNull().unique(), // angka urut: 1, 2, 3, ...
  kodenota: varchar("kodenota", { length: 50 }).unique(), // auto-generate: 00001/01/WIP/2026/000001
  tgl: timestamp("tgl", { withTimezone: true }).notNull().defaultNow(),
  cabang: varchar("cabang", { length: 20 }).notNull().default("00001/01"),
  gudang: varchar("gudang", { length: 50 }).notNull(),
  keterangan: text("keterangan"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  totalHpp: numeric("total_hpp", { precision: 14, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT / POSTED
  isVoid: integer("is_void").notNull().default(0), // 0 = normal, 1 = void/batal
  userCreate: integer("user_create").references(() => masterUsers.id),
  userEdit: integer("user_edit").references(() => masterUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxCabang: index("idx_master_wip_cabang").on(t.cabang),
  idxGudang: index("idx_master_wip_gudang").on(t.gudang),
  idxTgl: index("idx_master_wip_tgl").on(t.tgl),
  idxStatus: index("idx_master_wip_status").on(t.status),
}));

// Detail: 1 baris = 1 barang setengah jadi.
export const masterWipItem = pgTable("master_wip_item", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  wipId: integer("wip_id").notNull().references(() => masterWip.id, { onDelete: "cascade" }),
  brgKode: varchar("brg_kode", { length: 100 }).notNull(), // Omega.Barang.Kode
  brgNama: varchar("brg_nama", { length: 200 }), // snapshot nama
  gudang: varchar("gudang", { length: 50 }),
  jml: numeric("jml", { precision: 14, scale: 4 }).notNull().default("0"),
  rasio: numeric("rasio", { precision: 14, scale: 4 }).notNull().default("1"),
  satuan: varchar("satuan", { length: 20 }).notNull(),
  hrgSatuan: numeric("hrg_satuan", { precision: 14, scale: 2 }).notNull().default("0"),
  hpp: numeric("hpp", { precision: 14, scale: 2 }).notNull().default("0"),
  totalHpp: numeric("total_hpp", { precision: 14, scale: 2 }).notNull().default("0"),
  keterangan: text("keterangan"),
  urutan: integer("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxWip: index("idx_master_wip_item_wip").on(t.wipId),
  idxBrg: index("idx_master_wip_item_brg").on(t.brgKode),
}));

// ---------- MASTER INGREDIENT (RESEP / BOM) ----------
// Header: 1 resep untuk 1 barang jadi.
// Barang jadi & bahan baku disimpan sebagai KODE (bukan id) karena master barang
// ada di SQL Server Omega (read-only, tanpa sync). Omega.Barang.Kode = PK varchar.
export const masterIngredient = pgTable("master_ingredient", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 100 }).notNull().unique()
    .default(sql`('ING/' || lpad(nextval('master_ingredient_code_seq')::text, 6, '0'))`),
  barangKode: varchar("barang_kode", { length: 100 }).notNull(), // Omega.Barang.Kode (barang jadi)
  name: varchar("name", { length: 200 }).notNull(),
  portion: numeric("portion", { precision: 12, scale: 2 }).notNull().default("1"),
  description: text("description"),
  aktif: integer("aktif").notNull().default(1),
  isdelete: integer("isdelete").notNull().default(0),
  userCreate: integer("user_create"),
  userEdit: integer("user_edit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxBarang: index("idx_master_ingredient_barang").on(t.barangKode),
  idxAktif: index("idx_master_ingredient_aktif").on(t.aktif),
  idxIsdelete: index("idx_master_ingredient_isdelete").on(t.isdelete),
}));

// Detail: 1 baris = 1 bahan baku. rasio = snapshot Rasio satuan dari Omega.Satuan.
export const masterIngredientItem = pgTable("master_ingredient_item", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ingredientId: integer("ingredient_id").notNull().references(() => masterIngredient.id, { onDelete: "cascade" }),
  bahanKode: varchar("bahan_kode", { length: 100 }).notNull(), // Omega.Barang.Kode (bahan baku)
  qty: numeric("qty", { precision: 14, scale: 4 }).notNull().default("0"),
  satuan: varchar("satuan", { length: 20 }).notNull(),
  rasio: numeric("rasio", { precision: 14, scale: 4 }).notNull().default("1"),
  catatan: text("catatan"),
  urutan: integer("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxIngredient: index("idx_master_ingredient_item_ing").on(t.ingredientId),
  idxBahan: index("idx_master_ingredient_item_bahan").on(t.bahanKode),
}));

// ---------- TRANSAKSI PENJUALAN ----------
// Header: mirip WIP (tgl/gudang/keterangan/total/status) + pelanggan + kode nota.
// code = angka urut 1,2,3 (sama seperti WIP). kodeNota = auto generate untuk query.
export const masterPenjualan = pgTable("master_penjualan", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: integer("code").notNull().unique(),
  kodeNota: varchar("kode_nota", { length: 50 }).notNull().unique(),
  tgl: timestamp("tgl", { withTimezone: true }).notNull().defaultNow(),
  cabang: varchar("cabang", { length: 20 }).notNull().default("00001/01"),
  gudang: varchar("gudang", { length: 50 }).notNull(),
  pelangganKode: varchar("pelanggan_kode", { length: 100 }),
  pelangganNama: varchar("pelanggan_nama", { length: 200 }),
  keterangan: text("keterangan"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("POSTED"),
  isVoid: integer("is_void").notNull().default(0),
  userCreate: integer("user_create").references(() => masterUsers.id),
  userEdit: integer("user_edit").references(() => masterUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxKodeNota: index("idx_master_penjualan_kode_nota").on(t.kodeNota),
  idxCabang: index("idx_master_penjualan_cabang").on(t.cabang),
  idxGudang: index("idx_master_penjualan_gudang").on(t.gudang),
  idxTgl: index("idx_master_penjualan_tgl").on(t.tgl),
  idxStatus: index("idx_master_penjualan_status").on(t.status),
}));

// Detail: 1 baris = 1 barang. satuan = satuan TERKECIL, hrgSatuan = snapshot (saat simpan pertama).
export const masterPenjualanItem = pgTable("master_penjualan_item", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  penjualanId: integer("penjualan_id").notNull().references(() => masterPenjualan.id, { onDelete: "cascade" }),
  brgKode: varchar("brg_kode", { length: 100 }).notNull(),
  brgNama: varchar("brg_nama", { length: 200 }),
  gudang: varchar("gudang", { length: 50 }),
  jml: numeric("jml", { precision: 14, scale: 4 }).notNull().default("0"),
  rasio: numeric("rasio", { precision: 14, scale: 4 }).notNull().default("1"),
  satuan: varchar("satuan", { length: 20 }).notNull(),
  hrgSatuan: numeric("hrg_satuan", { precision: 14, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  keterangan: text("keterangan"),
  urutan: integer("urutan").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxPenjualan: index("idx_master_penjualan_item_pen").on(t.penjualanId),
  idxBrg: index("idx_master_penjualan_item_brg").on(t.brgKode),
}));
