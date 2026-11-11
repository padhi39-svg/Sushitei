"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { SYSTEM_MENUS, MENU_GROUPS } from "@/lib/menus";
import { DEFAULT_SETTINGS, type GeneralSettings } from "@/lib/settings";
import { usePathname } from "next/navigation";

export default function HeaderMenu({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname();
  const menusDisabled = pathname === "/select-cabang";
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<NodeJS.Timeout | null>(null);
  const [user, setUser] = useState<any>(null);
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [settings, setSettings] = useState<GeneralSettings>({ ...DEFAULT_SETTINGS });

  const appName = settings.appName || DEFAULT_SETTINGS.appName;

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setUser(d?.user || null);
      setAllowed(d?.user?.allowedPaths || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings?public=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings }); })
      .catch(() => {});
  }, []);

  const filt = (path: string) => {
    if (!allowed) return true;
    if (allowed.includes("/")) return true;
    return allowed.some((b) => path === b || path.startsWith(b + "/"));
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 h-12 flex items-center gap-2">
      <button onClick={menusDisabled ? undefined : onMenuToggle} disabled={menusDisabled} className="md:hidden h-8 w-8 grid place-items-center rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Menu">☰</button>
      <div className="min-w-0">
        {menusDisabled ? (
          <span className="font-extrabold text-teal-primary whitespace-nowrap block leading-tight">{appName}</span>
        ) : (
          <Link href="/dashboard" className="font-extrabold text-teal-primary whitespace-nowrap block leading-tight">{appName}</Link>
        )}
        {settings.appSubtitle && (
          <div className="text-[10px] text-slate-400 font-semibold whitespace-nowrap leading-tight hidden sm:block -mt-0.5">{settings.appSubtitle}</div>
        )}
      </div>
      <nav className="hidden md:flex items-center gap-1 ml-2">
        {MENU_GROUPS.map((g) => {
          const items = SYSTEM_MENUS.filter((m) => m.group === g.code && filt(m.path));
          if (!items.length) return null;
          const isOpen = open === g.code;
          if (menusDisabled) {
            return (
              <div key={g.code} className="relative">
                <button type="button" disabled className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-400 opacity-60 cursor-not-allowed">
                  {g.name}
                </button>
              </div>
            );
          }
          return (
            <div key={g.code} className="relative" onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(g.code); }} onMouseLeave={() => { closeTimer.current = setTimeout(() => setOpen(null), 300); }}>
              <button onClick={() => setOpen(isOpen ? null : g.code)}
                className={"px-3 py-1.5 rounded-lg text-sm font-semibold " + (isOpen ? "bg-teal-bg text-teal-dark" : "text-slate-600 hover:bg-slate-50")}>
                {g.name}
              </button>
              {isOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-card min-w-[220px] p-1.5 z-50" onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }} onMouseLeave={() => { closeTimer.current = setTimeout(() => setOpen(null), 300); }}>
                  {items.map((m) => (
                    <Link key={m.code} href={m.path} className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-teal-bg hover:text-teal-dark">{m.name}</Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2 text-sm">
        {user && <span className="hidden sm:block text-slate-500">{user.name} <span className="badge">{user.levelCode || "-"}</span></span>}
        <button onClick={logout} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-slate-300 text-xs font-semibold hover:bg-slate-50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0-3 3m3-3H3" />
          </svg>
          Logout
        </button>
      </div>
    </header>
  );
}
