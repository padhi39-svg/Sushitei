"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { rupiah } from "@/lib/format";
import Spinner from "@/components/Spinner";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type Periode = { Kode: number; Keterangan: string; TglMulai?: string; TglAkhir?: string };
type Gudang = { Kode: string; Keterangan: string };

type RekapRow = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  totalQty: number;
  hpp: number;
  totalNilai: number;
};

type DetailBahan = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  qty: number;
  hpp: number;
  subTotal: number;
};

type DetailRow = {
  penjualanCode: number;
  kodeNota: string;
  tgl: string;
  gudang: string;
  keterangan: string | null;
  pelangganNama: string | null;
  brgKode: string;
  brgNama: string;
  qtyJual: number;
  hppPerPcs: number;
  totalHpp: number;
  bahan: DetailBahan[];
};

function fmt(v: any) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "-";
  return "Rp " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tgl(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const REKAP_COLS: { key: string; label: string; align: "left" | "right"; fmt: "angka" | "rupiah" | "text"; locked?: boolean; filterable?: boolean }[] = [
  { key: "bahanKode", label: "Kode Bahan Baku", align: "left", fmt: "text", locked: true, filterable: true },
  { key: "bahanNama", label: "Nama Bahan Baku", align: "left", fmt: "text", filterable: true },
  { key: "satuan", label: "Satuan", align: "left", fmt: "text", filterable: true },
  { key: "totalQty", label: "Total Qty", align: "right", fmt: "angka" },
  { key: "hpp", label: "HPP/Satuan", align: "right", fmt: "rupiah" },
  { key: "totalNilai", label: "Total Nilai", align: "right", fmt: "rupiah" },
];

const DETAIL_COLS: { key: string; label: string; align: "left" | "right"; fmt: "angka" | "rupiah" | "text"; locked?: boolean; filterable?: boolean }[] = [
  { key: "penjualanCode", label: "No. Transaksi", align: "left", fmt: "text", locked: true, filterable: true },
  { key: "kodeNota", label: "Kode Nota", align: "left", fmt: "text", filterable: true },
  { key: "tgl", label: "Tanggal", align: "left", fmt: "text", filterable: true },
  { key: "gudang", label: "Gudang", align: "left", fmt: "text", filterable: true },
  { key: "brgKode", label: "Kode Barang Jadi", align: "left", fmt: "text", filterable: true },
  { key: "brgNama", label: "Nama Barang Jadi", align: "left", fmt: "text", filterable: true },
  { key: "qtyJual", label: "Qty Jual", align: "right", fmt: "angka" },
  { key: "hppPerPcs", label: "HPP/pcs", align: "right", fmt: "rupiah" },
  { key: "totalHpp", label: "Total HPP", align: "right", fmt: "rupiah" },
];

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function LaporanPemakaianPenjualanPage() {
  const [periodeList, setPeriodeList] = useState<Periode[]>([]);
  const [gudangList, setGudangList] = useState<Gudang[]>([]);

  const [tglAwal, setTglAwal] = useState("");
  const [tglAkhir, setTglAkhir] = useState("");
  const [gudang, setGudang] = useState("all");
  const [mode, setMode] = useState<"rekap" | "detail">("rekap");
  const [filterSet, setFilterSet] = useState(false);

  const [rekapRows, setRekapRows] = useState<RekapRow[]>([]);
  const [rekapTotal, setRekapTotal] = useState(0);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [visibleCols, setVisibleCols] = useState<string[]>(REKAP_COLS.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);
  const [pivotOn, setPivotOn] = useState(false);
  const [pivotFields, setPivotFields] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragField, setDragField] = useState<string | null>(null);
  const [dragOverField, setDragOverField] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    Promise.all([
      fetch("/api/laporan/mutasi-persediaan?mode=periode", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/laporan/mutasi-persediaan?mode=gudang&cabang=" + encodeURIComponent(getCabangFromCookie()), { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([p, g]) => {
        const plist = Array.isArray(p?.rows) ? p.rows : [];
        setPeriodeList(plist);
        if (plist.length) {
          setTglAwal(plist[0].TglMulai ? plist[0].TglMulai.slice(0, 10) : "");
          setTglAkhir(plist[0].TglAkhir ? plist[0].TglAkhir.slice(0, 10) : "");
        }
        setGudangList(Array.isArray(g?.rows) ? g.rows : []);
      })
      .catch(() => setError("Gagal memuat master periode/gudang"));
  }, []);

  const colKey = mode === "rekap" ? "laporan_pemakaian_penjualan.rekap.columns.visible" : "laporan_pemakaian_penjualan.detail.columns.visible";
  const pivotKey = mode === "rekap" ? "laporan_pemakaian_penjualan.rekap.pivot" : "laporan_pemakaian_penjualan.detail.pivot";

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(colKey);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          const valid = mode === "rekap" ? REKAP_COLS : DETAIL_COLS;
          const filtered = arr.filter((k) => valid.some((c) => c.key === k));
          if (filtered.length) setVisibleCols(filtered);
        }
      }
    } catch {}
    try {
      const saved = window.localStorage.getItem(pivotKey);
      if (saved) {
        const o = JSON.parse(saved);
        if (typeof o.on === "boolean") setPivotOn(o.on);
        if (Array.isArray(o.fields)) setPivotFields(o.fields);
      }
    } catch {}
  }, [mode, colKey, pivotKey]);

  useEffect(() => {
    try { window.localStorage.setItem(colKey, JSON.stringify(visibleCols)); } catch {}
    try { window.localStorage.setItem(pivotKey, JSON.stringify({ on: pivotOn, fields: pivotFields })); } catch {}
  }, [mode, colKey, pivotKey, visibleCols, pivotOn, pivotFields]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!filterSet || !tglAwal || !tglAkhir) return;
    let alive = true;
    setLoading(true);
    setError("");
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ mode, tglAwal, tglAkhir, gudang });
        const cabang = getCabangFromCookie();
        if (cabang) params.set("cabang", cabang);
        const res = await fetch(`/api/laporan/persediaan-penjualan?${params.toString()}`, { cache: "no-store" });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(d?.error || "Gagal memuat laporan");
          setRekapRows([]); setDetailRows([]);
        } else {
          if (mode === "rekap") {
            setRekapRows(Array.isArray(d.rows) ? d.rows : []);
            setRekapTotal(Number(d.totalNilai || 0));
          } else {
            setDetailRows(Array.isArray(d.rows) ? d.rows : []);
            setDetailTotal(Number(d.totalHpp || 0));
          }
        }
      } catch {
        if (alive) { setError("Gagal memuat laporan"); setRekapRows([]); setDetailRows([]); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [filterSet, mode, tglAwal, tglAkhir, gudang]);

  const runReport = () => {
    if (!tglAwal || !tglAkhir) { setError("Pilih tanggal terlebih dahulu"); return; }
    setError("");
    setFilterSet(true);
  };

  const resetFilter = () => {
    setFilterSet(false);
    setRekapRows([]);
    setDetailRows([]);
  };

  const exportExcel = () => {
    if (mode === "rekap" && !rekapRows.length) return;
    if (mode === "detail" && !detailRows.length) return;

    const filterInfo = [
      ["LAPORAN PEMAKAIAN PENJUALAN"],
      [`Versi: ${mode === "rekap" ? "REKAP (Ringkasan Bahan Baku)" : "DETAIL (per Penjualan Item)"}`],
      [`Periode: ${tgl(tglAwal)} s/d ${tgl(tglAkhir)}`],
      [`Gudang: ${gudang === "all" ? "Semua" : gudang}`],
      [],
    ];

    let html = "";

    if (mode === "rekap") {
      const headerRow = ["Kode Bahan Baku", "Nama Bahan Baku", "Satuan", "Total Qty", "HPP/Satuan", "Total Nilai"]
        .map((h) => `<th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">${h}</th>`)
        .join("");
      const dataRows = rekapRows.map((r) => `
        <tr>
          <td style="padding:4px;border:1px solid #ddd;">${r.bahanKode}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.bahanNama}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.satuan}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.totalQty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.hpp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.totalNilai.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `).join("");
      const footerRow = `<tr style="font-weight:bold;background:#E0F2F1;">
        <td colspan="5" style="padding:4px;border:1px solid #ddd;">TOTAL</td>
        <td style="text-align:right;padding:4px;border:1px solid #ddd;">${rekapTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;
      html = `
        <html><head><meta charset="utf-8"><title>Pemakaian Penjualan - Rekap</title></head>
        <body><table>
          ${filterInfo.map((row) => `<tr><td colspan="6" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
          <tr>${headerRow}</tr>${dataRows}${footerRow}
        </table></body></html>`;
    } else {
      let detailHtml = "";
      for (const r of detailRows) {
        detailHtml += `<tr style="background:#E0F2F1;font-weight:bold;">
          <td style="padding:4px;border:1px solid #ddd;">${r.penjualanCode}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.kodeNota}</td>
          <td style="padding:4px;border:1px solid #ddd;">${tgl(r.tgl)}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.brgKode}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.brgNama}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.qtyJual.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.hppPerPcs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.totalHpp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
        for (const b of r.bahan) {
          detailHtml += `<tr>
            <td style="padding:4px;border:1px solid #ddd;"></td>
            <td style="padding:4px;border:1px solid #ddd;"></td>
            <td style="padding:4px;border:1px solid #ddd;"></td>
            <td style="padding:4px;border:1px solid #ddd;">${b.bahanKode}</td>
            <td style="padding:4px;border:1px solid #ddd;">${b.bahanNama}</td>
            <td style="text-align:right;padding:4px;border:1px solid #ddd;">${b.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
            <td style="text-align:right;padding:4px;border:1px solid #ddd;">${b.hpp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align:right;padding:4px;border:1px solid #ddd;">${b.subTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>`;
        }
      }
      detailHtml += `<tr style="font-weight:bold;background:#E0F2F1;">
        <td colspan="6" style="padding:4px;border:1px solid #ddd;">TOTAL HPP</td>
        <td style="text-align:right;padding:4px;border:1px solid #ddd;">${detailTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;
      html = `
        <html><head><meta charset="utf-8"><title>Pemakaian Penjualan - Detail</title></head>
        <body><table>
          ${filterInfo.map((row) => `<tr><td colspan="7" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
          <tr>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">No. Transaksi</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Kode Nota</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Tanggal</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Kode Barang Jadi</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Nama Barang Jadi</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Qty Jual</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">HPP/pcs</th>
            <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Total HPP</th>
          </tr>${detailHtml}
        </table></body></html>`;
    }
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pemakaian-penjualan-${mode}-${tglAwal}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colsDef = mode === "rekap" ? REKAP_COLS : DETAIL_COLS;
  const pivotable = mode === "rekap" ? ["bahanKode", "bahanNama", "satuan"] : ["gudang", "kodeNota", "brgKode", "brgNama"];
  const activePivot = pivotOn && pivotFields.length > 0;
  const pivotPool = pivotable.filter((k) => !pivotFields.includes(k));
  const numericCols = colsDef.filter((c) => c.fmt === "angka" || c.fmt === "rupiah");

  const filteredByCol = useMemo<any[]>(() => {
    let data: any[] = mode === "rekap" ? rekapRows : detailRows;
    for (const [colKey, vals] of Object.entries(colFilters)) {
      if (!vals.length) continue;
      const set = new Set(vals.map((v) => v.toLowerCase()));
      data = data.filter((r: any) => set.has(String((r as any)[colKey] ?? "").toLowerCase()));
    }
    return data;
  }, [mode, rekapRows, detailRows, colFilters]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredByCol;
    const col = colsDef.find((c) => c.key === sortKey);
    return [...filteredByCol].sort((a: any, b: any) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return sortDir === "asc" ? na - nb : nb - na;
      return sortDir === "asc"
        ? String(va ?? "").localeCompare(String(vb ?? ""), "id")
        : String(vb ?? "").localeCompare(String(va ?? ""), "id");
    });
  }, [filteredByCol, sortKey, sortDir, sortDir, colsDef]);

  // Flat array untuk detail mode: setiap barang jadi jadi satu baris, lalu masing-masing bahan jadi sub-baris
  const detailFlatRows = useMemo(() => {
    if (mode !== "detail") return [];
    const flat: any[] = [];
    for (const r of sortedData as DetailRow[]) {
      flat.push({ type: "main", row: r });
      for (const b of r.bahan) {
        flat.push({ type: "bahan", row: r, bahan: b });
      }
    }
    return flat;
  }, [mode, sortedData]);

  const isVisible = (k: string) => visibleCols.includes(k);
  const toggleVisible = (k: string) => {
    const col = colsDef.find((c) => c.key === k);
    if (!col || col.locked) return;
    setVisibleCols((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };
  const addPivotField = (key: string) => {
    setPivotFields((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setPivotOn(true);
  };
  const removePivotField = (key: string) => {
    setPivotFields((prev) => prev.filter((k) => k !== key));
  };
  const toggleCollapsed = (nodeKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const toggleFilterValue = (colKey: string, val: string) => {
    setColFilters((prev) => {
      const cur = prev[colKey] || [];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
      const out = { ...prev };
      if (next.length) out[colKey] = next;
      else delete out[colKey];
      return out;
    });
  };

  const visible = colsDef.filter((c) => isVisible(c.key));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.length).length;

  const SortIcon = ({ active, order }: { active: boolean; order: string }) =>
    active ? <span className="text-[9px]">{order === "asc" ? "▲" : "▼"}</span> : <span className="text-[9px] opacity-40">⇅</span>;
  const FilterIcon = ({ active }: { active: boolean }) =>
    <span className={"text-[10px] leading-none px-1 rounded " + (active ? "bg-teal-light text-white" : "bg-white/25 text-white hover:bg-white/40")}>▾</span>;

  // ---------- Rekap table (non-pivot) ----------
  const renderRekapTable = () => (
    <table className="report-table bordered" style={{ minWidth: `${Math.max(900, visible.length * 130)}px` }}>
      <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
        <tr>
          {visible.map((c) => (
            <th key={c.key} className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"}`} onClick={() => !c.locked && toggleSort(c.key)}>
              <span className="inline-flex items-center gap-1">
                {c.label}
                {!c.locked && (
                  <>
                    <SortIcon active={sortKey === c.key} order={sortDir} />
                    {c.filterable && <span onClick={(e) => { e.stopPropagation(); setOpenFilterCol((v) => (v === c.key ? null : c.key)); }}><FilterIcon active={((colFilters[c.key] || []).length > 0)} /></span>}
                  </>
                )}
              </span>
              {c.filterable && openFilterCol === c.key && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-slate-700" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[10px] font-bold text-slate-600 mb-1">Filter {c.label}</div>
                  <div className="max-h-56 overflow-auto pr-1 space-y-0.5">
                    {(colFilters[c.key] || []).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-[11px] hover:bg-teal-bg px-1 py-0.5 rounded cursor-pointer">
                        <input type="checkbox" className="accent-[#2BA8A2]" checked={((colFilters[c.key] || []) as string[]).includes(v)} onChange={() => toggleFilterValue(c.key, v)} />
                        <span className="truncate">{v}</span>
                      </label>
                    ))}
                    {!(colFilters[c.key] || []).length && <div className="text-[11px] text-slate-400 px-1 py-1">Tidak ada nilai</div>}
                  </div>
                  <div className="mt-1.5 flex justify-between items-center">
                    <button onClick={() => setColFilters((p) => { const o = { ...p }; delete o[c.key]; return o; })} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Reset</button>
                    <button onClick={() => setOpenFilterCol(null)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                  </div>
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedData.map((r: any, i) => (
          <tr key={r.bahanKode + "-" + i} className="border-b border-slate-200 hover:bg-teal-bg/30">
            {visible.map((c) => (
              <td key={c.key} className={"border-r border-slate-200 last:border-r-0 " + (c.align === "right" ? "text-right " : "")}>
                {c.key === "satuan" ? r.satuan : c.fmt === "rupiah" ? rupiah(r[c.key]) : c.fmt === "angka" ? r[c.key].toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(r[c.key] ?? "-")}
              </td>
            ))}
          </tr>
        ))}
        {!sortedData.length && <tr><td colSpan={visible.length} className="text-center text-slate-400 py-6">Tidak ada data untuk filter ini</td></tr>}
      </tbody>
      {sortedData.length > 0 && (
        <tfoot className="bg-teal-bg/40 font-bold">
          <tr>
            {visible.map((c, idx) => {
              if (idx === 0) return <td key={c.key} className="border-r border-slate-200">TOTAL</td>;
              if (c.fmt === "text") return <td key={c.key} className="border-r border-slate-200"></td>;
              const sum = sortedData.reduce((s: number, r: any) => s + Number(r[c.key] || 0), 0);
              return <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{c.fmt === "rupiah" ? rupiah(sum) : sum.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>;
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );

  // ---------- Rekap pivot ----------
  const renderRekapPivot = () => {
    const makeSum = (rs: any[]): Record<string, number> => {
      const s: Record<string, number> = {};
      for (const c of numericCols) {
        let t = 0;
        for (const r of rs) t += Number(r[c.key] || 0);
        s[c.key] = t;
      }
      return s;
    };
    const root: any = { key: "", value: "", depth: -1, count: sortedData.length, sum: makeSum(sortedData), children: [], rows: [] };
    const build = (node: any, rs: any[], depth: number) => {
      const field = pivotFields[depth];
      const seen = new Map<string, any[]>();
      for (const r of rs) {
        const v = String(r[field] ?? "(kosong)");
        if (!seen.has(v)) seen.set(v, []);
        seen.get(v)!.push(r);
      }
      node.children = Array.from(seen.entries()).map(([v, sub]) => {
        const key = (node.key ? node.key + "|" : "") + `${field}=${v}`;
        const child: any = { key, value: v, depth, count: sub.length, sum: makeSum(sub), children: [], rows: [] };
        if (depth + 1 < pivotFields.length) build(child, sub, depth + 1);
        else child.rows = sub;
        return child;
      });
    };
    build(root, sortedData, 0);

    const renderNode = (node: any): JSX.Element[] => {
      const out: JSX.Element[] = [];
      const visibleColsDef = colsDef.filter((c) => visibleCols.includes(c.key));
      for (const child of node.children) {
        const field = pivotFields[child.depth];
        const fieldLabel = colsDef.find((c) => c.key === field)?.label || field;
        const isCollapsed = collapsed.has(child.key);
        out.push(
          <tr key={"g-" + child.key} className="bg-teal-bg/40 font-bold">
            <td colSpan={visibleColsDef.length} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
              <button onClick={() => toggleCollapsed(child.key)} className="mr-1 text-[10px] w-4 h-4 inline-flex items-center justify-center rounded border border-slate-400 text-slate-600 hover:bg-white" title={isCollapsed ? "Buka grup" : "Tutup grup"}>
                {isCollapsed ? "+" : "–"}
              </button>
              {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
            </td>
          </tr>
        );
        if (!isCollapsed) {
          if (child.depth + 1 < pivotFields.length) {
            out.push(...renderNode(child));
          } else {
            for (let i = 0; i < child.rows.length; i++) {
              const r = child.rows[i];
              out.push(
                <tr key={r.bahanKode + "-" + i} className="border-b border-slate-200 hover:bg-teal-bg/30">
                  {visibleColsDef.map((c) => (
                    <td key={c.key} className={"border-r border-slate-200 last:border-r-0 " + (c.align === "right" ? "text-right " : "")}>
                      {c.key === "satuan" ? r.satuan : c.fmt === "rupiah" ? rupiah(r[c.key]) : c.fmt === "angka" ? r[c.key].toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(r[c.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              );
            }
          }
          out.push(
            <tr key={"s-" + child.key} className="bg-teal-bg/70 font-bold">
              <td colSpan={visibleColsDef.length} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
                Subtotal {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
              </td>
              {visibleColsDef.slice(1).map((c) => {
                if (c.fmt === "text") return <td key={c.key} className="border-r border-slate-200" />;
                const v = child.sum[c.key] ?? 0;
                return <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 font-bold">{c.fmt === "rupiah" ? rupiah(v) : v.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>;
              })}
            </tr>
          );
        }
      }
      return out;
    };

    return (
      <table className="report-table bordered" style={{ minWidth: `${Math.max(900, visible.length * 130)}px` }}>
        <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
          <tr>
            {visible.map((c) => (
              <th key={c.key} className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"}`} onClick={() => !c.locked && toggleSort(c.key)}>
                {c.label}
                {!c.locked && <SortIcon active={sortKey === c.key} order={sortDir} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{renderNode(root)}</tbody>
        <tfoot className="bg-teal-bg/40 font-bold">
          <tr>
            {visible.map((c, idx) => {
              if (idx === 0) return <td key={c.key} className="border-r border-slate-200">TOTAL KESELURUHAN</td>;
              if (c.fmt === "text") return <td key={c.key} className="border-r border-slate-200"></td>;
              const sum = sortedData.reduce((s: number, r: any) => s + Number(r[c.key] || 0), 0);
              return <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{c.fmt === "rupiah" ? rupiah(sum) : sum.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>;
            })}
          </tr>
        </tfoot>
      </table>
    );
  };

  // ---------- Detail table ----------
  const renderDetailTable = () => {
    return (
      <table className="report-table bordered" style={{ minWidth: `${Math.max(1000, visible.length * 130)}px` }}>
        <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
          <tr>
            {visible.map((c) => (
              <th key={c.key} className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"}`} onClick={() => !c.locked && toggleSort(c.key)}>
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {!c.locked && (
                    <>
                      <SortIcon active={sortKey === c.key} order={sortDir} />
                      {c.filterable && <span onClick={(e) => { e.stopPropagation(); setOpenFilterCol((v) => (v === c.key ? null : c.key)); }}><FilterIcon active={((colFilters[c.key] || []).length > 0)} /></span>}
                    </>
                  )}
                </span>
                {c.filterable && openFilterCol === c.key && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-slate-700" onClick={(e) => e.stopPropagation()}>
                    <div className="text-[10px] font-bold text-slate-600 mb-1">Filter {c.label}</div>
                    <div className="max-h-56 overflow-auto pr-1 space-y-0.5">
                      {(colFilters[c.key] || []).map((v) => (
                        <label key={v} className="flex items-center gap-2 text-[11px] hover:bg-teal-bg px-1 py-0.5 rounded cursor-pointer">
                          <input type="checkbox" className="accent-[#2BA8A2]" checked={((colFilters[c.key] || []) as string[]).includes(v)} onChange={() => toggleFilterValue(c.key, v)} />
                          <span className="truncate">{v}</span>
                        </label>
                      ))}
                      {!(colFilters[c.key] || []).length && <div className="text-[11px] text-slate-400 px-1 py-1">Tidak ada nilai</div>}
                    </div>
                    <div className="mt-1.5 flex justify-between items-center">
                      <button onClick={() => setColFilters((p) => { const o = { ...p }; delete o[c.key]; return o; })} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Reset</button>
                      <button onClick={() => setOpenFilterCol(null)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                    </div>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detailFlatRows.map((item: any, i: number) => {
            if (item.type === "main") {
              const r = item.row;
              return (
                <tr key={r.penjualanCode + "-" + i} className="border-b border-slate-200 bg-teal-bg/20">
                  {visible.map((c) => (
                    <td key={c.key} className={"border-r border-slate-200 last:border-r-0 " + (c.align === "right" ? "text-right " : "")}>
                      {c.key === "tgl" ? tgl(r.tgl) : c.key === "totalHpp" ? fmt(r.totalHpp) : c.key === "hppPerPcs" ? fmt(r.hppPerPcs) : c.key === "qtyJual" ? r.qtyJual.toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(r[c.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              );
            }
            const b = item.bahan;
            const r = item.row;
            return (
              <tr key={`bahan-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                {visible.map((c, idx) => {
                  if (idx < 4) return <td key={c.key} className="border-r border-slate-200" />;
                  if (c.key === "qtyJual") return <td key={c.key} className="text-right tabular-nums text-[10px] text-slate-500 border-r border-slate-200">{b.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} {b.satuan}</td>;
                  if (c.key === "hppPerPcs") return <td key={c.key} className="text-right tabular-nums text-[10px] text-slate-500 border-r border-slate-200">{fmt(b.hpp)}</td>;
                  if (c.key === "totalHpp") return <td key={c.key} className="text-right tabular-nums text-[10px] text-slate-500 border-r border-slate-200">{fmt(b.subTotal)}</td>;
                  return <td key={c.key} className="border-r border-slate-200" />;
                })}
              </tr>
            );
          })}
          {!detailFlatRows.length && <tr><td colSpan={visible.length} className="text-center text-slate-400 py-6">Tidak ada data untuk filter ini</td></tr>}
        </tbody>
        {detailFlatRows.length > 0 && (
          <tfoot className="bg-teal-bg/40 font-bold">
            <tr>
              {visible.map((c, idx) => {
                if (idx === 0) return <td key={c.key} className="border-r border-slate-200">TOTAL</td>;
                if (c.fmt === "text") return <td key={c.key} className="border-r border-slate-200"></td>;
                const sum = sortedData.reduce((s: number, r: any) => s + Number(r[c.key] || 0), 0);
                return <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{c.fmt === "rupiah" ? rupiah(sum) : sum.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    );
  };

  const renderPivotArea = () => {
    if (!pivotOn) return null;
    return (
      <div className="mb-2 rounded-lg border border-dashed border-teal-primary/60 bg-teal-bg/30 p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragField) { if (!pivotFields.includes(dragField)) addPivotField(dragField); setDragField(null); setDragOverField(null); } }}>
        <div className="text-[10px] font-bold text-slate-600 mb-1.5">Area Baris (tahan & tarik field ke sini, urutan dari kiri ke kanan = berjenjang)</div>
        <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
          {pivotFields.map((key, idx) => {
            const label = colsDef.find((c) => c.key === key)?.label || key;
            return (
              <span key={key} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }} onDragEnd={() => { setDragField(null); setDragOverField(null); }} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverField(key); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const from = dragField; if (from && from !== key) { setPivotFields((prev) => { const arr = prev.filter((k) => k !== from); arr.splice(idx, 0, from); return arr; }); } setDragField(null); setDragOverField(null); }} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold cursor-move select-none ${dragOverField === key ? "ring-2 ring-amber-400" : ""}`}>
                {idx + 1}. {label}
                <button onClick={(e) => { e.stopPropagation(); removePivotField(key); }} className="ml-0.5 hover:text-white/80 text-[10px]">✕</button>
              </span>
            );
          })}
          {pivotFields.length === 0 && <span className="text-[11px] text-slate-400">Belum ada field — tarik field di bawah ke sini.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] text-slate-500 mr-1">Sumber field:</span>
          {pivotPool.map((key) => {
            const label = colsDef.find((c) => c.key === key)?.label || key;
            return (
              <span key={key} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }} onDragEnd={() => setDragField(null)} onClick={() => addPivotField(key)} className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-slate-300 text-[11px] text-slate-600 cursor-grab hover:border-teal-primary hover:text-teal-dark select-none">
                {label}
              </span>
            );
          })}
          {pivotPool.length === 0 && <span className="text-[11px] text-slate-400">Semua field sudah dipakai.</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm md:text-base font-bold text-slate-800">Laporan Pemakaian Penjualan</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Bahan baku yang terpakai dari penjualan barang jadi (berdasarkan resep / master ingredient)</p>
        </div>
        {filterSet && ((mode === "rekap" && rekapRows.length > 0) || (mode === "detail" && detailRows.length > 0)) && (
          <button onClick={exportExcel} className="btn-primary disabled:opacity-50">Export Excel</button>
        )}
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Versi Laporan</label>
            <select value={mode} onChange={(e) => { setMode(e.target.value as "rekap" | "detail"); setFilterSet(false); setRekapRows([]); setDetailRows([]); }} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[180px]">
              <option value="rekap">Rekap (Ringkasan Bahan Baku)</option>
              <option value="detail">Detail (per Penjualan Item)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dari Tanggal</label>
            <input type="date" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" value={tglAwal} onChange={(e) => setTglAwal(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sampai Tanggal</label>
            <input type="date" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" value={tglAkhir} onChange={(e) => setTglAkhir(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gudang</label>
            <select value={gudang} onChange={(e) => setGudang(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[180px]">
              <option value="all">Semua Gudang</option>
              {gudangList.map((g) => <option key={g.Kode} value={g.Kode}>{g.Kode} - {g.Keterangan}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={runReport} disabled={!tglAwal || !tglAkhir} className="btn-primary disabled:opacity-50">Tampilkan</button>
            {filterSet && <button onClick={resetFilter} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50">Ganti Filter</button>}
          </div>
          {error && <span className="text-xs text-red-600">{error}</span>}
          {activeFilterCount > 0 && <button onClick={() => setColFilters({})} className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-600 text-[11px] font-semibold hover:bg-amber-50">{activeFilterCount} filter kolom aktif ✕</button>}
        </div>
      </div>

      {!filterSet ? (
        <div className="report-card report-card-pad">
          <div className="text-center py-10 text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm font-semibold text-slate-600">Pilih filter terlebih dahulu</div>
            <div className="text-xs mt-1">Laporan akan dimuat setelah tombol Tampilkan ditekan.</div>
          </div>
        </div>
      ) : loading ? (
        <div className="report-card report-card-pad"><Spinner label="Memuat laporan..." /></div>
      ) : null}

      {filterSet && !loading && mode === "rekap" && (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Laporan Pemakaian Penjualan - Rekap</div>
            <div className="text-xs text-slate-600 mt-1">Periode : {tgl(tglAwal)} s/d {tgl(tglAkhir)} | Gudang: {gudang === "all" ? "Semua" : gudang}</div>
          </div>
          <div className="report-card report-card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs text-slate-500">Klik judul kolom untuk sorting. Klik ikon ▾ di judul untuk filter nilai kolom.</span>
              <div className="flex items-center gap-2 relative">
                <button onClick={() => setPivotOn((v) => !v)} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${pivotOn ? "border-teal-primary bg-teal-primary text-white" : "border-teal-primary text-teal-primary hover:bg-teal-bg"}`} title="Tampilkan seperti pivot (Excel): tarik field ke Area Baris">
                  Pivot {pivotOn ? "✓" : ""}
                </button>
                {activePivot && (
                  <>
                    <button onClick={() => setCollapsed(new Set())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Buka Semua</button>
                    <button onClick={() => setCollapsed(new Set())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Tutup Semua</button>
                  </>
                )}
                <div className="relative">
                  <button onClick={() => setShowColPicker((v) => !v)} className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-xs font-semibold hover:bg-teal-bg">Pilih Kolom</button>
                  {showColPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowColPicker(false)} />
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-40">
                        <div className="text-[10px] font-bold text-slate-600 mb-2">Tampilkan Kolom</div>
                        <div className="max-h-72 overflow-auto pr-1 space-y-1">
                          {colsDef.map((c) => (
                            <label key={c.key} className="flex items-center gap-2 text-xs">
                              <input type="checkbox" className="accent-[#2BA8A2]" checked={isVisible(c.key)} disabled={c.locked} onChange={() => toggleVisible(c.key)} />
                              <span className={c.locked ? "text-slate-400" : ""}>{c.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between">
                          <button onClick={() => setVisibleCols(colsDef.map((c) => c.key))} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Semua</button>
                          <button onClick={() => setShowColPicker(false)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {pivotOn && renderPivotArea()}
            <ResponsiveReportTable style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {activePivot ? renderRekapPivot() : renderRekapTable()}
            </ResponsiveReportTable>
          </div>
          <div className="report-card report-card-pad grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Jumlah Bahan Baku</div>
              <div className="text-sm font-bold text-slate-800">{rekapRows.length}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total Nilai HPP</div>
              <div className="text-sm font-bold text-teal-dark">{fmt(rekapTotal)}</div>
            </div>
          </div>
        </>
      )}

      {filterSet && !loading && mode === "detail" && (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Laporan Pemakaian Penjualan - Detail</div>
            <div className="text-xs text-slate-600 mt-1">Periode : {tgl(tglAwal)} s/d {tgl(tglAkhir)} | Gudang: {gudang === "all" ? "Semua" : gudang}</div>
          </div>
          <div className="report-card report-card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs text-slate-500">Klik judul kolom untuk sorting. Klik ikon ▾ di judul untuk filter nilai kolom.</span>
              <div className="flex items-center gap-2 relative">
                <button onClick={() => setPivotOn((v) => !v)} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${pivotOn ? "border-teal-primary bg-teal-primary text-white" : "border-teal-primary text-teal-primary hover:bg-teal-bg"}`} title="Tampilkan seperti pivot (Excel): tarik field ke Area Baris">
                  Pivot {pivotOn ? "✓" : ""}
                </button>
                {activePivot && (
                  <>
                    <button onClick={() => setCollapsed(new Set())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Buka Semua</button>
                    <button onClick={() => setCollapsed(new Set())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Tutup Semua</button>
                  </>
                )}
                <div className="relative">
                  <button onClick={() => setShowColPicker((v) => !v)} className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-xs font-semibold hover:bg-teal-bg">Pilih Kolom</button>
                  {showColPicker && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowColPicker(false)} />
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-40">
                        <div className="text-[10px] font-bold text-slate-600 mb-2">Tampilkan Kolom</div>
                        <div className="max-h-72 overflow-auto pr-1 space-y-1">
                          {colsDef.map((c) => (
                            <label key={c.key} className="flex items-center gap-2 text-xs">
                              <input type="checkbox" className="accent-[#2BA8A2]" checked={isVisible(c.key)} disabled={c.locked} onChange={() => toggleVisible(c.key)} />
                              <span className={c.locked ? "text-slate-400" : ""}>{c.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between">
                          <button onClick={() => setVisibleCols(colsDef.map((c) => c.key))} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Semua</button>
                          <button onClick={() => setShowColPicker(false)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {pivotOn && renderPivotArea()}
            <ResponsiveReportTable style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {activePivot ? renderDetailTable() : renderDetailTable()}
            </ResponsiveReportTable>
          </div>
          <div className="report-card report-card-pad grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Jumlah Transaksi Penjualan</div>
              <div className="text-sm font-bold text-slate-800">{detailRows.length}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total HPP</div>
              <div className="text-sm font-bold text-teal-dark">{fmt(detailTotal)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
