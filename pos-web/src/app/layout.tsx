"use client";
import "./globals.css";
import HeaderMenu from "@/components/HeaderMenu";
import Sidebar from "@/components/Sidebar";
import SaveSuccessToast from "@/components/SaveSuccessToast";
import ThemeProvider from "@/components/ThemeProvider";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type GeneralSettings } from "@/lib/settings";

const FONT_LINKS = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=Playfair+Display:wght@600;700&display=swap"
      rel="stylesheet"
    />
  </>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState<GeneralSettings>({ ...DEFAULT_SETTINGS });

  // Pengaturan umum: dipakai untuk tema global (warna) + judul tab
  useEffect(() => {
    fetch("/api/settings?public=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings }); })
      .catch(() => {});
  }, []);

  if (isLogin) {
    return (
      <html lang="id" className="overflow-x-hidden">
        <head>{FONT_LINKS}</head>
        <body className="overflow-x-hidden w-full" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <ThemeProvider settings={settings} />
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="id" className="overflow-x-hidden">
      <head>{FONT_LINKS}</head>
      <body className="overflow-x-hidden w-full" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <ThemeProvider settings={settings} />
        <SaveSuccessToast />
        <div className="min-h-screen flex">
          <Sidebar mobileOpen={pathname === "/select-cabang" ? false : mobileOpen} onClose={() => setMobileOpen(false)} />
          <div className="flex-1 flex flex-col min-w-0">
            <HeaderMenu onMenuToggle={() => setMobileOpen((v) => !v)} />
            <main className="flex-1 p-2 md:p-3 w-full">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
