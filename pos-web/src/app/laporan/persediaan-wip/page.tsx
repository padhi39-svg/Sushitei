"use client";
import { useEffect, useState } from "react";
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
  wipCode: number;
  tgl: string;
  gudang: string;
  keterangan: string | null;
  brgKode: string;
  brgNama: string;
  qtyWip: number;
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

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function LaporanPersediaanWipPage() {
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
        const res = await fetch(`/api/laporan/persediaan-wip?${params.toString()}`, { cache: "no-store" });
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
      ["LAPORAN PERSEDIAAN WIP"],
      [`Versi: ${mode === "rekap" ? "REKAP (Ringkasan Bahan Baku)" : "DETAIL (per WIP Item)"}`],
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
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Persediaan WIP - Rekap</title></head>
        <body>
          <table>
            ${filterInfo.map((row) => `<tr><td colspan="6" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
            <tr>${headerRow}</tr>
            ${dataRows}
            ${footerRow}
          </table>
        </body>
        </html>
      `;
    } else {
      // Detail mode
      let detailHtml = "";
      for (const r of detailRows) {
        detailHtml += `<tr style="background:#E0F2F1;font-weight:bold;">
          <td style="padding:4px;border:1px solid #ddd;">${r.wipCode}</td>
          <td style="padding:4px;border:1px solid #ddd;">${tgl(r.tgl)}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.brgKode}</td>
          <td style="padding:4px;border:1px solid #ddd;">${r.brgNama}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.qtyWip}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.hppPerPcs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;padding:4px;border:1px solid #ddd;">${r.totalHpp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
        for (const b of r.bahan) {
          detailHtml += `<tr>
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
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Persediaan WIP - Detail</title></head>
        <body>
          <table>
            ${filterInfo.map((row) => `<tr><td colspan="7" style="font-weight:bold;font-size:14px;">${row.join(" ")}</td></tr>`).join("")}
            <tr>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">No. Transaksi</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Tanggal</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Kode Barang</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Nama Barang</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Qty</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">HPP/Satuan</th>
              <th style="background:#2BA8A2;color:white;font-weight:bold;padding:6px;border:1px solid #ddd;">Total HPP</th>
            </tr>
            ${detailHtml}
          </table>
        </body>
        </html>
      `;
    }

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `persediaan-wip-${mode}-${tglAwal}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm md:text-base font-bold text-slate-800">Laporan Persediaan WIP</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Laporan Persediaan Work In Progress (Setengah Jadi)</p>
        </div>
        {filterSet && ((mode === "rekap" && rekapRows.length > 0) || (mode === "detail" && detailRows.length > 0)) && (
          <button onClick={exportExcel} className="btn-primary disabled:opacity-50">
            Export Excel
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Versi Laporan</label>
            <select
              value={mode}
              onChange={(e) => { setMode(e.target.value as "rekap" | "detail"); setFilterSet(false); setRekapRows([]); setDetailRows([]); }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[180px]"
            >
              <option value="rekap">Rekap (Ringkasan Bahan Baku)</option>
              <option value="detail">Detail (per WIP Item)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dari Tanggal</label>
            <input
              type="date"
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
              value={tglAwal}
              onChange={(e) => setTglAwal(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
              value={tglAkhir}
              onChange={(e) => setTglAkhir(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gudang</label>
            <select
              value={gudang}
              onChange={(e) => setGudang(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white min-w-[180px]"
            >
              <option value="all">Semua Gudang</option>
              {gudangList.map((g) => (
                <option key={g.Kode} value={g.Kode}>{g.Kode} - {g.Keterangan}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={runReport}
              disabled={!tglAwal || !tglAkhir}
              className="btn-primary disabled:opacity-50"
            >
              Tampilkan
            </button>
            {filterSet && (
              <button
                onClick={resetFilter}
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
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm font-semibold text-slate-600">Pilih filter terlebih dahulu</div>
            <div className="text-xs mt-1">Laporan akan dimuat setelah tombol Tampilkan ditekan.</div>
          </div>
        </div>
      ) : loading ? (
        <div className="report-card report-card-pad">
          <Spinner label="Memuat laporan..." />
        </div>
      ) : mode === "rekap" ? (
        rekapRows.length ? (
          <>
            <div className="report-card report-card-pad text-center">
              <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Laporan Persediaan WIP - Rekap</div>
              <div className="text-xs text-slate-600 mt-1">
                Periode : {tgl(tglAwal)} s/d {tgl(tglAkhir)} | Gudang: {gudang === "all" ? "Semua" : gudang}
              </div>
            </div>

            <div className="report-card report-card-pad">
              <ResponsiveReportTable style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <table className="report-table bordered" style={{ minWidth: "800px" }}>
                  <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                    <tr>
                      <th className="w-[40px] text-center">No</th>
                      <th>Kode Bahan Baku</th>
                      <th>Nama Bahan Baku</th>
                      <th className="text-center w-[80px]">Satuan</th>
                      <th className="text-right w-[120px]">Total Qty</th>
                      <th className="text-right w-[140px]">HPP/Satuan</th>
                      <th className="text-right w-[140px]">Total Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rekapRows.map((r, i) => (
                      <tr key={r.bahanKode} className="border-b border-slate-200 hover:bg-teal-bg/30">
                        <td className="text-center text-slate-400 text-[10px]">{i + 1}</td>
                        <td className="font-mono text-[11px]">{r.bahanKode}</td>
                        <td className="text-[11px] text-slate-600">{r.bahanNama}</td>
                        <td className="text-center text-[11px]">{r.satuan}</td>
                        <td className="text-right tabular-nums text-[11px]">{r.totalQty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="text-right tabular-nums text-[11px]">{fmt(r.hpp)}</td>
                        <td className="text-right tabular-nums text-[11px] font-semibold">{fmt(r.totalNilai)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-teal-bg/40 font-bold">
                    <tr>
                      <td colSpan={6} className="text-right text-[11px]">TOTAL</td>
                      <td className="text-right tabular-nums text-[11px]">{fmt(rekapTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
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
        ) : (
          <div className="report-card report-card-pad text-center text-slate-400 py-8">
            Tidak ada data untuk periode ini.
          </div>
        )
      ) : detailRows.length ? (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Laporan Persediaan WIP - Detail</div>
            <div className="text-xs text-slate-600 mt-1">
              Periode : {tgl(tglAwal)} s/d {tgl(tglAkhir)} | Gudang: {gudang === "all" ? "Semua" : gudang}
            </div>
          </div>

          <div className="report-card report-card-pad">
            <ResponsiveReportTable style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table className="report-table bordered" style={{ minWidth: "900px" }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                  <tr>
                    <th className="w-[40px] text-center">No</th>
                    <th className="w-[80px]">No. Transaksi</th>
                    <th className="w-[90px]">Tanggal</th>
                    <th>Kode Barang WIP</th>
                    <th>Nama Barang WIP</th>
                    <th className="text-right w-[80px]">Qty WIP</th>
                    <th className="text-right w-[120px]">HPP/pcs</th>
                    <th className="text-right w-[120px]">Total HPP</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r, i) => (
                    <>
                      <tr key={`wip-${i}`} className="border-b border-slate-200 bg-teal-bg/20">
                        <td className="text-center text-slate-400 text-[10px]">{i + 1}</td>
                        <td className="font-mono text-[11px]">{r.wipCode}</td>
                        <td className="whitespace-nowrap text-[11px]">{tgl(r.tgl)}</td>
                        <td className="font-mono text-[11px]">{r.brgKode}</td>
                        <td className="text-[11px] font-semibold text-slate-700">{r.brgNama}</td>
                        <td className="text-right tabular-nums text-[11px]">{r.qtyWip.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                        <td className="text-right tabular-nums text-[11px]">{fmt(r.hppPerPcs)}</td>
                        <td className="text-right tabular-nums text-[11px] font-bold">{fmt(r.totalHpp)}</td>
                      </tr>
                      {r.bahan.map((b, j) => (
                        <tr key={`bahan-${i}-${j}`} className="border-b border-slate-100 hover:bg-slate-50">
                          <td></td>
                          <td></td>
                          <td></td>
                          <td className="font-mono text-[10px] text-slate-500">{b.bahanKode}</td>
                          <td className="text-[10px] text-slate-500 pl-4">{b.bahanNama}</td>
                          <td className="text-right tabular-nums text-[10px] text-slate-500">{b.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} {b.satuan}</td>
                          <td className="text-right tabular-nums text-[10px] text-slate-500">{fmt(b.hpp)}</td>
                          <td className="text-right tabular-nums text-[10px] text-slate-500">{fmt(b.subTotal)}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot className="bg-teal-bg/40 font-bold">
                  <tr>
                    <td colSpan={7} className="text-right text-[11px]">TOTAL HPP</td>
                    <td className="text-right tabular-nums text-[11px]">{fmt(detailTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </ResponsiveReportTable>
          </div>

          <div className="report-card report-card-pad grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Jumlah Transaksi WIP</div>
              <div className="text-sm font-bold text-slate-800">{detailRows.length}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total HPP</div>
              <div className="text-sm font-bold text-teal-dark">{fmt(detailTotal)}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="report-card report-card-pad text-center text-slate-400 py-8">
          Tidak ada data untuk periode ini.
        </div>
      )}
    </div>
  );
}
