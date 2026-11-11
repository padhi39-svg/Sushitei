// Header menu - struktur & penamaan mengikuti referensi D:\pos\src\lib\menus.ts
// Untuk base ini hanya ditampilkan menu yang sudah dipakai:
// Dashboard + Master Barang, Master Satuan, Master Harga Jual (+ Setting user/level).
export type SystemMenu = {
  code: string;
  name: string;
  path: string;
  group: string;
  permissions?: string[];
};

export const MENU_GROUPS = [
  { code: "Dashboard", name: "Dashboard", order: 1 },
  { code: "Barang", name: "Barang", order: 2 },
  { code: "Transaksi", name: "Transaksi", order: 3 },
  { code: "Laporan", name: "Laporan", order: 4 },
  { code: "Setting", name: "Setting", order: 5 },
];

export const SYSTEM_MENUS: SystemMenu[] = [
  {
    code: "dashboard",
    name: "Dashboard",
    path: "/dashboard",
    group: "Dashboard",
    permissions: ["VIEW"],
  },

  // Barang - master dibaca langsung dari SQL Server Omega (tanpa sync)
  {
    code: "barang",
    name: "Master Barang",
    path: "/barang",
    group: "Barang",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "IMPORT"],
  },
  {
    code: "barang_satuan",
    name: "Master Satuan",
    path: "/barang/satuan",
    group: "Barang",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE"],
  },
  {
    code: "barang_harga",
    name: "Master Harga Jual",
    path: "/barang/harga",
    group: "Barang",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE"],
  },
  {
    code: "barang_ingredient",
    name: "Master Ingredient",
    path: "/barang/ingredient",
    group: "Barang",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE", "IMPORT"],
  },

  // Laporan
  {
    code: "laporan_mutasi_persediaan",
    name: "Rekap Mutasi Nilai Persediaan",
    path: "/laporan/mutasi-persediaan",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "laporan_neraca",
    name: "Laporan Neraca",
    path: "/laporan/neraca",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "wip",
    name: "Persediaan WIP",
    path: "/wip",
    group: "Transaksi",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "PRINT"],
  },
  {
    code: "penjualan",
    name: "Penjualan",
    path: "/penjualan",
    group: "Transaksi",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE", "IMPORT", "EXPORT", "PRINT"],
  },
  {
    code: "kartu_stok",
    name: "Rekonsiliasi Pemakaian Penjualan",
    path: "/kartu-stok",
    group: "Transaksi",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE", "PRINT", "EXPORT"],
  },
  {
    code: "laporan_persediaan_wip",
    name: "Laporan Persediaan WIP",
    path: "/laporan/persediaan-wip",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "laporan_neraca_percobaan",
    name: "Neraca Percobaan",
    path: "/laporan/neraca-percobaan",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "laporan_persediaan_penjualan",
    name: "Laporan Pemakaian Penjualan",
    path: "/laporan/persediaan-penjualan",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "laporan_daftar_ingredient",
    name: "Daftar Ingredient",
    path: "/laporan/daftar-ingredient",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },
  {
    code: "laporan_buku_besar",
    name: "Buku Besar",
    path: "/laporan/buku-besar",
    group: "Laporan",
    permissions: ["VIEW", "EXPORT", "PRINT"],
  },

  // Setting - base yang dibuat duluan
  {
    code: "users",
    name: "Master User",
    path: "/users",
    group: "Setting",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE"],
  },
  {
    code: "level_manager",
    name: "Master Level Manager",
    path: "/level-manager",
    group: "Setting",
    permissions: ["VIEW", "CREATE", "EDIT", "DELETE"],
  },
  {
    code: "setting_umum",
    name: "Pengaturan Umum",
    path: "/setting/umum",
    group: "Setting",
    permissions: ["VIEW", "EDIT"],
  },
  {
    code: "setting_database",
    name: "Pengaturan Database SQL",
    path: "/setting/database",
    group: "Setting",
    permissions: ["VIEW", "EDIT"],
  },
  {
    code: "setting_reset_data",
    name: "Reset Data (Hapus Transaksi)",
    path: "/setting/reset-data",
    group: "Setting",
    permissions: ["VIEW", "DELETE"],
  },
];
