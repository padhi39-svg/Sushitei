"use client";
import { useEffect, useState, useMemo } from "react";
import Spinner from "@/components/Spinner";
import SearchableSelect from "@/components/SearchableSelect";
import type { SearchableOption } from "@/components/SearchableSelect";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type Periode = { Kode: number; Keterangan: string; TglMulai?: string; TglAkhir?: string };

type DisplayRow = {
  kode: string;
  nama: string;
  tipe: "header" | "line" | "jumlah" | "grand";
  level: number;
  section: "aktif" | "pasiva";
  saldoAwal: number | null;
  saldoAkhir: number | null;
  perubahan: number | null;
};

type Totals = {
  aktivaAwal: number;
  aktivaAkhir: number;
  pasivaAwal: number;
  pasivaAkhir: number;
  selisihAwal: number;
  selisihAkhir: number;
};

function fmt(n: number | null) {
  if (n === null || n === undefined) return "";
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `(${s})` : s;
}

function bulanDariKeterangan(ket: string) {
  const t = String(ket || "").trim().split(/\s+/)[0] || "";
  return t.toUpperCase();
}

export default function LaporanNeracaPage() {
  const [periodeList, setPeriodeList] = useState<Periode[]>([]);
  const [periode, setPeriode] = useState<number | "">("");
  const [cabang] = useState("00001/01");
  const [periodeOptions, setPeriodeOptions] = useState<SearchableOption[]>([]);
  const [filterSet, setFilterSet] = useState(false);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [sortKey, setSortKey] = useState<string>("kode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [periodeInfo, setPeriodeInfo] = useState<{
    keterangan: string;
    tglMulai: string | null;
    tglAkhir: string | null;
    prevKeterangan: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/laporan/neraca?mode=periode", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.rows) ? d.rows : [];
        setPeriodeList(list);
        if (list.length) setPeriode(list[0].Kode);
        setPeriodeOptions([
          { value: "", label: "-- Pilih Periode --" },
          ...list.map((p: any) => ({
            value: String(p.Kode),
            label: `${p.Keterangan} (${p.Kode})`,
          })),
        ]);
      })
      .catch(() => setError("Gagal memuat daftar periode"));
  }, []);

  useEffect(() => {
    if (!filterSet || !periode) return;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/laporan/neraca?periode=${periode}&cabang=${encodeURIComponent(cabang)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Gagal memuat neraca");
        return d;
      })
      .then((d) => {
        if (!alive) return;
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setTotals(d.totals || null);
        setPeriodeInfo(d.periodeInfo || null);
      })
      .catch((e) => {
        if (alive) setError(e?.message || "Gagal memuat neraca");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filterSet, periode, cabang]);

  const exportExcel = () => {
    if (!rows.length) return;
    const bulanIni = bulanDariKeterangan(periodeInfo?.keterangan || "");
    const bulanLalu = bulanDariKeterangan(periodeInfo?.prevKeterangan || "");

    const filterInfo = [
      ["NERACA"],
      [`Periode : ${periodeInfo?.keterangan || ""}`],
      [`Kode Periode: ${periode}`],
      [],
    ];

    const headerRow = ["Kode", "Keterangan", `Saldo ${bulanIni}`, `Saldo ${bulanLalu}`, "Perubahan"]
      .map((h) => `<th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">${h}</th>`)
      .join("");

    const dataRows = rows.map((r) => {
      if (r.tipe === "header") {
        return `<tr><td style="font-weight:bold;padding:4px;border:1px solid #ddd;">${r.kode}</td><td style="font-weight:bold;padding:4px;border:1px solid #ddd;" colspan="4">${r.nama}</td></tr>`;
      }
      if (r.tipe === "jumlah" || r.tipe === "grand") {
        return `<tr style="font-weight:bold;background:#E0F2F1;">
          <td style="padding:4px;border:1px solid #ddd;"></td>
          <td style="padding:4px;border:1px solid #ddd;">${r.nama}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.saldoAkhir ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.saldoAwal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.perubahan ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
      }
      return `<tr>
        <td style="padding:4px;border:1px solid #ddd;">${r.kode}</td>
        <td style="padding:4px;border:1px solid #ddd;">${r.nama}</td>
        <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.saldoAkhir ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.saldoAwal ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(r.perubahan ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`;
    }).join("");

    const footerRow = totals ? `<tr style="font-weight:bold;background:#E0F2F1;">
      <td style="padding:4px;border:1px solid #ddd;"></td>
      <td style="padding:4px;border:1px solid #ddd;">JMLAH KELOMPOK AKTIVA</td>
      <td style="text-align:right;padding:4px;border:1px solid #ddd;">${totals.aktivaAkhir.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:right;padding:4px;border:1px solid #ddd;">${totals.aktivaAwal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="text-align:right;padding:4px;border:1px solid #ddd;">${(totals.aktivaAkhir - totals.aktivaAwal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>` : "";

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Neraca</title></head>
      <body>
        <table>
          ${filterInfo.map((row) => `<tr><td colspan="5" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
          <tr>${headerRow}</tr>
          ${dataRows}
          ${footerRow}
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neraca-${periode}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tgl = (v: string | null) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "kode") { va = a.kode; vb = b.kode; }
      else if (sortKey === "nama") { va = a.nama; vb = b.nama; }
      else if (sortKey === "saldoAkhir") { va = a.saldoAkhir ?? 0; vb = b.saldoAkhir ?? 0; }
      else if (sortKey === "saldoAwal") { va = a.saldoAwal ?? 0; vb = b.saldoAwal ?? 0; }
      else if (sortKey === "perubahan") { va = a.perubahan ?? 0; vb = b.perubahan ?? 0; }
      else { va = a.kode; vb = b.kode; }
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va ?? "").toLowerCase();
      const sb = String(vb ?? "").toLowerCase();
      return sortDir === "asc" ? (sa < sb ? -1 : sa > sb ? 1 : 0) : (sa > sb ? -1 : sa < sb ? 1 : 0);
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ active, order }: { active: boolean; order: string }) =>
    active ? (
      <span className="text-[9px]">{order === "asc" ? "▲" : "▼"}</span>
    ) : (
      <span className="text-[9px] opacity-40">⇅</span>
    );

  const bulanIni = bulanDariKeterangan(periodeInfo?.keterangan || "");
  const bulanLalu = bulanDariKeterangan(periodeInfo?.prevKeterangan || "");
  const mobileSortOptions = [
    { value: "kode", label: "Kode" },
    { value: "nama", label: "Keterangan" },
    { value: "saldoAkhir", label: `Saldo ${bulanIni}` },
    { value: "saldoAwal", label: `Saldo ${bulanLalu}` },
    { value: "perubahan", label: "Perubahan" },
  ];

  const renderMobileRow = (r: DisplayRow, index: number) => {
    if (r.tipe === "header") {
      return (
        <div key={`${r.kode}-${index}`} style={{ marginLeft: Math.max(0, r.level - 1) * 8 }} className={`rounded-xl border px-3 py-2.5 ${r.section === "aktif" ? "border-teal-200 bg-teal-50" : "border-sky-200 bg-sky-50"}`}>
          <div className="text-[9px] font-semibold tracking-wide text-slate-500">KODE {r.kode}</div>
          <div className="mt-0.5 text-sm font-extrabold text-slate-800">{r.nama}</div>
        </div>
      );
    }

    const isTotal = r.tipe === "jumlah" || r.tipe === "grand";
    return (
      <article key={`${r.kode}-${index}`} className={`rounded-xl border p-3 ${r.tipe === "grand" ? "border-teal-300 bg-teal-50" : isTotal ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-start gap-2">
          {!isTotal && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{r.kode}</span>}
          <div className={`min-w-0 flex-1 text-xs leading-snug ${isTotal ? "font-bold text-slate-800" : "font-semibold text-slate-800"}`}>{r.nama}</div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-2">
          <div className="min-w-0">
            <div className="text-[9px] leading-tight text-slate-500">Saldo {bulanIni}</div>
            <div className="mt-0.5 break-words text-[10px] font-bold tabular-nums text-slate-800">{fmt(r.saldoAkhir)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] leading-tight text-slate-500">Saldo {bulanLalu || "Awal"}</div>
            <div className="mt-0.5 break-words text-[10px] font-semibold tabular-nums text-slate-700">{fmt(r.saldoAwal)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] leading-tight text-slate-500">Perubahan</div>
            <div className="mt-0.5 break-words text-[10px] font-semibold tabular-nums text-slate-700">{fmt(r.perubahan)}</div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Neraca</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Saldo per akun dari <code>Omega.PeriodAkuntansi</code> + <code>MasterPerkiraan</code>.
          </p>
        </div>
        {filterSet && rows.length > 0 && (
          <button onClick={exportExcel} className="btn-primary">
            Export Excel
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Periode <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={periodeOptions}
              value={periode ? String(periode) : null}
              onChange={(v) => setPeriode(v ? Number(v) : "")}
              placeholder="Cari periode..."
              allowClear={false}
              className="min-w-[260px]"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (periode) setFilterSet(true);
              }}
              disabled={!periode}
              className="btn-primary disabled:opacity-50"
            >
              Tampilkan
            </button>
            {filterSet && (
              <button
                onClick={() => {
                  setFilterSet(false);
                  setRows([]);
                  setTotals(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
              >
                Ganti Filter
              </button>
            )}
          </div>

          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {!filterSet ? (
        <div className="report-card report-card-pad">
          <div className="text-center py-10 text-slate-400">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm font-semibold text-slate-600">Pilih Periode terlebih dahulu</div>
            <div className="text-xs mt-1">Laporan neraca akan dimuat setelah tombol Tampilkan ditekan.</div>
          </div>
        </div>
      ) : loading ? (
        <div className="report-card report-card-pad">
          <Spinner label="Memuat neraca..." />
        </div>
      ) : rows.length ? (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Neraca</div>
            <div className="text-xs text-slate-600 mt-1">
              Periode : <b>{(periodeInfo?.keterangan || "").toUpperCase()}</b>
              {periodeInfo?.tglMulai && periodeInfo?.tglAkhir
                ? ` (${tgl(periodeInfo.tglMulai)} s/d ${tgl(periodeInfo.tglAkhir)})`
                : ""}
            </div>
          </div>

          <div className="report-card report-card-pad">
            <div className="space-y-2.5 md:hidden">
              <div className="flex items-center gap-2">
                <label htmlFor="neraca-mobile-sort" className="shrink-0 text-[10px] font-semibold text-slate-500">Urutkan</label>
                <select id="neraca-mobile-sort" value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs">
                  {mobileSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button onClick={() => setSortDir((dir) => dir === "asc" ? "desc" : "asc")} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600" aria-label={sortDir === "asc" ? "Urutan naik" : "Urutan turun"}>
                  {sortDir === "asc" ? "↑ Naik" : "↓ Turun"}
                </button>
              </div>
              {sortedRows.map(renderMobileRow)}
            </div>
            <ResponsiveReportTable className="hidden md:block">
              <table className="report-table bordered" style={{ minWidth: "760px" }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                  <tr>
                    <th className="w-[90px] cursor-pointer select-none" onClick={() => toggleSort("kode")} title="Klik untuk sorting">
                      <span className="inline-flex items-center gap-1">Kode <SortIcon active={sortKey === "kode"} order={sortDir} /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("nama")} title="Klik untuk sorting">
                      <span className="inline-flex items-center gap-1">Keterangan <SortIcon active={sortKey === "nama"} order={sortDir} /></span>
                    </th>
                    <th className="text-right w-[160px] cursor-pointer select-none" onClick={() => toggleSort("saldoAkhir")} title="Klik untuk sorting">
                      <span className="inline-flex items-center gap-1 justify-end w-full">Saldo {bulanIni} <SortIcon active={sortKey === "saldoAkhir"} order={sortDir} /></span>
                    </th>
                    <th className="text-right w-[160px] cursor-pointer select-none" onClick={() => toggleSort("saldoAwal")} title="Klik untuk sorting">
                      <span className="inline-flex items-center gap-1 justify-end w-full">Saldo {bulanLalu} <SortIcon active={sortKey === "saldoAwal"} order={sortDir} /></span>
                    </th>
                    <th className="text-right w-[150px] cursor-pointer select-none" onClick={() => toggleSort("perubahan")} title="Klik untuk sorting">
                      <span className="inline-flex items-center gap-1 justify-end w-full">Perubahan <SortIcon active={sortKey === "perubahan"} order={sortDir} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => {
                    if (r.tipe === "header") {
                      return (
                        <tr key={`${r.kode}-${i}`} className="bg-slate-50 font-bold">
                          <td className="font-bold">{r.kode}</td>
                          <td className="font-bold" style={{ paddingLeft: 8 + (r.level - 1) * 10 }}>
                            {r.nama}
                          </td>
                          <td></td>
                          <td></td>
                          <td></td>
                        </tr>
                      );
                    }
                    if (r.tipe === "jumlah") {
                      return (
                        <tr
                          key={`${r.kode}-${i}`}
                          className="font-bold border-t border-slate-300 bg-slate-50/70"
                        >
                          <td></td>
                          <td className="font-bold">{r.nama}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.saldoAkhir)}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.saldoAwal)}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.perubahan)}</td>
                        </tr>
                      );
                    }
                    if (r.tipe === "grand") {
                      return (
                        <tr
                          key={`${r.kode}-${i}`}
                          className="bg-teal-bg/60 font-bold border-t-2 border-b-4 border-double border-slate-500"
                        >
                          <td></td>
                          <td className="font-bold">{r.nama}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.saldoAkhir)}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.saldoAwal)}</td>
                          <td className="text-right tabular-nums whitespace-nowrap font-bold">{fmt(r.perubahan)}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`${r.kode}-${i}`} className="border-b border-slate-100">
                        <td className="text-slate-500">{r.kode}</td>
                        <td style={{ paddingLeft: 8 + (r.level - 1) * 10 }}>{r.nama}</td>
                        <td className="text-right tabular-nums whitespace-nowrap">{fmt(r.saldoAkhir)}</td>
                        <td className="text-right tabular-nums whitespace-nowrap">{fmt(r.saldoAwal)}</td>
                        <td className="text-right tabular-nums whitespace-nowrap">{fmt(r.perubahan)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveReportTable>
          </div>

          {totals && (
            <div className="report-card report-card-pad grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Jumlah Kelompok Aktiva</div>
                <div className="text-sm font-bold text-teal-dark">{fmt(totals.aktivaAkhir)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Jumlah Kelompok Pasiva</div>
                <div className="text-sm font-bold text-slate-800">{fmt(totals.pasivaAkhir)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Selisih Akhir</div>
                <div
                  className={
                    "text-sm font-bold " +
                    (Math.abs(totals.selisihAkhir) < 1 ? "text-teal-dark" : "text-amber-600")
                  }
                >
                  {fmt(totals.selisihAkhir)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Selisih Awal</div>
                <div
                  className={
                    "text-sm font-bold " +
                    (Math.abs(totals.selisihAwal) < 1 ? "text-teal-dark" : "text-amber-600")
                  }
                >
                  {fmt(totals.selisihAwal)}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="report-card report-card-pad text-center text-slate-400 py-8">
          Tidak ada data untuk periode ini.
        </div>
      )}
    </div>
  );
}
