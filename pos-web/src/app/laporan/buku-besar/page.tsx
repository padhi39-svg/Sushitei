"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { rupiah, tanggal } from "@/lib/format";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type Row = {
  urutan: number;
  tgl: string;
  ruleNo: string;
  module: string;
  kodeNota: string;
  keterangan: string;
  masuk: number;
  keluar: number;
  saldo: number;
};

export default function BukuBesarPage() {
  const [accounts, setAccounts] = useState<{ Nomor: string; Keterangan: string }[]>([]);
  const [account, setAccount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  // Dropdown akun custom (pengganti <datalist> bawaan browser yang posisinya tidak bisa dikontrol)
  const [openAkun, setOpenAkun] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const akunWrapRef = useRef<HTMLDivElement>(null);

  const filteredAkun = useMemo(() => {
    const needle = account.trim().toLowerCase();
    if (!needle) return accounts.slice(0, 80);
    return accounts
      .filter(
        (a) =>
          a.Nomor.toLowerCase().includes(needle) ||
          a.Keterangan.toLowerCase().includes(needle)
      )
      .slice(0, 80);
  }, [accounts, account]);

  useEffect(() => {
    setHighlight(0);
  }, [filteredAkun.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (akunWrapRef.current && !akunWrapRef.current.contains(e.target as Node)) {
        setOpenAkun(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Ambil akun + parameter awal dari URL (dibuka dari Neraca Percobaan)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const acc = p.get("account") || p.get("accountCode") || "";
    const f = p.get("from") || p.get("startDate") || "";
    const t = p.get("to") || p.get("endDate") || "";
    if (acc) setAccount(acc);
    if (f) setFrom(f);
    if (t) setTo(t);
    if (acc && f && t) {
      load(acc, f, t);
    }
    fetch("/api/laporan/buku-besar?mode=akun", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d?.rows) ? d.rows : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (acc = account, f = from, t = to) => {
    if (!acc || !f || !t) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/laporan/buku-besar?account=${encodeURIComponent(acc)}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
        { cache: "no-store" }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal memuat buku besar");
      setData(d);
      setRows(Array.isArray(d.rows) ? d.rows : []);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat buku besar");
      setData(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const lines: any[][] = [
      [`Buku Besar - ${data?.account?.nomor || account} ${data?.account?.nama || ""}`],
      [`Periode : ${from} s/d ${to}`],
      ["Tanggal", "Kode Nota", "Keterangan", "Masuk", "Keluar", "Saldo"],
    ];
    for (const r of rows) lines.push([r.tgl, r.kodeNota, r.keterangan, r.masuk, r.keluar, r.saldo]);
    const csv = lines
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buku-besar-${account || "akun"}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pilihAkun = (nomor: string) => {
    setAccount(nomor);
    setOpenAkun(false);
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Buku Besar</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Mutasi per akun perkiraan (dibuka dari Neraca Percobaan).
          </p>
        </div>
        {rows.length > 0 && (
          <button onClick={exportCsv} className="btn-primary">
            Export CSV
          </button>
        )}
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[280px] flex-1" ref={akunWrapRef}>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Perkiraan (Nomor)</label>
            <div className="relative">
              <input
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setOpenAkun(true);
                }}
                onFocus={() => setOpenAkun(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpenAkun(true);
                    setHighlight((h) => Math.min(h + 1, filteredAkun.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter" && openAkun && filteredAkun[highlight]) {
                    e.preventDefault();
                    pilihAkun(filteredAkun[highlight].Nomor);
                  } else if (e.key === "Escape") {
                    setOpenAkun(false);
                  }
                }}
                placeholder="00001/01/1110104"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono pr-9"
                aria-expanded={openAkun}
                aria-controls="daftar-akun"
                autoComplete="off"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setOpenAkun((v) => !v)}
                className="absolute inset-y-0 right-0 px-2.5 text-slate-500 hover:text-slate-700 text-xs"
                title="Pilih perkiraan"
              >
                ▼
              </button>
            </div>
            {openAkun && (
              <div
                id="daftar-akun"
                className="absolute z-30 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-xl max-h-72 overflow-y-auto"
                role="listbox"
              >
                {filteredAkun.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">Tidak ada akun yang cocok</div>
                ) : (
                  filteredAkun.map((a, i) => (
                    <button
                      key={a.Nomor}
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pilihAkun(a.Nomor)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 last:border-0 hover:bg-teal-bg/50 ${i === highlight ? "bg-teal-bg/60" : ""}`}
                    >
                      <span className="block font-mono text-[12px] font-semibold text-slate-800">{a.Nomor}</span>
                      <span className="block text-[11px] text-slate-500">{a.Keterangan}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={() => load()}
            disabled={!account || !from || !to || loading}
            className="btn-primary disabled:opacity-50"
          >
            Tampilkan
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {loading ? (
        <div className="report-card report-card-pad">
          <Spinner label="Memuat buku besar..." />
        </div>
      ) : data ? (
        <>
          <div className="report-card report-card-pad">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-800">
                  {data.account?.nomor} - {data.account?.nama}
                  {data.sumber && (
                    <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-bg text-teal-dark border border-teal-200">
                      {data.sumber === "cepat" ? "Jalur cepat" : "Jalur lengkap"}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  Sifat: {data.account?.sifat} • Periode {from} s/d {to} • {rows.length} baris transaksi
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-right">
                <div>
                  <div className="text-[10px] text-slate-500">Saldo Awal</div>
                  <div className="text-xs font-bold">{rupiah(data.saldoAwal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Total Masuk</div>
                  <div className="text-xs font-bold text-emerald-700">{rupiah(data.totalMasuk)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Total Keluar</div>
                  <div className="text-xs font-bold text-red-600">{rupiah(data.totalKeluar)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Saldo Akhir</div>
                  <div className="text-xs font-bold">{rupiah(rows[rows.length - 1]?.saldo ?? data.saldoAkhirPa)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="report-card report-card-pad">
            <ResponsiveReportTable style={{ maxHeight: "65vh", overflowY: "auto" }}>
              <table className="report-table bordered" style={{ minWidth: "760px" }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                  <tr>
                    <th>Tanggal</th>
                    <th>Kode Nota</th>
                    <th>Keterangan</th>
                    <th className="text-right">Masuk</th>
                    <th className="text-right">Keluar</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50 font-semibold">
                    <td>{from}</td>
                    <td>-</td>
                    <td>Saldo Awal</td>
                    <td className="text-right">{rupiah(data.saldoAwal)}</td>
                    <td className="text-right">-</td>
                    <td className="text-right font-bold">{rupiah(data.saldoAwal)}</td>
                  </tr>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-teal-bg/30">
                      <td className="whitespace-nowrap">{tanggal(r.tgl)}</td>
                      <td className="font-mono text-[10px] whitespace-nowrap">{r.kodeNota || "-"}</td>
                      <td>{r.keterangan || "-"}</td>
                      <td className="text-right tabular-nums whitespace-nowrap text-emerald-700">
                        {r.masuk > 0 ? rupiah(r.masuk) : ""}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap text-red-600">
                        {r.keluar > 0 ? rupiah(r.keluar) : ""}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap font-bold">{rupiah(r.saldo)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-400 py-6">
                        Tidak ada transaksi pada periode ini
                      </td>
                    </tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-teal-bg/50 font-bold">
                    <tr>
                      <td colSpan={3}>TOTAL</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{rupiah(data.totalMasuk)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{rupiah(data.totalKeluar)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {rupiah(rows[rows.length - 1].saldo)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </ResponsiveReportTable>
          </div>
        </>
      ) : (
        <div className="report-card report-card-pad text-center py-10 text-slate-400">
          <div className="text-3xl mb-2">📖</div>
          <div className="text-sm font-semibold text-slate-600">Pilih akun dan tanggal, lalu klik Tampilkan</div>
        </div>
      )}
    </div>
  );
}
