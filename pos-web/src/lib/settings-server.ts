import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  GENERAL_SETTING_DB_KEYS,
  SETTING_GROUP_UMUM,
  settingsFromDb,
  settingsToDb,
  type GeneralSettings,
  type LoginBgType,
} from "./settings";

/**
 * Ambil pengaturan umum dari DB.
 * Kalau DB error / key belum ada -> pakai DEFAULT_SETTINGS.
 */
export async function getGeneralSettings(): Promise<GeneralSettings> {
  const result: GeneralSettings = { ...DEFAULT_SETTINGS };
  try {
    const rows = await db
      .select()
      .from(settings)
      .where(inArray(settings.settingKey, GENERAL_SETTING_DB_KEYS));

    const mapped = settingsFromDb(rows);
    for (const [k, v] of Object.entries(mapped)) {
      (result as any)[k] = v;
    }
  } catch {
    return { ...DEFAULT_SETTINGS };
  }

  // Normalisasi nilai numerik & enum
  const overlay = Number(result.loginBgOverlay);
  result.loginBgOverlay = Number.isFinite(overlay) ? Math.min(1, Math.max(0, overlay)) : DEFAULT_SETTINGS.loginBgOverlay;

  const types: LoginBgType[] = ["color", "gradient", "image", "url"];
  result.loginBgType = types.includes(result.loginBgType as LoginBgType)
    ? (result.loginBgType as LoginBgType)
    : DEFAULT_SETTINGS.loginBgType;

  return result;
}

/**
 * Simpan pengaturan umum (upsert per key).
 * Input: map { camelCaseField: value } -> disimpan sebagai key DB (snake_case).
 * Nilai `""` tetap disimpan supaya bisa dikosongkan oleh user.
 */
export async function saveGeneralSettings(values: Record<string, string>) {
  const payload = settingsToDb(values);
  const entries = Object.entries(payload);
  if (!entries.length) return { saved: 0 };

  const existing = await db
    .select()
    .from(settings)
    .where(inArray(settings.settingKey, entries.map(([k]) => k)));
  const existingMap = new Map(existing.map((r) => [r.settingKey, r]));

  let saved = 0;
  for (const [key, value] of entries) {
    const val = String(value ?? "");
    const prev = existingMap.get(key);
    if (prev) {
      await db
        .update(settings)
        .set({ settingValue: val, updatedAt: new Date() })
        .where(eq(settings.settingKey, key));
    } else {
      await db.insert(settings).values({
        settingKey: key,
        settingValue: val,
        settingGroup: SETTING_GROUP_UMUM,
        description: `Pengaturan umum: ${key}`,
      });
    }
    saved++;
  }
  return { saved };
}

/**
 * CSS style background untuk halaman login sesuai pengaturan.
 */
export function loginBackgroundStyle(s: GeneralSettings): React.CSSProperties {
  switch (s.loginBgType) {
    case "color":
      return { backgroundColor: s.loginBgColor || DEFAULT_SETTINGS.loginBgColor };
    case "gradient":
      return {
        backgroundImage: `linear-gradient(135deg, ${s.loginBgColor || DEFAULT_SETTINGS.loginBgColor} 0%, ${s.loginBgColor2 || DEFAULT_SETTINGS.loginBgColor2} 100%)`,
        backgroundColor: s.loginBgColor || DEFAULT_SETTINGS.loginBgColor,
      };
    case "image":
      return s.loginBgImage
        ? { backgroundImage: `url("${s.loginBgImage}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || DEFAULT_SETTINGS.loginBgColor };
    case "url":
      return s.loginBgUrl
        ? { backgroundImage: `url("${s.loginBgUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: s.loginBgColor || DEFAULT_SETTINGS.loginBgColor };
    default:
      return { backgroundColor: s.loginBgColor || DEFAULT_SETTINGS.loginBgColor };
  }
}
