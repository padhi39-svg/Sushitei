"use client";
import { useEffect } from "react";
import { DEFAULT_SETTINGS, type GeneralSettings } from "@/lib/settings";

/**
 * Terapkan pengaturan umum ke seluruh aplikasi:
 * - CSS variable --pos-primary / --pos-primary-hover / --pos-primary-soft
 *   dipakai oleh class Tailwind (text-teal-primary, bg-teal-primary, ...).
 * - Judul halaman (document.title) ikut nama web.
 *
 * Dipakai di RootLayout supaya SEMUA halaman ikut berubah tema,
 * bukan cuma halaman login.
 */
export default function ThemeProvider({ settings }: { settings: GeneralSettings }) {
  useEffect(() => {
    const root = document.documentElement;

    const primary = settings.primaryColor || DEFAULT_SETTINGS.primaryColor;
    const dark = settings.primaryColorDark || DEFAULT_SETTINGS.primaryColorDark;
    const soft = settings.primaryColorBg || DEFAULT_SETTINGS.primaryColorBg;

    root.style.setProperty("--pos-primary", primary);
    root.style.setProperty("--pos-primary-hover", dark);
    root.style.setProperty("--pos-primary-soft", soft);

    // warna terang (hover/active) - turunkan sedikit terang dari primary
    root.style.setProperty("--pos-primary-light", lighten(primary));

    // glow shadow mengikuti warna primary
    root.style.setProperty("--pos-primary-glow", toRgba(primary, 0.3));

    if (settings.appName) {
      document.title = settings.appName;
    }
  }, [settings.primaryColor, settings.primaryColorDark, settings.primaryColorBg, settings.appName]);

  return null;
}

/** Ubah hex jadi rgba dengan alpha tertentu */
function toRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(43, 168, 162, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Buat warna lebih terang dari hex (untuk hover state) */
function lighten(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const mix = (c: string, amt: number) => {
    const v = parseInt(c, 16);
    const r = Math.min(255, v + (255 - v) * amt);
    return Math.round(r).toString(16).padStart(2, "0");
  };
  return `#${mix(m[1], 0.25)}${mix(m[2], 0.25)}${mix(m[3], 0.25)}`;
}
