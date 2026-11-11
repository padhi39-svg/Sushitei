"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import { rupiah } from "@/lib/format";

type Row = {
  id: number; code: number; tgl: string; cabang: string; gudang: string;
  kodeNota: string; kodeNotaPenjualan: string; status: string; isVoid: number; itemCount: number; keterangan: string | null;
};

type ColDef = { key: string; label: string; align?: "left" | "right" | "center"; locked?: boolean; filterable?: boolean; };

const COLS: ColDef[] = [
  { key: "code", label: "No.", align: "center", locked: true },
  { key: "kodeNota", label: "Kode Nota", align: "left", filterable: true },
  { key: "kodeNotaPenjualan", label: "Kode Nota Penjualan", align: "left", filterable: true },
  { key: "tgl", label: "Tanggal", align: "left", filterable: true },
  { key: "gudang", label: "Gudang", align: "left", filterable: true },
  { key: "cabang", label: "Cabang", align: "left", filterable: true },
  { key: "itemCount", label: "Detail", align: "right" },
  { key: "status", label: "Status", align: "left", filterable: true },
  { key: "aksi", label: "Aksi", align: "center", locked: true },
];

const COL_KEY = "kartu_stok.columns.visible";

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function KartuStokListPage() {
  const [itemsRaw, setItemsRaw] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [visibleCols, setVisibleCols] = useState<string[]>(COLS.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<string>("code");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COL_KEY);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((k: string) => COLS.some((c) => c.key === k));
          if (!arr.includes("kodeNota")) filtered.push("kodeNota");
          const lockedKeys = COLS.filter((c) => c.locked).map((c) => c.key);
          const merged = Array.from(new Set([...lockedKeys, ...filtered]));
          if (merged.length) setVisibleCols(merged);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(COL_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setOpenFilterCol(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const isVisible = (k: string) => visibleCols.includes(k);
  const toggleVisible = (k: string) => {
    const col = COLS.find((c) => c.key === k);
    if (!col || col.locked) return;
    setVisibleCols((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
        if (status) params.set("status", status);
        const cabang = getCabangFromCookie();
        if (cabang) params.set("cabang", cabang);
        const res = await fetch(`/api/kartu-stok?${params.toString()}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) { setError(d?.error || "Gagal memuat"); setItemsRaw([]); setTotal(0); }
        else { setItemsRaw(Array.isArray(d.rows) ? d.rows : []); setTotal(Number(d.total || 0)); }
      } catch { setError("Gagal memuat"); setItemsRaw([]); setTotal(0); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, status, page, pageSize, reload]);

  const tgl = (v: string) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of COLS) {
      if (!c.filterable) continue;
      const set = new Set<string>();
      for (const r of itemsRaw) {
        const v = (r as any)[c.key];
        if (v !== null && v !== undefined && v !== "") set.add(String(v));
      }
      out[c.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
    }
    return out;
  }, [itemsRaw]);

  const activeFilterCount = Object.values(colFilters).filter((v) => v.length).length;

  const toggleFilterValue = (colKey: string, val: string) => {
    setColFilters((prev) => {
      const cur = prev[colKey] || [];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
      const out = { ...prev };
      if (next.length) out[colKey] = next;
      else delete out[colKey];
      return out;
    });
    setPage(1);
  };

  const sortedRows = useMemo(() => {
    let data = itemsRaw;
    for (const [colKey, vals] of Object.entries(colFilters)) {
      if (!vals.length) continue;
      const set = new Set(vals.map((v) => v.toLowerCase()));
      data = data.filter((r) => set.has(String((r as any)[colKey] ?? "").toLowerCase()));
    }
    if (!sortKey) return data;
    const sorted = [...data].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      const na = Number(va); const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(va ?? "").localeCompare(String(vb ?? ""), "id");
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [itemsRaw, sortKey, sortDir, colFilters]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const visible = COLS.filter((c) => isVisible(c.key));

  const voidTrx = async (id: number) => {
    if (!confirm("Void/batal transaksi kartu stok ini?")) return;
    const res = await fetch(`/api/kartu-stok/${id}`, { method: "PATCH" });
    if (res.ok) setReload((x) => x + 1);
  };

  const fmtCell = (r: Row, c: ColDef) => {
    if (c.key === "code") return r.code;
    if (c.key === "tgl") return tgl(r.tgl);
    if (c.key === "status") {
      const isVoid = r.isVoid === 1 || r.status === "VOID";
      return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isVoid ? "bg-red-100 text-red-700" : "bg-teal-bg text-teal-dark"}`}>{isVoid ? "BATAL" : "POSTED"}</span>;
    }
    if (c.key === "aksi") return null;
    return String((r as any)[c.key] ?? "-");
  };

  const SortIcon = ({ active, order }: { active: boolean; order: string }) =>
    active ? <span className="text-[9px]">{order === "asc" ? "▲" : "▼"}</span> : <span className="text-[9px] opacity-40">⇅</span>;

  const FilterIcon = ({ active }: { active: boolean }) => (
    <span className={"text-[10px] leading-none px-1 rounded " + (active ? "bg-teal-light text-white" : "bg-white/25 text-white hover:bg-white/40")}>▾</span>
  );

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-base font-bold text-slate-800">Rekonsiliasi Pemakaian Penjualan</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Rekonsiliasi pemakaian bahan baku per nota penjualan.</p>
        </div>
        <Link href="/kartu-stok/new" className="btn-primary">+ Transaksi Baru</Link>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[9px] font-semibold text-slate-600 mb-1">Cari</label>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Kode nota / penjualan / gudang..."
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64" />
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-slate-600 mb-1">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white min-w-[140px]">
              <option value="">Semua</option>
              <option value="POSTED">Posted</option>
              <option value="VOID">Void</option>
            </select>
          </div>
          {loading && <span className="text-xs text-slate-500">Memuat...</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <span className="badge">{total} transaksi</span>
          {activeFilterCount > 0 && (
            <button onClick={() => { setColFilters({}); setPage(1); }} className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-600 text-[11px] font-semibold hover:bg-amber-50">
              {activeFilterCount} filter kolom aktif ✕
            </button>
          )}
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-xs text-slate-500">Klik judul kolom untuk sorting. Klik ikon ▾ untuk filter nilai kolom.</span>
          <div className="relative">
            <button onClick={() => setShowColPicker((v) => !v)} className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-xs font-semibold hover:bg-teal-bg">Pilih Kolom</button>
            {showColPicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowColPicker(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-40">
                  <div className="text-[10px] font-bold text-slate-600 mb-2">Tampilkan Kolom</div>
                  <div className="max-h-72 overflow-auto pr-1 space-y-1">
                    {COLS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" className="accent-[#2BA8A2]" checked={isVisible(c.key)} disabled={c.locked} onChange={() => toggleVisible(c.key)} />
                        <span className={c.locked ? "text-slate-400" : ""}>{c.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between">
                    <button onClick={() => setVisibleCols(COLS.map((c) => c.key))} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Semua</button>
                    <button onClick={() => setShowColPicker(false)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="report-table-wrapper" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table className="report-table bordered" style={{ minWidth: `${Math.max(900, visible.length * 130)}px` }}>
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
              <tr>
                {visible.map((c) => {
                  const sel = colFilters[c.key] || [];
                  return (
                    <th key={c.key} className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"} ${c.align === "center" ? "text-center" : ""}`}
                      onClick={() => !c.locked && toggleSort(c.key)}>
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {!c.locked && (
                          <>
                            <SortIcon active={sortKey === c.key} order={sortDir} />
                            {c.filterable && (
                              <span onClick={(e) => { e.stopPropagation(); setOpenFilterCol((v) => (v === c.key ? null : c.key)); }}>
                                <FilterIcon active={sel.length > 0} />
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      {c.filterable && openFilterCol === c.key && (
                        <div ref={filterRef} className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-slate-700" onClick={(e) => e.stopPropagation()}>
                          <div className="text-[10px] font-bold text-slate-600 mb-1">Filter {c.label}</div>
                          <div className="max-h-56 overflow-auto pr-1 space-y-0.5">
                            {(filterOptions[c.key] || []).map((v) => (
                              <label key={v} className="flex items-center gap-2 text-[11px] hover:bg-teal-bg px-1 py-0.5 rounded cursor-pointer">
                                <input type="checkbox" className="accent-[#2BA8A2]" checked={sel.includes(v)} onChange={() => toggleFilterValue(c.key, v)} />
                                <span className="truncate">{v}</span>
                              </label>
                            ))}
                            {!(filterOptions[c.key] || []).length && <div className="text-[11px] text-slate-400 px-1 py-1">Tidak ada nilai</div>}
                          </div>
                          <div className="mt-1.5 flex justify-between items-center">
                            <button onClick={() => setColFilters((p) => { const o = { ...p }; delete o[c.key]; return o; })} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Reset</button>
                            <button onClick={() => setOpenFilterCol(null)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={visible.length}><Spinner /></td></tr>}
              {!loading && paged.map((r: Row) => {
                const isVoid = r.isVoid === 1 || r.status === "VOID";
                return (
                  <tr key={r.id} className={`border-b border-slate-200 hover:bg-teal-bg/30 ${isVoid ? "bg-gray-200 text-gray-500" : ""}`}>
                    {visible.map((c) => {
                      if (c.key === "aksi") {
                        return (
                          <td key={c.key} className="text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <Link href={`/kartu-stok/${r.id}`} className="text-teal-600 hover:text-teal-800" title="Lihat">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </Link>
                              {!isVoid && (
                                <button onClick={() => voidTrx(r.id)} className="text-red-600 hover:text-red-800" title="Void/Batal">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td key={c.key} className={"border-r border-slate-200 last:border-r-0 " + (c.align === "right" ? "text-right " : "") + (c.align === "center" ? "text-center " : "") + (isVoid ? "text-gray-500" : "")}>
                          {fmtCell(r, c)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!loading && !paged.length && (
                <tr><td colSpan={visible.length} className="text-center text-slate-400 py-6">{error ? "Gagal memuat" : "Belum ada transaksi kartu stok"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={sortedRows.length} onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizes={[10, 20, 50]} />
      </div>
    </div>
  );
}
