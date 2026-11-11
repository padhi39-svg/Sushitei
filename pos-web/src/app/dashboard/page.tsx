"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import Spinner from "@/components/Spinner";
import { SYSTEM_MENUS, type SystemMenu } from "@/lib/menus";

const DESCRIPTIONS: Record<string, string> = {
  wip: "Buat dan kelola transaksi persediaan WIP.",
  penjualan: "Buat dan kelola transaksi penjualan.",
  kartu_stok: "Rekonsiliasi pemakaian bahan baku dari penjualan.",
  laporan_mutasi_persediaan: "Lihat mutasi nilai persediaan per periode dan gudang.",
  laporan_neraca: "Lihat ringkasan posisi keuangan perusahaan.",
  laporan_persediaan_wip: "Lihat persediaan WIP dan nilai HPP.",
  laporan_neraca_percobaan: "Lihat saldo akun dan neraca percobaan.",
  laporan_persediaan_penjualan: "Lihat pemakaian bahan baku dari transaksi penjualan.",
  laporan_daftar_ingredient: "Lihat daftar resep dan bahan baku yang dipakai.",
  laporan_buku_besar: "Lihat rincian aktivitas dan saldo buku besar.",
};

const TILE_LABELS: Record<string, string> = {
  wip: "Persediaan WIP",
  penjualan: "Penjualan",
  kartu_stok: "Rekonsiliasi Pemakaian",
  laporan_mutasi_persediaan: "Rekap Mutasi Nilai",
  laporan_neraca: "Laporan Neraca",
  laporan_persediaan_wip: "Laporan Persediaan WIP",
  laporan_neraca_percobaan: "Neraca Percobaan",
  laporan_persediaan_penjualan: "Laporan Pemakaian",
  laporan_daftar_ingredient: "Daftar Ingredient",
  laporan_buku_besar: "Buku Besar",
};

function MenuCard({ menu }: { menu: SystemMenu }) {
  const isReport = menu.group === "Laporan";
  const iconByCode: Record<string, typeof ClipboardDocumentListIcon> = {
    wip: Squares2X2Icon,
    penjualan: ShoppingCartIcon,
    kartu_stok: ClipboardDocumentListIcon,
    laporan_mutasi_persediaan: Squares2X2Icon,
    laporan_neraca: CurrencyDollarIcon,
    laporan_persediaan_wip: ClipboardDocumentListIcon,
    laporan_neraca_percobaan: CurrencyDollarIcon,
    laporan_persediaan_penjualan: ShoppingCartIcon,
    laporan_daftar_ingredient: ClipboardDocumentListIcon,
    laporan_buku_besar: ClipboardDocumentListIcon,
  };
  const Icon = iconByCode[menu.code] || (isReport ? ClipboardDocumentListIcon : ShoppingCartIcon);
  return (
    <Link
      href={menu.path}
      title={`${menu.name} — ${DESCRIPTIONS[menu.code] || "Buka halaman " + menu.name + "."}`}
      className="group flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-2xl border border-white bg-white/90 px-1.5 py-2.5 text-center shadow-[0_5px_14px_rgba(20,83,45,0.08)] transition hover:-translate-y-0.5 hover:border-teal-200 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-400 sm:min-h-[124px] sm:px-2.5 sm:py-3"
    >
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl transition group-hover:scale-105 sm:h-16 sm:w-16 ${isReport ? "bg-sky-50 text-sky-600" : "bg-emerald-50 text-emerald-600"}`} aria-hidden="true">
        <Icon className="h-8 w-8 sm:h-9 sm:w-9" />
      </span>
      <span className="flex w-full items-center gap-0.5 text-left">
        <span className="line-clamp-3 min-h-8 flex-1 text-[10px] font-semibold leading-[1.15] text-slate-800 group-hover:text-teal-800 sm:text-xs">{TILE_LABELS[menu.code] || menu.name}</span>
        <span className="shrink-0 text-base leading-none text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-teal-700" aria-hidden="true">›</span>
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const [allowedPaths, setAllowedPaths] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Gagal memuat hak akses");
        if (alive) setAllowedPaths(Array.isArray(data?.user?.allowedPaths) ? data.user.allowedPaths : []);
      })
      .catch((e) => { if (alive) setError(e?.message || "Gagal memuat hak akses"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const accessibleMenus = useMemo(() => {
    if (!allowedPaths) return [];
    const isAdmin = allowedPaths.includes("/");
    return SYSTEM_MENUS.filter((menu) => {
      if (menu.group !== "Transaksi" && menu.group !== "Laporan") return false;
      return isAdmin || allowedPaths.some((path) => menu.path === path || menu.path.startsWith(path + "/"));
    });
  }, [allowedPaths]);

  const transactions = accessibleMenus.filter((menu) => menu.group === "Transaksi");
  const reports = accessibleMenus.filter((menu) => menu.group === "Laporan");

  return (
    <div className="-mx-2 -my-2 min-h-[calc(100dvh-3rem)] bg-gradient-to-b from-[#F1FCF8] via-[#E9F9F4] to-[#F2FBF9] px-3 py-3 sm:px-5 sm:py-5 md:-mx-3 md:-my-3 md:px-7 md:py-6">
      <div className="mx-auto w-full max-w-[1200px] space-y-3 sm:space-y-4">
        <header className="px-1 sm:px-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-emerald-800/70 sm:text-[10px]">Restaurant System</div>
          <h1 className="mt-0.5 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Pilih transaksi atau laporan yang ingin dibuka.</p>
        </header>

        {loading ? (
          <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm"><Spinner label="Memuat menu..." /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : accessibleMenus.length ? (
          <div className="space-y-3 sm:space-y-4">
            {!!transactions.length && (
              <section aria-labelledby="dashboard-transaksi" className="relative overflow-hidden rounded-[24px] border border-white/90 bg-gradient-to-br from-[#E5F8EC] via-[#F2FCF6] to-[#E7F8EF] p-2.5 shadow-[0_8px_22px_rgba(20,83,45,0.07)] sm:rounded-[28px] sm:p-4">
                <div className="pointer-events-none absolute -right-8 -top-14 h-36 w-36 rounded-full border-[18px] border-emerald-300/15" />
                <div className="pointer-events-none absolute -right-16 -top-5 h-36 w-36 rounded-full border-[18px] border-emerald-300/10" />
                <div className="relative">
                  <div className="mb-2 flex items-center gap-2 sm:mb-3">
                    <span className="h-7 w-1 rounded-full bg-emerald-500 sm:h-8" />
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm sm:h-11 sm:w-11">
                      <ShoppingCartIcon className="h-6 w-6" />
                    </span>
                    <h2 id="dashboard-transaksi" className="text-base font-extrabold text-slate-900 sm:text-xl">Transaksi</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-5">
                    {transactions.map((menu) => <MenuCard key={menu.code} menu={menu} />)}
                  </div>
                </div>
              </section>
            )}

            {!!reports.length && (
              <section aria-labelledby="dashboard-laporan" className="relative overflow-hidden rounded-[24px] border border-white/90 bg-gradient-to-br from-[#EAF7FE] via-[#F5FBFF] to-[#E8F5FD] p-2.5 shadow-[0_8px_22px_rgba(14,116,190,0.07)] sm:rounded-[28px] sm:p-4">
                <div className="pointer-events-none absolute -right-8 -top-14 h-36 w-36 rounded-full border-[18px] border-sky-300/15" />
                <div className="pointer-events-none absolute -right-16 -top-5 h-36 w-36 rounded-full border-[18px] border-sky-300/10" />
                <div className="relative">
                  <div className="mb-2 flex items-center gap-2 sm:mb-3">
                    <span className="h-7 w-1 rounded-full bg-sky-500 sm:h-8" />
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500 text-white shadow-sm sm:h-11 sm:w-11">
                      <ClipboardDocumentListIcon className="h-6 w-6" />
                    </span>
                    <h2 id="dashboard-laporan" className="text-base font-extrabold text-slate-900 sm:text-xl">Laporan</h2>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:gap-3 md:grid-cols-5 xl:grid-cols-6">
                    {reports.map((menu) => <MenuCard key={menu.code} menu={menu} />)}
                  </div>
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
            Belum ada hak akses Transaksi atau Laporan untuk akun ini. Hubungi administrator untuk mengatur izin.
          </div>
        )}
      </div>
    </div>
  );
}
