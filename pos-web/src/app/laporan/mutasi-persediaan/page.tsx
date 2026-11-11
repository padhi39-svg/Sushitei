"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { rupiah, angka } from "@/lib/format";
import Spinner from "@/components/Spinner";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type Periode = { Kode: number; Keterangan: string };
type Gudang = { Kode: string; Keterangan: string };

type ColDef = {
  key: string;
  label: string;
  group: "info" | "stok" | "nilai";
  align?: "left" | "right";
  fmt?: "angka" | "rupiah" | "text";
  locked?: boolean; // tidak bisa disembunyikan
  filterable?: boolean; // bisa difilter dari header (pilihan data)
};

const COLS: ColDef[] = [
  { key: "KodeBarang", label: "Kode Barang", group: "info", fmt: "text", locked: true },
  { key: "NamaBarang", label: "Nama Barang", group: "info", fmt: "text", filterable: true },
  { key: "Gudang", label: "Gudang", group: "info", fmt: "text", filterable: true },
  { key: "Kategori", label: "Kategori", group: "info", fmt: "text", filterable: true },
  { key: "Golongan", label: "Golongan", group: "info", fmt: "text", filterable: true },

  { key: "StokAwal", label: "Stok Awal", group: "stok", align: "right", fmt: "angka" },
  { key: "Pembelian", label: "Pembelian", group: "stok", align: "right", fmt: "angka" },
  { key: "ReturJual", label: "Retur Jual", group: "stok", align: "right", fmt: "angka" },
  { key: "TransferMasuk", label: "Transfer Masuk", group: "stok", align: "right", fmt: "angka" },
  { key: "Lain2Masuk", label: "Lain2 Masuk", group: "stok", align: "right", fmt: "angka" },
  { key: "Penjualan", label: "Penjualan", group: "stok", align: "right", fmt: "angka" },
  { key: "ReturBeli", label: "Retur Beli", group: "stok", align: "right", fmt: "angka" },
  { key: "TransferKeluar", label: "Transfer Keluar", group: "stok", align: "right", fmt: "angka" },
  { key: "Lain2Keluar", label: "Lain2 Keluar", group: "stok", align: "right", fmt: "angka" },
  { key: "StokAkhir", label: "Stok Akhir", group: "stok", align: "right", fmt: "angka" },

  { key: "NilaiPersediaanAwal", label: "Nilai Persediaan Awal", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiPembelian", label: "Nilai Pembelian", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiReturJual", label: "Nilai Retur Jual", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiLain2Masuk", label: "Nilai Lain2 Masuk", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiPenjualan", label: "Nilai Penjualan", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiReturBeli", label: "Nilai Retur Beli", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiLain2Keluar", label: "Nilai Lain2 Keluar", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "NilaiPersediaanAkhir", label: "Nilai Persediaan Akhir", group: "nilai", align: "right", fmt: "rupiah" },

  { key: "HargaPokokAwal", label: "HPP Awal", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "HargaPokokAkhir", label: "HPP Akhir", group: "nilai", align: "right", fmt: "rupiah" },
  { key: "Satuan", label: "Satuan", group: "info", fmt: "text" },
];

const COL_KEY = "laporan_mutasi_persediaan.columns.visible";
const PIVOT_KEY = "laporan_mutasi_persediaan.pivot";

// Kolom info yang bisa ditarik jadi pivot (Area Baris)
const PIVOTABLE = ["Gudang", "Golongan", "Kategori", "Satuan", "NamaBarang"];

type PivotNode = {
  key: string; // "Gudang=SUB" atau "Gudang=SUB|Golongan=BAHAN BAKU"
  value: string;
  depth: number;
  count: number;
  sum: Record<string, number>;
  children: PivotNode[];
  rows: any[];
};

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function LaporanMutasiPersediaanPage() {
  const [periodeList, setPeriodeList] = useState<Periode[]>([]);
  const [gudangList, setGudangList] = useState<Gudang[]>([]);

  // Filter lokal (belum dijalankan)
  const [periode, setPeriode] = useState<number | "">("");
  const [gudang, setGudang] = useState("");
  const [q, setQ] = useState("");
  const [filterSet, setFilterSet] = useState(false); // sudah klik "Tampilkan"?

  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sorting
  const [sortKey, setSortKey] = useState<string>("KodeBarang");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Pilih kolom
  const [visibleCols, setVisibleCols] = useState<string[]>(COLS.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);

  // Filter per kolom (dipilih dari header): { kolomKey: [nilai...] }
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Pivot (group-by dinamis seperti Excel)
  const [pivotOn, setPivotOn] = useState(false);
  const [pivotFields, setPivotFields] = useState<string[]>(["Gudang", "Golongan"]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragField, setDragField] = useState<string | null>(null);
  const [dragOverField, setDragOverField] = useState<string | null>(null);

  // Master periode & gudang
  useEffect(() => {
    Promise.all([
      fetch("/api/laporan/mutasi-persediaan?mode=periode", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/laporan/mutasi-persediaan?mode=gudang&cabang=" + encodeURIComponent(getCabangFromCookie()), { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([p, g]) => {
        setPeriodeList(Array.isArray(p?.rows) ? p.rows : []);
        setGudangList(Array.isArray(g?.rows) ? g.rows : []);
      })
      .catch(() => setError("Gagal memuat master periode/gudang"));
  }, []);

  // Muat / simpan preferensi kolom (localStorage, sama seperti D:\pos)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COL_KEY);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((k) => COLS.some((c) => c.key === k));
          if (filtered.length) setVisibleCols(filtered);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(COL_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);

  // Muat / simpan preferensi pivot (localStorage)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PIVOT_KEY);
      if (saved) {
        const o = JSON.parse(saved);
        if (typeof o.on === "boolean") setPivotOn(o.on);
        if (Array.isArray(o.fields) && o.fields.length) {
          const valid = o.fields.filter((k: string) => PIVOTABLE.includes(k));
          if (valid.length) setPivotFields(valid);
        }
      }
    } catch {}
  }, []);
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

  // Data laporan (hanya setelah filterSet = true)
  useEffect(() => {
    if (!filterSet || !periode || !gudang) return;
    let alive = true;
    setLoading(true);
    setError("");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/laporan/mutasi-persediaan?periode=${periode}&gudang=${encodeURIComponent(gudang)}&q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(d?.error || "Gagal memuat laporan");
          setRows([]); setTotal(0);
        } else {
          setRows(Array.isArray(d.rows) ? d.rows : []);
          setTotal(Number(d.total || 0));
          setTotals(d.totals || {});
        }
      } catch {
        if (alive) { setError("Gagal memuat laporan"); setRows([]); setTotal(0); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [filterSet, periode, gudang, q]);

  // Filter kolom: ambil daftar nilai unik dari data yang ada di halaman ini
  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of COLS) {
      if (!c.filterable) continue;
      const set = new Set<string>();
      for (const r of rows) {
        const v = r[c.key];
        if (v !== null && v !== undefined && v !== "") set.add(String(v));
      }
      out[c.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
    }
    return out;
  }, [rows]);

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
  };

  // Sorting + filter kolom (client side)
  const sortedRows = useMemo(() => {
    let data = rows;
    // terapkan filter kolom
    for (const [colKey, vals] of Object.entries(colFilters)) {
      if (!vals.length) continue;
      const set = new Set(vals.map((v) => v.toLowerCase()));
      data = data.filter((r) => set.has(String(r[colKey] ?? "").toLowerCase()));
    }
    if (!sortKey) return data;
    const col = COLS.find((c) => c.key === sortKey);
    const sorted = [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      // kolom numerik (stok & nilai rupiah) harus bandingkan angka, bukan teks
      if (col && (col.fmt === "rupiah" || col.fmt === "angka")) {
        const na = Number(va || 0);
        const nb = Number(vb || 0);
        return na - nb;
      }
      const sa = String(va ?? "").toLowerCase();
      const sb = String(vb ?? "").toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDir, colFilters]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const visible = COLS.filter((c) => isVisible(c.key));

  // ===== Pivot helpers =====
  const activePivot = pivotOn && pivotFields.length > 0;
  const pivotPool = PIVOTABLE.filter((k) => !pivotFields.includes(k));
  // Kolom detail: kolom tampil tanpa field yang sudah jadi pivot (tidak duplikat)
  const detailCols = activePivot ? visible.filter((c) => !pivotFields.includes(c.key)) : visible;
  const numericCols = COLS.filter((c) => c.fmt === "angka" || c.fmt === "rupiah");

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

  // Bangun pohon pivot dari baris terfilter+tersort (urutan kemunculan pertama)
  const pivotRoot: PivotNode = useMemo(() => {
    const makeSum = (rs: any[]): Record<string, number> => {
      const s: Record<string, number> = {};
      for (const c of numericCols) {
        let t = 0;
        for (const r of rs) t += Number(r[c.key] || 0);
        s[c.key] = t;
      }
      return s;
    };
    if (!activePivot) return { key: "", value: "", depth: -1, count: sortedRows.length, sum: makeSum(sortedRows), children: [], rows: sortedRows };
    const root: PivotNode = { key: "", value: "", depth: -1, count: sortedRows.length, sum: makeSum(sortedRows), children: [], rows: [] };
    const build = (node: PivotNode, rs: any[], depth: number) => {
      const field = pivotFields[depth];
      const seen = new Map<string, any[]>();
      for (const r of rs) {
        const v = String(r[field] ?? "(kosong)");
        if (!seen.has(v)) seen.set(v, []);
        seen.get(v)!.push(r);
      }
      node.children = Array.from(seen.entries()).map(([v, sub]) => {
        const key = (node.key ? node.key + "|" : "") + `${field}=${v}`;
        const child: PivotNode = { key, value: v, depth, count: sub.length, sum: makeSum(sub), children: [], rows: [] };
        if (depth + 1 < pivotFields.length) build(child, sub, depth + 1);
        else child.rows = sub;
        return child;
      });
    };
    build(root, sortedRows, 0);
    return root;
  }, [activePivot, pivotFields, sortedRows]);

  // Render baris pivot (rekursif): header grup + baris detail + sub-footer grup di BAWAH
  const leadingInfoCount = (() => {
    let n = 0;
    for (const c of detailCols) {
      if (c.group === "info") n++;
      else break;
    }
    return Math.max(n, 1);
  })();

  // Baris sub-footer: label menyatu kolom info awal + angka sejajar (satu baris, di bawah grupnya)
  const subtotalRow = (child: PivotNode) => {
    const field = pivotFields[child.depth];
    const fieldLabel = COLS.find((c) => c.key === field)?.label || field;
    return (
      <tr key={"s-" + child.key} className="bg-teal-bg/70 font-bold">
        <td colSpan={leadingInfoCount} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
          Subtotal {fieldLabel}: {child.value} <span className="font-normal text-slate-500">({child.count} baris)</span>
        </td>
        {detailCols.slice(leadingInfoCount).map((c) => {
          if (c.group === "info") return <td key={c.key} className="border-r border-slate-200" />;
          const v = child.sum[c.key] ?? 0;
          return (
            <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 font-bold">
              {c.fmt === "rupiah" ? rupiah(v) : angka(v, 2)}
            </td>
          );
        })}
      </tr>
    );
  };

  const renderPivotRows = (node: PivotNode): JSX.Element[] => {
    const out: JSX.Element[] = [];
    for (const child of node.children) {
      const field = pivotFields[child.depth];
      const fieldLabel = COLS.find((c) => c.key === field)?.label || field;
      const isCollapsed = collapsed.has(child.key);
      // Baris header grup: hanya judul (menyatu semua kolom detail)
      out.push(
        <tr key={"g-" + child.key} className="bg-teal-bg/40 font-bold">
          <td colSpan={detailCols.length} style={{ paddingLeft: `${8 + child.depth * 18}px` }}>
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
            const r = child.rows[i];
            out.push(
              <tr key={`${r.KodeBarang}-${r.KodeGudang}-${i}`} className="border-b border-slate-200 hover:bg-teal-bg/30">
                {detailCols.map((c) => (
                  <td
                    key={c.key}
                    className={
                      "border-r border-slate-200 last:border-r-0 " +
                      (c.align === "right" ? "text-right " : "") +
                      (c.fmt === "rupiah" ? "font-semibold" : "")
                    }
                  >
                    {fmtCell(r, c)}
                  </td>
                ))}
              </tr>
            );
          }
        }
        // Sub-footer di bawah grup (setelah semua detail / sub-grup selesai)
        out.push(subtotalRow(child));
      }
    }
    return out;
  };

  const fmtCell = (r: any, c: ColDef) => {
    if (c.key === "Satuan") {
      return (
        <span className="whitespace-nowrap">
          {r.SatuanTerkecil || "-"}
          {r.SatuanTerbesar && r.SatuanTerbesar !== r.SatuanTerkecil ? ` / ${r.SatuanTerbesar}` : ""}
        </span>
      );
    }
    if (c.fmt === "rupiah") return <span className="whitespace-nowrap">{rupiah(r[c.key])}</span>;
    if (c.fmt === "angka") return <span className="whitespace-nowrap">{angka(r[c.key], 2)}</span>;
    return <span>{r[c.key] ?? "-"}</span>;
  };

  const exportExcel = () => {
    if (!sortedRows.length) return;

    const visibleHeaders = visible.map((c) => c.label);

    const filterInfo = [
      ["REKAP MUTASI NILAI PERSEDIAAN PER PERIODE PER GUDANG"],
      [`Periode: ${periode}`],
      [`Gudang: ${gudang}`],
      [`Total Baris: ${total}`],
      [],
    ];

    const headerRow = visibleHeaders.map((h) => `<th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">${h}</th>`).join("");

    const dataRows = sortedRows.map((r: any) => {
      const cells = visible.map((c) => {
        let val: any;
        if (c.key === "Satuan") {
          val = [r.SatuanTerkecil, r.SatuanTerbesar].filter((v: any) => v && v !== r.SatuanTerkecil).join(" / ") || r.SatuanTerkecil || "";
        } else {
          val = r[c.key];
        }
        if (c.fmt === "rupiah") {
          const n = Number(val || 0);
          return `<td style="text-align:right;padding:4px;border:1px solid #ddd;">${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        }
        if (c.fmt === "angka") {
          const n = Number(val || 0);
          return `<td style="text-align:right;padding:4px;border:1px solid #ddd;">${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>`;
        }
        return `<td style="padding:4px;border:1px solid #ddd;">${val ?? ""}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const footerRow = visible.map((c, idx) => {
      if (idx === 0) return `<td style="font-weight:bold;padding:4px;border:1px solid #ddd;">TOTAL</td>`;
      if (c.group === "info") return `<td style="padding:4px;border:1px solid #ddd;"></td>`;
      const val = totals[c.key];
      if (c.fmt === "rupiah") {
        const n = Number(val || 0);
        return `<td style="text-align:right;font-weight:bold;padding:4px;border:1px solid #ddd;">${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
      }
      if (c.fmt === "angka") {
        const n = Number(val || 0);
        return `<td style="text-align:right;font-weight:bold;padding:4px;border:1px solid #ddd;">${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>`;
      }
      return `<td style="padding:4px;border:1px solid #ddd;"></td>`;
    }).join("");

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Rekap Mutasi Persediaan</title></head>
      <body>
        <table>
          ${filterInfo.map((row) => `<tr><td colspan="${visible.length}" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
          <tr>${headerRow}</tr>
          ${dataRows}
          <tr>${footerRow}</tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-mutasi-persediaan-${periode}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runReport = () => {
    if (!periode) { setError("Pilih periode terlebih dahulu"); return; }
    if (!gudang) { setError("Pilih gudang terlebih dahulu"); return; }
    setError("");
    setFilterSet(true);
  };

  const resetFilter = () => {
    setFilterSet(false);
    setRows([]);
    setTotal(0);
    setTotals({});
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

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Rekap Mutasi Nilai Persediaan per Periode per Gudang</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Acuan query ReportList <code>ID 5056</code> — SQL Server Omega (PeriodeBrg + PeriodeHrgPokok).
          </p>
        </div>
        {filterSet && (
          <button onClick={exportExcel} disabled={!rows.length} className="btn-primary disabled:opacity-50">
            Export Excel
          </button>
        )}
      </div>

      {/* Filter - wajib pilih periode + gudang dulu */}
      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Periode <span className="text-red-500">*</span>
            </label>
            <select
              value={periode}
              onChange={(e) => { setPeriode(e.target.value ? Number(e.target.value) : ""); }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[220px]"
            >
              <option value="">-- Pilih Periode --</option>
              {periodeList.map((p) => (
                <option key={p.Kode} value={p.Kode}>
                  {p.Keterangan} ({p.Kode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Gudang <span className="text-red-500">*</span>
            </label>
            <select
              value={gudang}
              onChange={(e) => setGudang(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[220px]"
            >
              <option value="">-- Pilih Gudang --</option>
              {gudangList.map((g) => (
                <option key={g.Kode} value={g.Kode}>{g.Keterangan}</option>
              ))}
              <option value="all">Semua Gudang</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cari Barang</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kode / nama barang..."
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-64"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={runReport} disabled={!periode || !gudang} className="btn-primary disabled:opacity-50">
              Tampilkan
            </button>
            {filterSet && (
              <button onClick={resetFilter} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                Ganti Filter
              </button>
            )}
          </div>

          {filterSet && <span className="badge">{total} baris</span>}
          {activeFilterCount > 0 && (
            <button
              onClick={() => setColFilters({})}
              className="px-2.5 py-1 rounded-full border border-amber-400 text-amber-600 text-[11px] font-semibold hover:bg-amber-50"
              title="Hapus semua filter kolom"
            >
              {activeFilterCount} filter kolom aktif ✕
            </button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {!filterSet ? (
        <div className="report-card report-card-pad">
          <div className="text-center py-10 text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm font-semibold text-slate-600">Pilih Periode dan Gudang terlebih dahulu</div>
            <div className="text-xs mt-1">Laporan akan dimuat setelah tombol Tampilkan ditekan.</div>
          </div>
        </div>
      ) : (
        <>
          {/* Ringkasan */}
          <div className="report-card report-card-pad grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Nilai Persediaan Awal</div>
              <div className="text-sm font-bold text-slate-800">{rupiah(totals.NilaiPersediaanAwal)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Nilai Pembelian</div>
              <div className="text-sm font-bold text-slate-800">{rupiah(totals.NilaiPembelian)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Nilai Penjualan</div>
              <div className="text-sm font-bold text-slate-800">{rupiah(totals.NilaiPenjualan)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Nilai Persediaan Akhir</div>
              <div className="text-sm font-bold text-teal-dark">{rupiah(totals.NilaiPersediaanAkhir)}</div>
            </div>
          </div>

          {/* Tabel */}
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

            {/* AREA PIVOT (Excel): tarik field ke atas untuk group-by berjenjang */}
            {pivotOn && (
              <div className="mb-2 rounded-lg border border-dashed border-teal-primary/60 bg-teal-bg/30 p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragField) { if (!pivotFields.includes(dragField)) addPivotField(dragField); setDragField(null); setDragOverField(null); } }}>
                <div className="text-[10px] font-bold text-slate-600 mb-1.5">
                  Area Baris (tahan & tarik field ke sini, urutan dari kiri ke kanan = berjenjang)
                </div>
                <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                  {pivotFields.map((key, idx) => {
                    const label = COLS.find((c) => c.key === key)?.label || key;
                    return (
                      <span
                        key={key}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }}
                        onDragEnd={() => { setDragField(null); setDragOverField(null); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverField(key); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const from = dragField;
                          if (from && from !== key) {
                            setPivotFields((prev) => {
                              const arr = prev.filter((k) => k !== from);
                              arr.splice(idx, 0, from);
                              return arr;
                            });
                          }
                          setDragField(null); setDragOverField(null);
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold cursor-move select-none ${dragOverField === key ? "ring-2 ring-amber-400" : ""}`}
                        title="Seret untuk tukar urutan, klik ✕ untuk kembalikan"
                      >
                        {idx + 1}. {label}
                        <button onClick={(e) => { e.stopPropagation(); removePivotField(key); }} className="ml-0.5 hover:text-white/80 text-[10px]" title="Hapus dari pivot">✕</button>
                      </span>
                    );
                  })}
                  {pivotFields.length === 0 && <span className="text-[11px] text-slate-400">Belum ada field — tarik field di bawah ke sini.</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 mr-1">Sumber field:</span>
                  {pivotPool.map((key) => {
                    const label = COLS.find((c) => c.key === key)?.label || key;
                    return (
                      <span
                        key={key}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", key); setDragField(key); }}
                        onDragEnd={() => setDragField(null)}
                        onClick={() => addPivotField(key)}
                        className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-slate-300 text-[11px] text-slate-600 cursor-grab hover:border-teal-primary hover:text-teal-dark select-none"
                        title="Seret ke Area Baris di atas (klik juga bisa)"
                      >
                        {label}
                      </span>
                    );
                  })}
                  {pivotPool.length === 0 && <span className="text-[11px] text-slate-400">Semua field sudah dipakai.</span>}
                </div>
              </div>
            )}

            <ResponsiveReportTable>
              <table className="report-table bordered" style={{ minWidth: `${Math.max(1200, detailCols.length * 140)}px` }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                  <tr>
                    {detailCols.map((c) => {
                      const sel = colFilters[c.key] || [];
                      return (
                        <th
                          key={c.key}
                          className={`relative cursor-pointer select-none ${c.align === "right" ? "text-right" : "text-left"}`}
                          onClick={() => toggleSort(c.key)}
                          title="Klik untuk sorting"
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
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
                  {loading && <tr><td colSpan={detailCols.length}><Spinner /></td></tr>}
                  {!loading && activePivot
                    ? renderPivotRows(pivotRoot)
                    : !loading && sortedRows.map((r: any, i: number) => (
                        <tr key={`${r.KodeBarang}-${r.KodeGudang}-${i}`} className="border-b border-slate-200 hover:bg-teal-bg/30">
                          {detailCols.map((c) => (
                            <td
                              key={c.key}
                              className={
                                "border-r border-slate-200 last:border-r-0 " +
                                (c.align === "right" ? "text-right " : "") +
                                (c.fmt === "rupiah" ? "font-semibold" : "")
                              }
                            >
                              {fmtCell(r, c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                  {!loading && !sortedRows.length && (
                    <tr>
                      <td colSpan={detailCols.length} className="text-center text-slate-400 py-6">
                        {error ? "Gagal memuat laporan" : "Tidak ada data untuk filter ini"}
                      </td>
                    </tr>
                  )}
                </tbody>
                {!loading && sortedRows.length > 0 && (
                  <tfoot className="bg-teal-bg/40 font-bold">
                    <tr>
                      {detailCols.map((c, idx) => {
                        if (idx === 0) return <td key={c.key} className="border-r border-slate-200">{activePivot ? "TOTAL KESELURUHAN" : "TOTAL"}</td>;
                        if (c.group === "info") return <td key={c.key} className="border-r border-slate-200"></td>;
                        return (
                          <td key={c.key} className="text-right whitespace-nowrap border-r border-slate-200 last:border-r-0">
                            {c.fmt === "rupiah" ? rupiah(totals[c.key]) : angka(totals[c.key], 2)}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </ResponsiveReportTable>
          </div>
        </>
      )}
    </div>
  );
}
