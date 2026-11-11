/**
 * PENGATURAN UMUM WEB (General Settings)
 * Disimpan di tabel `settings` (key = setting_key, value = setting_value).
 *
 * Semua halaman bisa membaca via getGeneralSettings() (server) atau
 * /api/settings (client). Nilai default dipakai bila key belum ada di DB.
 */

export const SETTING_GROUP_UMUM = "umum";

/** Key dipakai di tabel settings */
export const SETTING_KEYS = {
  appName: "app_name",
  appSubtitle: "app_subtitle",
  welcomeTitle: "welcome_title",
  welcomeSubtitle: "welcome_subtitle",
  primaryColor: "primary_color",
  primaryColorDark: "primary_color_dark",
  primaryColorBg: "primary_color_bg",
  logoUrl: "logo_url",
  loginBgType: "login_bg_type",
  loginBgColor: "login_bg_color",
  loginBgColor2: "login_bg_color_2",
  loginBgImage: "login_bg_image",
  loginBgUrl: "login_bg_url",
  loginBgOverlay: "login_bg_overlay",
  footerText: "footer_text",
  footerCopyright: "footer_copyright",
} as const;

export type LoginBgType = "color" | "gradient" | "image" | "url";

export type GeneralSettings = {
  appName: string;
  appSubtitle: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  primaryColor: string;
  primaryColorDark: string;
  primaryColorBg: string;
  logoUrl: string;
  loginBgType: LoginBgType;
  loginBgColor: string;
  loginBgColor2: string;
  loginBgImage: string;
  loginBgUrl: string;
  loginBgOverlay: number;
  footerText: string;
  footerCopyright: string;
};

/** Nilai bawaan (dipakai kalau setting belum pernah disimpan) */
export const DEFAULT_SETTINGS: GeneralSettings = {
  appName: "Sushi Tei",
  appSubtitle: "A Good Deal of Sushi",
  welcomeTitle: "Sign In",
  welcomeSubtitle: "Masuk ke sistem Sushi Tei",
  primaryColor: "#14532D",
  primaryColorDark: "#1F3D2B",
  primaryColorBg: "#E7EFE9",
  logoUrl: "",
  loginBgType: "gradient",
  loginBgColor: "#1F3D2B",
  loginBgColor2: "#14532D",
  loginBgImage: "",
  loginBgUrl: "",
  loginBgOverlay: 0.25,
  footerText: "",
  footerCopyright: "",
};

/**
 * Label + grup untuk setiap key (dipakai halaman Pengaturan Umum).
 * `key` = nama field camelCase pada GeneralSettings (bukan key DB).
 * `dbKey` = key yang disimpan di tabel settings.
 */
export const SETTING_META: Array<{
  key: keyof GeneralSettings;
  dbKey: string;
  label: string;
  group: string;
  type: "text" | "color" | "number" | "image" | "select";
  description?: string;
  options?: Array<{ value: string; label: string }>;
}> = [
  { key: "appName", dbKey: SETTING_KEYS.appName, label: "Nama Web / Aplikasi", group: "Identitas", type: "text", description: "Ditampilkan di header, sidebar, dan halaman login" },
  { key: "appSubtitle", dbKey: SETTING_KEYS.appSubtitle, label: "Subjudul Aplikasi", group: "Identitas", type: "text", description: "Teks kecil di bawah nama aplikasi" },
  { key: "welcomeTitle", dbKey: SETTING_KEYS.welcomeTitle, label: "Judul Welcome (Login)", group: "Identitas", type: "text", description: "Judul besar di sisi kiri halaman login" },
  { key: "welcomeSubtitle", dbKey: SETTING_KEYS.welcomeSubtitle, label: "Subjudul Welcome (Login)", group: "Identitas", type: "text" },
  { key: "logoUrl", dbKey: SETTING_KEYS.logoUrl, label: "Logo Aplikasi", group: "Identitas", type: "image", description: "Upload logo (PNG/JPG/SVG). Tampil di login & header" },

  { key: "primaryColor", dbKey: SETTING_KEYS.primaryColor, label: "Warna Tema Utama", group: "Tema", type: "color" },
  { key: "primaryColorDark", dbKey: SETTING_KEYS.primaryColorDark, label: "Warna Tema Gelap", group: "Tema", type: "color" },
  { key: "primaryColorBg", dbKey: SETTING_KEYS.primaryColorBg, label: "Warna Tema Latar (Soft)", group: "Tema", type: "color" },

  {
    key: "loginBgType", dbKey: SETTING_KEYS.loginBgType, label: "Tipe Background Login", group: "Background Login", type: "select",
    description: "Pilih sumber background halaman login",
    options: [
      { value: "color", label: "Warna Solid" },
      { value: "gradient", label: "Gradient Dua Warna" },
      { value: "image", label: "Upload Gambar" },
      { value: "url", label: "URL Gambar (Internet)" },
    ],
  },
  { key: "loginBgColor", dbKey: SETTING_KEYS.loginBgColor, label: "Warna Background (Solid)", group: "Background Login", type: "color" },
  { key: "loginBgColor2", dbKey: SETTING_KEYS.loginBgColor2, label: "Warna Gradient Bawah", group: "Background Login", type: "color", description: "Dipakai saat tipe = Gradient" },
  { key: "loginBgImage", dbKey: SETTING_KEYS.loginBgImage, label: "Gambar Background (Upload)", group: "Background Login", type: "image", description: "Dipakai saat tipe = Upload Gambar" },
  { key: "loginBgUrl", dbKey: SETTING_KEYS.loginBgUrl, label: "URL Background", group: "Background Login", type: "text", description: "Dipakai saat tipe = URL Gambar" },
  { key: "loginBgOverlay", dbKey: SETTING_KEYS.loginBgOverlay, label: "Gelap Overlay (%)", group: "Background Login", type: "number", description: "0 = tanpa overlay, 100 = hitam pekat" },

  { key: "footerText", dbKey: SETTING_KEYS.footerText, label: "Teks Footer Login", group: "Footer", type: "text", description: "Contoh: Butuh bantuan? Hubungi admin" },
  { key: "footerCopyright", dbKey: SETTING_KEYS.footerCopyright, label: "Copyright", group: "Footer", type: "text", description: "Contoh: © 2026 Magnus System" },
];

/** Semua key DB untuk pengaturan umum */
export const GENERAL_SETTING_DB_KEYS = SETTING_META.map((m) => m.dbKey);

/** Daftar field GeneralSettings yang punya setting (untuk whitelist API) */
export const GENERAL_SETTING_FIELDS = SETTING_META.map((m) => m.key as string);

/** Ubah map { dbKey: value } -> { camelCaseField: value } */
export function settingsFromDb(rows: Array<{ settingKey: string; settingValue: string | null }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of SETTING_META) {
    const row = rows.find((r) => r.settingKey === m.dbKey);
    if (row) out[m.key] = row.settingValue ?? "";
  }
  return out;
}

/** Ubah map { camelCaseField: value } -> { dbKey: value } */
export function settingsToDb(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of SETTING_META) {
    if (m.key in values) out[m.dbKey] = String(values[m.key] ?? "");
  }
  return out;
}
