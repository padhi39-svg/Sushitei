"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import PivotArea from "@/components/PivotArea";
import { buildPivotTree, type PivotNode } from "@/lib/pivot";
import { rupiah } from "@/lib/format";

type Row = {
  id: number; code: number; kodeNota: string; tgl: string; cabang: string; gudang: string;
  pelangganKode: string | null; pelangganNama: string | null; keterangan: string | null;
  total: string; status: string; isVoid: number; itemCount: number; createdAt: string;
};

type ColDef = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  locked?: boolean; // tidak bisa disembunyikan (aksi)
  filterable?: boolean; // bisa difilter dari header (pilihan data)
};

const COLS: ColDef[] = [
  { key: "no", label: "No.", align: "center", locked: true },
  { key: "kodeNota", label: "Kode Nota", align: "left", filterable: true },
  { key: "tgl", label: "Tanggal", align: "left", filterable: true },
  { key: "gudang", label: "Gudang", align: "left", filterable: true },
  { key: "pelanggan", label: "Pelanggan", align: "left", filterable: true },
  { key: "itemCount", label: "Detail", align: "right" },
  { key: "total", label: "Total", align: "right", filterable: true },
  { key: "status", label: "Status", align: "left", filterable: true },
  { key: "aksi", label: "Aksi", align: "center", locked: true },
];

const COL_KEY = "laporan_penjualan.columns.visible";
const PIVOT_KEY = "laporan_penjualan.pivot";
const PIVOTABLE = ["kodeNota", "tgl", "gudang", "pelanggan", "status"];
const NUMERIC_KEYS = ["itemCount", "total"];

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function PenjualanListPage() {
  const [itemsRaw, setItemsRaw] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // Pilih kolom (localStorage, sama seperti D:\pos reports)
  const [visibleCols, setVisibleCols] = useState<string[]>(COLS.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);

  // Filter per kolom (dipilih dari header): { kolomKey: [nilai...] }
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<string>("kodeNota");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Pivot (group-by dinamis seperti Excel)
  const [pivotOn, setPivotOn] = useState(false);
  const [pivotFields, setPivotFields] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Muat preferensi kolom dari localStorage
    try {
      const saved = window.localStorage.getItem(COL_KEY);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((k) => COLS.some((c) => c.key === k));
          const lockedKeys = COLS.filter((c) => c.locked).map((c) => c.key);
          const merged = Array.from(new Set([...lockedKeys, ...filtered]));
          if (merged.length) setVisibleCols(merged);
        }
      }
    } catch {}
    try {
      const saved = window.localStorage.getItem(PIVOT_KEY);
      if (saved) {
        const o = JSON.parse(saved);
        if (typeof o.on === "boolean") setPivotOn(o.on);
        if (Array.isArray(o.fields)) {
          const valid = o.fields.filter((k: string) => PIVOTABLE.includes(k));
          setPivotFields(valid);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(COL_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);
  useEffect(() => {
    try { window.localStorage.setItem(PIVOT_KEY, JSON.stringify({ on: pivotOn, fields: pivotFields })); } catch {}
  }, [pivotOn, pivotFields]);

  // Tutup dropdown filter kolom saat klik di luar
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null);
      }
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

  // Muat data (saat pivot aktif ambil semua baris, bukan hanya satu halaman)
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
        if (status) params.set("status", status);
        if (pivotOn) params.set("all", "1");
        const cabang = getCabangFromCookie();
        if (cabang) params.set("cabang", cabang);
        const res = await fetch(`/api/penjualan?${params.toString()}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) { setError(d?.error || "Gagal memuat data"); setItemsRaw([]); setTotal(0); }
        else {
          setItemsRaw(Array.isArray(d.rows) ? d.rows : []);
          setTotal(Number(d.total || 0));
          if (page > 1 && Array.isArray(d.rows) && d.rows.length === 0 && Number(d.total || 0) > 0) setPage(page - 1);
        }
      } catch { setError("Gagal memuat data"); setItemsRaw([]); setTotal(0); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, status, page, pageSize, reload, pivotOn]);

  const voidTrx = async (id: number) => {
    if (!confirm("Void/batal transaksi penjualan ini? Data tetap tersimpan.")) return;
    const res = await fetch(`/api/penjualan/${id}`, { method: "PATCH" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d?.error || "Gagal void"); return; }
    setReload((x) => x + 1);
  };

  const tgl = (v: string | null) => {
    if (!v) return "-";
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const statusLabel = (r: Row) => (r.isVoid === 1 || r.status === "VOID" ? "BATAL" : "POSTED");

  // Filter kolom: daftar nilai unik dari data yang ada di halaman ini
  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of COLS) {
      if (!c.filterable) continue;
      const set = new Set<string>();
      for (const r of itemsRaw) {
        const v = c.key === "pelanggan" ? (r.pelangganNama || r.pelangganKode || "") : (r as any)[c.key];
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

  // Sorting + filter kolom (client side)
  const sortedRows = useMemo(() => {
    let data = itemsRaw;
    // terapkan filter kolom
    for (const [colKey, vals] of Object.entries(colFilters)) {
      if (!vals.length) continue;
      const set = new Set(vals.map((v) => v.toLowerCase()));
      data = data.filter((r) => {
        const v = colKey === "pelanggan" ? (r.pelangganNama || r.pelangganKode || "") : (r as any)[colKey];
        return set.has(String(v ?? "").toLowerCase());
      });
    }
    if (!sortKey) return data;
    const sorted = [...data].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      const na = Number(va);
      const nb = Number(vb);
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

  // ===== Pivot helpers =====
  const activePivot = pivotOn && pivotFields.length > 0;
  const pivotPool = PIVOTABLE.filter((k) => !pivotFields.includes(k));
  const tableCols = activePivot ? visible.filter((c) => !pivotFields.includes(c.key)) : visible;

  const pivotValue = (r: Row, key: string) => {
    if (key === "pelanggan") return r.pelangganNama || r.pelangganKode || "(kosong)";
    if (key === "tgl") return tgl(r.tgl);
    if (key === "status") return statusLabel(r);
    return String((r as any)[key] ?? "(kosong)");
  };

  const pivotRoot: PivotNode = useMemo(
    () => buildPivotTree(sortedRows, activePivot ? pivotFields : [], NUMERIC_KEYS, pivotValue),
    [sortedRows, activePivot, pivotFields]
  );

  const toggleCollapsed = (nodeKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };

  const displayRows = pivotOn ? sortedRows : paged;

  const renderAksi = (r: Row) => {
    const isVoid = r.isVoid === 1 || r.status === "VOID";
    return (
      <div className="flex items-center justify-center gap-1">
        <Link href={`/penjualan/${r.id}`} className="text-teal-600 hover:text-teal-800" title="Lihat">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </Link>
        {!isVoid && (
          <Link href={`/penjualan/${r.id}/edit`} className="text-blue-600 hover:text-blue-800" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Link>
        )}
        {!isVoid && (
          <button onClick={() => voidTrx(r.id)} className="text-red-600 hover:text-red-800" title="Void/Batal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  const fmtCell = (r: Row, c: ColDef, rowNo?: number) => {
    if (c.key === "no") return rowNo ?? "";
    if (c.key === "tgl") return tgl(r.tgl);
    if (c.key === "pelanggan") return r.pelangganNama || r.pelangganKode || "-";
    if (c.key === "total") return rupiah(r.total);
    if (c.key === "status") {
      const isVoid = r.isVoid === 1 || r.status === "VOID";
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isVoid ? "bg-red-100 text-red-700" : "bg-teal-bg text-teal-dark"}`}>
          {isVoid ? "BATAL" : "POSTED"}
        </span>
      );
    }
    if (c.key === "aksi") return renderAksi(r);
    return String((r as any)[c.key] ?? "-");
  };

  const fmtSum = (key: string, v: number) => {
    if (key === "total") return rupiah(v);
    return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  // Render baris pivot (rekursif): header grup + baris detail + sub-footer grup di BAWAH
  const firstNumericIdx = (() => {
    const i = tableCols.findIndex((c) => NUMERIC_KEYS.includes(c.key));
    return i < 0 ? 1 : Math.max(1, i);
  })();

  const subtotalRow = (child: PivotNode) => {
    const fieldLabel = COLS.find((c) => c.key === pivotFields[child.depth])?.label || pivotFields[child.depth];
    const leading = Math.min(firstNumericIdx, tableCols.length);
    return (
      <tr key={"s-" + child.key} className="bg-teal-bg/70 font-bold">
        <td colSpan={leading} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
          Subtotal {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
        </td>
        {tableCols.slice(leading).map((c) => {
          if (!NUMERIC_KEYS.includes(c.key)) return <td key={c.key} className="border-r border-slate-200" />;
          return (
            <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 font-bold">
              {fmtSum(c.key, child.sum[c.key] ?? 0)}
            </td>
          );
        })}
      </tr>
    );
  };

  let pivotSeq = 0;
  const renderPivotRows = (node: PivotNode): JSX.Element[] => {
    const out: JSX.Element[] = [];
    for (const child of node.children) {
      const fieldLabel = COLS.find((c) => c.key === pivotFields[child.depth])?.label || pivotFields[child.depth];
      const isCollapsed = collapsed.has(child.key);
      out.push(
        <tr key={"g-" + child.key} className="bg-teal-bg/40 font-bold">
          <td colSpan={tableCols.length} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
            <button
              onClick={() => toggleCollapsed(child.key)}
              className="mr-1 text-[10px] w-4 h-4 inline-flex items-center justify-center rounded border border-slate-400 text-slate-600 hover:bg-white"
              title={isCollapsed ? "Buka grup" : "Tutup grup"}
            >
              {isCollapsed ? "+" : "–"}
            </button>
            {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
          </td>
        </tr>
      );
      if (!isCollapsed) {
        if (child.depth + 1 < pivotFields.length) {
          out.push(...renderPivotRows(child));
        } else {
          for (let i = 0; i < child.rows.length; i++) {
            const r = child.rows[i] as Row;
            const rowNo = ++pivotSeq;
            const isVoid = r.isVoid === 1 || r.status === "VOID";
            out.push(
              <tr key={`p-${r.id}-${i}`} className={`border-b border-slate-200 hover:bg-teal-bg/30 ${isVoid ? "bg-gray-200 text-gray-500" : ""}`}>
                {tableCols.map((c) => (
                  <td
                    key={c.key}
                    className={
                      "border-r border-slate-200 last:border-r-0 " +
                      (c.align === "right" ? "text-right " : "") +
                      (c.align === "center" ? "text-center " : "") +
                      (isVoid ? "text-gray-500" : "")
                    }
                  >
                    {fmtCell(r, c, rowNo)}
                  </td>
                ))}
              </tr>
            );
          }
        }
        out.push(subtotalRow(child));
      }
    }
    return out;
  };

  const SortIcon = ({ active, order }: { active: boolean; order: string }) =>
    active ? (
      <span className="text-[9px]">{order === "asc" ? "▲" : "▼"}</span>
    ) : (
      <span className="text-[9px] opacity-40">⇅</span>
    );

  const FilterIcon = ({ active }: { active: boolean }) => (
    <span
      className={
        "text-[10px] leading-none px-1 rounded " +
        (active ? "bg-teal-light text-white" : "bg-white/25 text-white hover:bg-white/40")
      }
      title="Filter nilai kolom ini"
    >
      ▾
    </span>
  );

  const runReport = () => { setPage(1); };
  const resetFilter = () => {
    setColFilters({});
    setPage(1);
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-base font-bold text-slate-800">Penjualan</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Transaksi penjualan — harga snapshot dari Master Harga Jual saat simpan pertama.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/penjualan/new" className="btn-primary">+ Transaksi Baru</Link>
          <Link href="/penjualan/import" className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-[11px] font-semibold hover:bg-teal-bg">Import Excel</Link>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[9px] font-semibold text-slate-600 mb-1">Cari</label>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Kode / kode nota / pelanggan / gudang..."
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
            <button
              onClick={resetFilter}
              className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-600 text-[11px] font-semibold hover:bg-amber-50"
              title="Hapus semua filter kolom"
            >
              {activeFilterCount} filter kolom aktif ✕
            </button>
          )}
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-xs text-slate-500">
            Klik judul kolom untuk sorting. Klik ikon ▾ di judul untuk filter nilai kolom.
          </span>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setPivotOn((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${pivotOn ? "border-teal-primary bg-teal-primary text-white" : "border-teal-primary text-teal-primary hover:bg-teal-bg"}`}
              title="Tampilkan seperti pivot (Excel): tarik field ke Area Baris"
            >
              Pivot {pivotOn ? "✓" : ""}
            </button>
            {activePivot && (
              <>
                <button onClick={() => setCollapsed(new Set())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">
                  Buka Semua
                </button>
                <button onClick={() => setCollapsed(new Set(pivotRoot.children.map((c) => c.key)))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">
                  Tutup Semua
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={() => setShowColPicker((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-xs font-semibold hover:bg-teal-bg"
              >
                Pilih Kolom
              </button>
              {showColPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowColPicker(false)} />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-40">
                    <div className="text-[10px] font-bold text-slate-600 mb-2">Tampilkan Kolom</div>
                    <div className="max-h-72 overflow-auto pr-1 space-y-1">
                      {COLS.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="accent-[#2BA8A2]"
                            checked={isVisible(c.key)}
                            disabled={c.locked}
                            onChange={() => toggleVisible(c.key)}
                          />
                          <span className={c.locked ? "text-slate-400" : ""}>{c.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between">
                      <button
                        onClick={() => setVisibleCols(COLS.map((c) => c.key))}
                        className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                      >
                        Semua
                      </button>
                      <button
                        onClick={() => setShowColPicker(false)}
                        className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {pivotOn && (
          <PivotArea fields={pivotFields} onChange={setPivotFields} cols={COLS} pool={pivotPool} />
        )}

        <div className="report-table-wrapper" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table className="report-table bordered" style={{ minWidth: `${Math.max(900, tableCols.length * 130)}px` }}>
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
              <tr>
                {tableCols.map((c) => {
                  const sel = colFilters[c.key] || [];
                  return (
                    <th
                      key={c.key}
                      className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"} ${c.align === "center" ? "text-center" : ""}`}
                      onClick={() => !c.locked && toggleSort(c.key)}
                      title={c.locked ? undefined : "Klik untuk sorting"}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {!c.locked && (
                          <>
                            <SortIcon active={sortKey === c.key} order={sortDir} />
                            {c.filterable && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterCol((v) => (v === c.key ? null : c.key));
                                }}
                              >
                                <FilterIcon active={sel.length > 0} />
                              </span>
                            )}
                          </>
                        )}
                      </span>

                      {/* Dropdown filter nilai kolom */}
                      {c.filterable && openFilterCol === c.key && (
                        <div
                          ref={filterRef}
                          className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-slate-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-[10px] font-bold text-slate-600 mb-1">
                            Filter {c.label}
                          </div>
                          <div className="max-h-56 overflow-auto pr-1 space-y-0.5">
                            {(filterOptions[c.key] || []).map((v) => (
                              <label key={v} className="flex items-center gap-2 text-[11px] hover:bg-teal-bg px-1 py-0.5 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="accent-[#2BA8A2]"
                                  checked={sel.includes(v)}
                                  onChange={() => toggleFilterValue(c.key, v)}
                                />
                                <span className="truncate">{v}</span>
                              </label>
                            ))}
                            {!(filterOptions[c.key] || []).length && (
                              <div className="text-[11px] text-slate-400 px-1 py-1">Tidak ada nilai</div>
                            )}
                          </div>
                          <div className="mt-1.5 flex justify-between items-center">
                            <button
                              onClick={() => setColFilters((p) => { const o = { ...p }; delete o[c.key]; return o; })}
                              className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                            >
                              Reset
                            </button>
                            <button
                              onClick={() => setOpenFilterCol(null)}
                              className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                            >
                              Tutup
                            </button>
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={tableCols.length}><Spinner /></td></tr>}
              {!loading && activePivot && renderPivotRows(pivotRoot)}
              {!loading && !activePivot && displayRows.map((r: Row, i: number) => {
                const rowNo = (pivotOn ? 0 : (page - 1) * pageSize) + i + 1;
                const isVoid = r.isVoid === 1 || r.status === "VOID";
                return (
                <tr key={r.id} className={`border-b border-slate-200 hover:bg-teal-bg/30 ${isVoid ? "bg-gray-200 text-gray-500" : ""}`}>
                  {tableCols.map((c) => {
                    if (c.key === "aksi") {
                      return (
                        <td key={c.key} className="text-center whitespace-nowrap">
                          {renderAksi(r)}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        className={
                          "border-r border-slate-200 last:border-r-0 " +
                          (c.align === "right" ? "text-right " : "") +
                          (c.align === "center" ? "text-center " : "") +
                          (isVoid ? "text-gray-500" : "")
                        }
                      >
                        {fmtCell(r, c, rowNo)}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
              {!loading && !displayRows.length && (
                <tr><td colSpan={tableCols.length} className="text-center text-slate-400 py-6">{error ? "Gagal memuat" : "Belum ada transaksi penjualan"}</td></tr>
              )}
            </tbody>
            {!loading && displayRows.length > 0 && (
              <tfoot className="bg-teal-bg/40 font-bold">
                <tr>
                  {tableCols.map((c, idx) => {
                    if (idx === 0) return <td key={c.key} className="border-r border-slate-200">TOTAL</td>;
                    if (c.key === "total") {
                      const sum = displayRows.reduce((s, r) => s + Number(r.total || 0), 0);
                      return <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{rupiah(sum)}</td>;
                    }
                    return <td key={c.key} className="border-r border-slate-200 last:border-r-0"></td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!pivotOn && (
          <Pagination page={page} pageSize={pageSize} total={sortedRows.length} onPage={setPage}
            onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizes={[20, 50, 100]} />
        )}
      </div>
    </div>
  );
}
