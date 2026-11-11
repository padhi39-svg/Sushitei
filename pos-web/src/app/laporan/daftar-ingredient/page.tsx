"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Spinner from "@/components/Spinner";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type RecipeRow = {
  id: number;
  code: string;
  barangKode: string;
  barangNama: string;
  name: string;
  portion: number;
  description: string;
  aktif: number;
  status: string;
  itemCount: number;
  totalQty: number;
  createdAt: string;
  updatedAt: string;
};

type ItemRow = {
  id: number;
  ingredientId: number;
  code: string;
  barangKode: string;
  barangNama: string;
  name: string;
  portion: number;
  aktif: number;
  status: string;
  bahanKode: string;
  bahanNama: string;
  qty: number;
  satuan: string;
  rasio: number;
  stokDasar: number;
  catatan: string;
  urutan: number;
};

type Col = {
  key: string;
  label: string;
  align: "left" | "right";
  fmt: "text" | "number" | "status";
  filterable?: boolean;
};

const REKAP_COLS: Col[] = [
  { key: "code", label: "Kode Resep", align: "left", fmt: "text", filterable: true },
  { key: "barangKode", label: "Kode Barang", align: "left", fmt: "text", filterable: true },
  { key: "barangNama", label: "Nama Barang Jadi / Setengah Jadi", align: "left", fmt: "text", filterable: true },
  { key: "portion", label: "Porsi", align: "right", fmt: "number" },
  { key: "itemCount", label: "Jml Bahan", align: "right", fmt: "number" },
  { key: "totalQty", label: "Total Qty Dasar", align: "right", fmt: "number" },
  { key: "status", label: "Status", align: "left", fmt: "status", filterable: true },
];

const DETAIL_COLS: Col[] = [
  { key: "code", label: "Kode Resep", align: "left", fmt: "text", filterable: true },
  { key: "barangKode", label: "Kode Barang", align: "left", fmt: "text", filterable: true },
  { key: "barangNama", label: "Nama Barang Jadi / Setengah Jadi", align: "left", fmt: "text", filterable: true },
  { key: "bahanKode", label: "Kode Bahan", align: "left", fmt: "text", filterable: true },
  { key: "bahanNama", label: "Nama Bahan", align: "left", fmt: "text", filterable: true },
  { key: "qty", label: "Qty", align: "right", fmt: "number" },
  { key: "satuan", label: "Satuan", align: "left", fmt: "text", filterable: true },
  { key: "rasio", label: "Rasio", align: "right", fmt: "number" },
  { key: "stokDasar", label: "Stok Dasar", align: "right", fmt: "number" },
  { key: "catatan", label: "Catatan", align: "left", fmt: "text", filterable: true },
];

const REKAP_PIVOT = ["barangKode", "barangNama", "status"];
const DETAIL_PIVOT = ["barangKode", "barangNama", "bahanKode", "bahanNama", "satuan", "status"];

function filterKey(value: any) {
  const text = String(value ?? "").trim();
  return text || "(kosong)";
}

function fmtNumber(value: any) {
  const n = Number(value || 0);
  if (!isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function LaporanDaftarIngredientPage() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [mode, setMode] = useState<"rekap" | "detail">("rekap");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

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
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [readyMode, setReadyMode] = useState("");

  const colsDef = mode === "rekap" ? REKAP_COLS : DETAIL_COLS;
  const pivotable = mode === "rekap" ? REKAP_PIVOT : DETAIL_PIVOT;
  const colKey = mode === "rekap" ? "laporan_daftar_ingredient.rekap.columns.visible" : "laporan_daftar_ingredient.detail.columns.visible";
  const pivotKey = mode === "rekap" ? "laporan_daftar_ingredient.rekap.pivot" : "laporan_daftar_ingredient.detail.pivot";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch("/api/laporan/daftar-ingredient", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Gagal memuat laporan");
        if (!alive) return;
        setRecipes(Array.isArray(data?.recipes) ? data.recipes : []);
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.message || "Gagal memuat laporan");
        setRecipes([]);
        setItems([]);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reload]);

  // Muat preferensi kolom & pivot per versi laporan.
  useEffect(() => {
    setReadyMode("");
    const validCols = (mode === "rekap" ? REKAP_COLS : DETAIL_COLS).map((c) => c.key);
    const validPivot = mode === "rekap" ? REKAP_PIVOT : DETAIL_PIVOT;
    let cols = validCols;
    let pivot: { on?: boolean; fields?: string[] } = { on: false, fields: [] };
    try {
      const savedCols = window.localStorage.getItem(colKey);
      if (savedCols) {
        const arr = JSON.parse(savedCols);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((k) => validCols.includes(k));
          if (filtered.length) cols = filtered;
        }
      }
    } catch {}
    try {
      const savedPivot = window.localStorage.getItem(pivotKey);
      if (savedPivot) pivot = JSON.parse(savedPivot) || pivot;
    } catch {}
    setVisibleCols(cols);
    setPivotOn(Boolean(pivot.on));
    setPivotFields(Array.isArray(pivot.fields) ? pivot.fields.filter((k) => validPivot.includes(k)) : []);
    setCollapsed(new Set());
    setSortKey("");
    setSortDir("asc");
    setColFilters({});
    setOpenFilterCol(null);
    setReadyMode(mode);
  }, [mode, colKey, pivotKey]);

  useEffect(() => {
    if (readyMode !== mode) return;
    try {
      window.localStorage.setItem(colKey, JSON.stringify(visibleCols));
      window.localStorage.setItem(pivotKey, JSON.stringify({ on: pivotOn, fields: pivotFields }));
    } catch {}
  }, [readyMode, mode, colKey, pivotKey, visibleCols, pivotOn, pivotFields]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const baseRows: (RecipeRow | ItemRow)[] = mode === "rekap" ? recipes : items;

  const searchFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return baseRows.filter((row: any) => {
      if (status !== "all" && String(row.status) !== status) return false;
      if (!needle) return true;
      const hay = mode === "rekap"
        ? [row.code, row.barangKode, row.barangNama, row.name, row.description]
        : [row.code, row.barangKode, row.barangNama, row.bahanKode, row.bahanNama, row.satuan, row.catatan];
      return hay.some((v) => String(v ?? "").toLowerCase().includes(needle));
    });
  }, [baseRows, mode, q, status]);

  const optionsByCol = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of colsDef) {
      if (!col.filterable) continue;
      const values = new Set<string>();
      for (const row of searchFiltered as any[]) values.add(filterKey(row[col.key]));
      map[col.key] = Array.from(values).sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
    }
    return map;
  }, [searchFiltered, colsDef]);

  const filteredByCol = useMemo(() => {
    let data: any[] = searchFiltered;
    for (const [key, values] of Object.entries(colFilters)) {
      if (!values.length) continue;
      const set = new Set(values);
      data = data.filter((row) => set.has(filterKey(row[key])));
    }
    return data;
  }, [searchFiltered, colFilters]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredByCol;
    const col = colsDef.find((c) => c.key === sortKey);
    const numeric = col?.fmt === "number";
    return [...filteredByCol].sort((a: any, b: any) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (numeric) {
        const na = Number(va || 0);
        const nb = Number(vb || 0);
        return sortDir === "asc" ? na - nb : nb - na;
      }
      const cmp = String(va ?? "").localeCompare(String(vb ?? ""), "id", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredByCol, sortKey, sortDir, colsDef]);

  const visible = colsDef.filter((c) => visibleCols.includes(c.key));
  const numericCols = colsDef.filter((c) => c.fmt === "number");
  const activePivot = pivotOn && pivotFields.length > 0;
  const pivotPool = pivotable.filter((k) => !pivotFields.includes(k));
  const activeFilterCount = Object.values(colFilters).filter((v) => v.length).length;

  const stats = useMemo(() => {
    const recipesCount = new Set(searchFiltered.map((r: any) => r.code)).size;
    const itemsCount = mode === "rekap"
      ? (searchFiltered as RecipeRow[]).reduce((sum, r) => sum + Number(r.itemCount || 0), 0)
      : searchFiltered.length;
    const totalQty = mode === "rekap"
      ? (searchFiltered as RecipeRow[]).reduce((sum, r) => sum + Number(r.totalQty || 0), 0)
      : (searchFiltered as ItemRow[]).reduce((sum, r) => sum + Number(r.stokDasar || 0), 0);
    return { recipesCount, itemsCount, totalQty };
  }, [searchFiltered, mode]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleVisible = (key: string) => {
    setVisibleCols((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== key);
      }
      const next = colsDef.map((c) => c.key).filter((k) => prev.includes(k) || k === key);
      return next;
    });
  };

  const toggleFilterValue = (colKeyName: string, value: string) => {
    setColFilters((prev) => {
      const current = prev[colKeyName] || [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      const out = { ...prev };
      if (next.length) out[colKeyName] = next;
      else delete out[colKeyName];
      return out;
    });
  };

  const addPivotField = (key: string) => {
    setPivotFields((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setPivotOn(true);
  };
  const removePivotField = (key: string) => setPivotFields((prev) => prev.filter((k) => k !== key));
  const toggleCollapsed = (nodeKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };

  const renderCell = (row: any, col: Col): ReactNode => {
    if (col.fmt === "number") return fmtNumber(row[col.key]);
    if (col.fmt === "status") {
      const active = String(row[col.key]) === "Aktif";
      return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${active ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-600"}`}>
          {String(row[col.key] ?? "-")}
        </span>
      );
    }
    const text = String(row[col.key] ?? "").trim();
    return text || "-";
  };

  const SortIcon = ({ active, order }: { active: boolean; order: string }) =>
    active ? <span className="text-[9px]">{order === "asc" ? "▲" : "▼"}</span> : <span className="text-[9px] opacity-40">⇅</span>;
  const FilterIcon = ({ active }: { active: boolean }) =>
    <span className={"text-[10px] leading-none px-1 rounded " + (active ? "bg-teal-light text-white" : "bg-white/25 text-white hover:bg-white/40")}>▾</span>;

  const renderFilterDropdown = (col: Col) => {
    if (!col.filterable || openFilterCol !== col.key) return null;
    const options = optionsByCol[col.key] || [];
    return (
      <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 text-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-bold text-slate-600 mb-1">Filter {col.label}</div>
        <div className="max-h-56 overflow-auto pr-1 space-y-0.5">
          {options.map((value) => (
            <label key={value} className="flex items-center gap-2 text-[11px] hover:bg-teal-bg px-1 py-0.5 rounded cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#2BA8A2]"
                checked={(colFilters[col.key] || []).includes(value)}
                onChange={() => toggleFilterValue(col.key, value)}
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
          {!options.length && <div className="text-[11px] text-slate-400 px-1 py-1">Tidak ada nilai</div>}
        </div>
        <div className="mt-1.5 flex justify-between items-center">
          <button onClick={() => setColFilters((p) => { const o = { ...p }; delete o[col.key]; return o; })} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Reset</button>
          <button onClick={() => setOpenFilterCol(null)} className="text-[10px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Tutup</button>
        </div>
      </div>
    );
  };

  const renderFlatTable = () => (
    <table className="report-table bordered" style={{ minWidth: `${Math.max(760, visible.length * 125)}px` }}>
      <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
        <tr>
          {visible.map((col) => (
            <th key={col.key} className={`relative cursor-pointer select-none ${col.align === "right" ? "text-right" : "text-left"}`} onClick={() => toggleSort(col.key)}>
              <span className="inline-flex items-center gap-1">
                {col.label}
                <SortIcon active={sortKey === col.key} order={sortDir} />
                {col.filterable && (
                  <span onClick={(e) => { e.stopPropagation(); setOpenFilterCol((v) => (v === col.key ? null : col.key)); }}>
                    <FilterIcon active={((colFilters[col.key] || []).length > 0)} />
                  </span>
                )}
              </span>
              {renderFilterDropdown(col)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedData.map((row: any, index) => (
          <tr key={`${row.code}-${row.bahanKode || ""}-${index}`} className="border-b border-slate-200 hover:bg-teal-bg/30">
            {visible.map((col) => (
              <td key={col.key} className={"border-r border-slate-200 last:border-r-0 " + (col.align === "right" ? "text-right " : "")}>
                {renderCell(row, col)}
              </td>
            ))}
          </tr>
        ))}
        {!sortedData.length && (
          <tr><td colSpan={visible.length} className="text-center text-slate-400 py-6">Tidak ada data untuk filter ini</td></tr>
        )}
      </tbody>
      {sortedData.length > 0 && (
        <tfoot className="bg-teal-bg/40 font-bold">
          <tr>
            {visible.map((col, index) => {
              if (index === 0 && col.fmt !== "number") return <td key={col.key} className="border-r border-slate-200">TOTAL</td>;
              if (col.fmt !== "number") return <td key={col.key} className="border-r border-slate-200"></td>;
              const sum = sortedData.reduce((s: number, row: any) => s + Number(row[col.key] || 0), 0);
              return <td key={col.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{fmtNumber(sum)}</td>;
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );

  const pivotRoot = useMemo(() => {
    if (!activePivot) return null;
    const sumOf = (rows: any[]) => {
      const sum: Record<string, number> = {};
      for (const col of numericCols) {
        sum[col.key] = rows.reduce((s, row) => s + Number(row[col.key] || 0), 0);
      }
      return sum;
    };
    const root: any = { key: "", value: "", depth: -1, count: sortedData.length, sum: sumOf(sortedData), children: [], rows: [] };
    const build = (node: any, rows: any[], depth: number) => {
      const field = pivotFields[depth];
      if (!field) { node.rows = rows; return; }
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const value = String(row[field] ?? "(kosong)");
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value)!.push(row);
      }
      node.children = Array.from(groups.entries()).map(([value, sub]) => {
        const key = (node.key ? node.key + "|" : "") + `${field}=${value}`;
        const child: any = { key, value, depth, count: sub.length, sum: sumOf(sub), children: [], rows: [] };
        if (depth + 1 < pivotFields.length) build(child, sub, depth + 1);
        else child.rows = sub;
        return child;
      });
    };
    build(root, sortedData, 0);
    return root;
  }, [activePivot, pivotFields, sortedData, numericCols]);

  const renderPivotTable = () => {
    if (!pivotRoot) return null;
    const out: ReactNode[] = [];
    const renderNode = (node: any) => {
      for (const child of node.children) {
        const field = pivotFields[child.depth];
        const fieldLabel = colsDef.find((c) => c.key === field)?.label || field;
        const isCollapsed = collapsed.has(child.key);
        out.push(
          <tr key={`g-${child.key}`} className="bg-teal-bg/40 font-bold">
            <td colSpan={visible.length} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
              <button onClick={() => toggleCollapsed(child.key)} className="mr-1 text-[10px] w-4 h-4 inline-flex items-center justify-center rounded border border-slate-400 text-slate-600 hover:bg-white" title={isCollapsed ? "Buka grup" : "Tutup grup"}>
                {isCollapsed ? "+" : "–"}
              </button>
              {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
            </td>
          </tr>
        );
        if (isCollapsed) continue;
        if (child.children.length) {
          renderNode(child);
        } else {
          for (let i = 0; i < child.rows.length; i++) {
            const row = child.rows[i];
            out.push(
              <tr key={`${child.key}-${i}`} className="border-b border-slate-200 hover:bg-teal-bg/30">
                {visible.map((col) => (
                  <td key={col.key} className={"border-r border-slate-200 last:border-r-0 " + (col.align === "right" ? "text-right " : "")}>
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            );
          }
        }
        out.push(
          <tr key={`s-${child.key}`} className="bg-teal-bg/70 font-bold">
            <td className="border-r border-slate-200">
              Subtotal {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
            </td>
            {visible.slice(1).map((col) => {
              if (col.fmt !== "number") return <td key={col.key} className="border-r border-slate-200" />;
              return <td key={col.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{fmtNumber(child.sum[col.key] ?? 0)}</td>;
            })}
          </tr>
        );
      }
    };
    renderNode(pivotRoot);

    return (
      <table className="report-table bordered" style={{ minWidth: `${Math.max(760, visible.length * 125)}px` }}>
        <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
          <tr>
            {visible.map((col) => (
              <th key={col.key} className={`relative cursor-pointer select-none ${col.align === "right" ? "text-right" : "text-left"}`} onClick={() => toggleSort(col.key)}>
                {col.label}
                <SortIcon active={sortKey === col.key} order={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{out}</tbody>
        <tfoot className="bg-teal-bg/40 font-bold">
          <tr>
            {visible.map((col, index) => {
              if (index === 0 && col.fmt !== "number") return <td key={col.key} className="border-r border-slate-200">TOTAL KESELURUHAN</td>;
              if (col.fmt !== "number") return <td key={col.key} className="border-r border-slate-200" />;
              const sum = sortedData.reduce((s: number, row: any) => s + Number(row[col.key] || 0), 0);
              return <td key={col.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">{fmtNumber(sum)}</td>;
            })}
          </tr>
        </tfoot>
      </table>
    );
  };

  const renderPivotArea = () => {
    if (!pivotOn) return null;
    return (
      <div
        className="mb-2 rounded-lg border border-dashed border-teal-primary/60 bg-teal-bg/30 p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragField) {
            if (!pivotFields.includes(dragField)) addPivotField(dragField);
            setDragField(null);
            setDragOverField(null);
          }
        }}
      >
        <div className="text-[10px] font-bold text-slate-600 mb-1.5">Area Baris (tahan &amp; tarik field ke sini, urutan dari kiri ke kanan = berjenjang)</div>
        <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
          {pivotFields.map((key, index) => {
            const label = colsDef.find((c) => c.key === key)?.label || key;
            return (
              <span
                key={key}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }}
                onDragEnd={() => { setDragField(null); setDragOverField(null); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverField(key); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const from = dragField;
                  if (from && from !== key) {
                    setPivotFields((prev) => {
                      const arr = prev.filter((k) => k !== from);
                      arr.splice(index, 0, from);
                      return arr;
                    });
                  }
                  setDragField(null);
                  setDragOverField(null);
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold cursor-move select-none ${dragOverField === key ? "ring-2 ring-amber-400" : ""}`}
              >
                {index + 1}. {label}
                <button onClick={(e) => { e.stopPropagation(); removePivotField(key); }} className="ml-0.5 hover:text-white/80 text-[10px]">✕</button>
              </span>
            );
          })}
          {!pivotFields.length && <span className="text-[11px] text-slate-400">Belum ada field — tarik field di bawah ke sini.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] text-slate-500 mr-1">Sumber field:</span>
          {pivotPool.map((key) => {
            const label = colsDef.find((c) => c.key === key)?.label || key;
            return (
              <span
                key={key}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }}
                onDragEnd={() => setDragField(null)}
                onClick={() => addPivotField(key)}
                className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-slate-300 text-[11px] text-slate-600 cursor-grab hover:border-teal-primary hover:text-teal-dark select-none"
              >
                {label}
              </span>
            );
          })}
          {!pivotPool.length && <span className="text-[11px] text-slate-400">Semua field sudah dipakai.</span>}
        </div>
      </div>
    );
  };

  const exportExcel = () => {
    if (!sortedData.length) return;
    const title = mode === "rekap" ? "LAPORAN DAFTAR INGREDIENT - REKAP RESEP" : "LAPORAN DAFTAR INGREDIENT - DETAIL BAHAN";
    const info = [
      title,
      `Status: ${status === "all" ? "Semua" : status}`,
      q.trim() ? `Pencarian: ${q.trim()}` : "Pencarian: -",
      `Jumlah resep: ${stats.recipesCount} | Jumlah bahan: ${stats.itemsCount} | Total qty dasar: ${fmtNumber(stats.totalQty)}`,
      "",
    ];
    const header = visible.map((col) => `<th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;text-align:${col.align === "right" ? "right" : "left"};">${escapeHtml(col.label)}</th>`).join("");
    const body = sortedData.map((row: any) => `<tr>${visible.map((col) => {
      const text = col.fmt === "number" ? fmtNumber(row[col.key]) : String(row[col.key] ?? "").trim();
      return `<td style="padding:4px;border:1px solid #ddd;text-align:${col.align === "right" ? "right" : "left"};">${escapeHtml(text)}</td>`;
    }).join("")}</tr>`).join("");
    const footer = `<tr style="font-weight:bold;background:#E0F2F1;">${visible.map((col, index) => {
      if (index === 0 && col.fmt !== "number") return `<td style="padding:4px;border:1px solid #ddd;">TOTAL</td>`;
      if (col.fmt !== "number") return `<td style="padding:4px;border:1px solid #ddd;"></td>`;
      const sum = sortedData.reduce((s: number, row: any) => s + Number(row[col.key] || 0), 0);
      return `<td style="padding:4px;border:1px solid #ddd;text-align:right;">${escapeHtml(fmtNumber(sum))}</td>`;
    }).join("")}</tr>`;
    const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><table>
      ${info.map((line) => `<tr><td colspan="${Math.max(1, visible.length)}" style="font-weight:bold;font-size:14px;">${escapeHtml(line)}</td></tr>`).join("")}
      <tr>${header}</tr>${body}${footer}
    </table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `daftar-ingredient-${mode}-${stamp}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm md:text-base font-bold text-slate-800">Laporan Daftar Ingredient</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Daftar resep (BOM) barang jadi / setengah jadi beserta bahan baku yang dipakai. Data diambil dari Master Ingredient.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setReload((v) => v + 1)} disabled={loading} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50 disabled:opacity-50">Muat Ulang</button>
          <button onClick={exportExcel} disabled={!sortedData.length} className="btn-primary disabled:opacity-50">Export Excel</button>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cari</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "rekap" ? "Cari kode resep / kode barang / nama barang..." : "Cari kode resep / barang / bahan / catatan..."}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Versi Laporan</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "rekap" | "detail")} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full">
              <option value="rekap">Rekap Resep</option>
              <option value="detail">Detail Bahan</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status Resep</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full">
              <option value="all">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <div className="mt-2">
            <button onClick={() => setColFilters({})} className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-600 text-[11px] font-semibold hover:bg-amber-50">{activeFilterCount} filter kolom aktif ✕</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="report-card report-card-pad"><Spinner label="Memuat laporan..." /></div>
      ) : error ? (
        <div className="report-card report-card-pad text-sm text-red-600 border border-red-200 bg-red-50">{error}</div>
      ) : (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">{mode === "rekap" ? "Laporan Daftar Ingredient - Rekap Resep" : "Laporan Daftar Ingredient - Detail Bahan"}</div>
            <div className="text-xs text-slate-600 mt-1">Status: {status === "all" ? "Semua" : status}{q.trim() ? ` | Pencarian: ${q.trim()}` : ""}</div>
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
                    <button onClick={() => setCollapsed(new Set((pivotRoot?.children || []).map((c: any) => c.key)))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold hover:bg-slate-50">Tutup Semua</button>
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
                          {colsDef.map((col) => (
                            <label key={col.key} className="flex items-center gap-2 text-xs">
                              <input type="checkbox" className="accent-[#2BA8A2]" checked={visibleCols.includes(col.key)} onChange={() => toggleVisible(col.key)} />
                              <span>{col.label}</span>
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
              {activePivot ? renderPivotTable() : renderFlatTable()}
            </ResponsiveReportTable>
          </div>

          <div className="report-card report-card-pad grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Jumlah Resep</div>
              <div className="text-sm font-bold text-slate-800">{stats.recipesCount}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Jumlah Bahan</div>
              <div className="text-sm font-bold text-slate-800">{stats.itemsCount}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total Qty Dasar</div>
              <div className="text-sm font-bold text-teal-dark">{fmtNumber(stats.totalQty)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
