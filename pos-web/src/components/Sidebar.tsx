"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { HomeIcon, Squares2X2Icon, CurrencyDollarIcon, ClipboardDocumentListIcon, ShoppingCartIcon, Cog6ToothIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { SYSTEM_MENUS, MENU_GROUPS } from "@/lib/menus";
import { DEFAULT_SETTINGS, type GeneralSettings } from "@/lib/settings";

const GROUP_ICONS: Record<string, any> = {
  Dashboard: HomeIcon, Reservasi: CalendarDaysIcon, Pembelian: ShoppingCartIcon,
  Penjualan: ShoppingCartIcon, Barang: Squares2X2Icon, Stok: ClipboardDocumentListIcon,
  Keuangan: CurrencyDollarIcon, Laporan: ClipboardDocumentListIcon, Setting: Cog6ToothIcon,
  Transaksi: ClipboardDocumentListIcon,
};

export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [settings, setSettings] = useState<GeneralSettings>({ ...DEFAULT_SETTINGS });

  const appName = settings.appName || DEFAULT_SETTINGS.appName;
  const initial = appName.trim().charAt(0).toUpperCase() || "M";

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setAllowed(d?.user?.allowedPaths || null)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings?public=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings }); })
      .catch(() => {});
  }, []);

  const allowedPath = (p: string) => {
    if (!allowed) return true;
    if (allowed.includes("/")) return true;
    return allowed.some((b) => p === b || p.startsWith(b + "/"));
  };

  const groups = MENU_GROUPS.map((g) => ({
    ...g,
    items: SYSTEM_MENUS.filter((m) => m.group === g.code && allowedPath(m.path)),
  })).filter((g) => g.items.length);

  const content = (
    <div className="flex flex-col h-full">
      <div className="h-12 flex items-center px-3 gap-2 border-b border-slate-200">
        {settings.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.logoUrl} alt="logo" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-teal-primary grid place-items-center text-white font-bold text-sm">{initial}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm whitespace-nowrap truncate">{appName}</div>
          {settings.appSubtitle && (
            <div className="text-[10px] text-slate-400 whitespace-nowrap truncate -mt-0.5">{settings.appSubtitle}</div>
          )}
        </div>
        <button onClick={onClose} className="md:hidden h-8 w-8 grid place-items-center rounded-md hover:bg-slate-100" aria-label="Tutup">✕</button>
      </div>
      <nav className="mt-2 px-2 pb-2 flex-1 overflow-y-auto">
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.code] || HomeIcon;
          const isDashboard = g.code === "Dashboard";
          const isOpen = !!open[g.code] || g.items.some((i) => pathname === i.path || pathname.startsWith(i.path + "/"));
          if (isDashboard) {
            return (
              <Link key={g.code} href="/dashboard" onClick={onClose} className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1", pathname.startsWith("/dashboard") ? "bg-teal-bg text-teal-dark font-semibold" : "text-slate-600 hover:bg-slate-50")}>
                <Icon className="h-5 w-5" /> Dashboard
              </Link>
            );
          }
          return (
            <div key={g.code} className="mb-1">
              <button type="button" onClick={() => setOpen((p) => ({ [g.code]: !p[g.code] }))}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                <Icon className="h-5 w-5" />
                <span className="flex-1 text-left">{g.name}</span>
                <span className="text-xs">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="ml-8 mt-1 space-y-0.5">
                  {g.items.map((m) => (
                    <Link key={m.code} href={m.path} onClick={onClose}
                      className={clsx("block px-3 py-1.5 rounded-lg text-[13px]", pathname === m.path || pathname.startsWith(m.path + "/") ? "bg-teal-bg text-teal-dark font-semibold" : "text-slate-500 hover:bg-slate-50")}>
                      {m.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          className="w-full text-sm text-slate-500 hover:text-red-600 py-2">Keluar</button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar hanya untuk mobile/responsive. Desktop pakai header menu. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-xl border-r border-slate-200">{content}</div>
        </div>
      )}
    </>
  );
}
