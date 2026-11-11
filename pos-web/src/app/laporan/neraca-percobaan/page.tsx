"use client";
import { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import ResponsiveReportTable from "@/components/ResponsiveReportTable";

type Periode = { Kode: number; Keterangan: string; TglMulai?: string; TglAkhir?: string };

type TrialRow = {
  nomor: string;
  kode: string;
  nama: string;
  sifat: "Debit" | "Kredit";
  saldoAwal: number;
  debet: number;
  kredit: number;
  saldoAkhir: number;
  debitBal: number;
  kreditBal: number;
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  let v = Number(n) || 0;
  if (Math.abs(v) < 0.005) v = 0;
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

export default function LaporanNeracaPercobaanPage() {
  const [periodeList, setPeriodeList] = useState<Periode[]>([]);
  const [periode, setPeriode] = useState<number | "">("");
  const [cabang] = useState("00001/01");
  const [filterSet, setFilterSet] = useState(false);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [periodeInfo, setPeriodeInfo] = useState<{
    keterangan: string;
    tglMulai: string | null;
    tglAkhir: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("kode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetch("/api/laporan/neraca-percobaan?mode=periode", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.rows) ? d.rows : [];
        setPeriodeList(list);
        if (list.length) setPeriode(list[0].Kode);
      })
      .catch(() => setError("Gagal memuat daftar periode"));
  }, []);

  useEffect(() => {
    if (!filterSet || !periode) return;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/laporan/neraca-percobaan?periode=${periode}&cabang=${encodeURIComponent(cabang)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Gagal memuat data");
        return d;
      })
      .then((d) => {
        if (!alive) return;
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setPeriodeInfo(d.periodeInfo || null);
      })
      .catch((e) => {
        if (alive) setError(e?.message || "Gagal memuat data");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filterSet, periode, cabang]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        !needle ||
        r.kode.toLowerCase().includes(needle) ||
        r.nama.toLowerCase().includes(needle) ||
        r.nomor.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const sorted = useMemo(() => {
    const val = (r: TrialRow) => {
      if (sortKey === "perubahan") return r.saldoAkhir - r.saldoAwal;
      return (r as any)[sortKey];
    };
    const arr = [...filtered].sort((a, b) => {
      const va: any = val(a);
      const vb: any = val(b);
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(va ?? "").localeCompare(String(vb ?? ""), "id");
    });
    return sortDir === "asc" ? arr : arr.reverse();
  }, [filtered, sortKey, sortDir]);

  // Tanpa pagination: tampilkan semua
  const paged = sorted;

  // Total bersih seperti neraca: Aktiva (1) vs Kewajiban+Modal (2+3)
  const ringkasan = useMemo(() => {
    const aktif = rows.filter((r) => r.kode.startsWith("1"));
    const pasiva = rows.filter((r) => r.kode.startsWith("2") || r.kode.startsWith("3"));
    const sumAwal = (list: TrialRow[]) => list.reduce((s, r) => s + r.saldoAwal, 0);
    const sumAkhir = (list: TrialRow[]) => list.reduce((s, r) => s + r.saldoAkhir, 0);
    return {
      aktivaAwal: sumAwal(aktif),
      aktivaAkhir: sumAkhir(aktif),
      pasivaAwal: sumAwal(pasiva),
      pasivaAkhir: sumAkhir(pasiva),
      selisihAwal: sumAwal(aktif) - sumAwal(pasiva),
      selisihAkhir: sumAkhir(aktif) - sumAkhir(pasiva),
    };
  }, [rows]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const tgl = (v: string | null) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const bukaBukuBesar = (r: TrialRow) => {
    const from = String(periodeInfo?.tglMulai || "").slice(0, 10);
    const to = String(periodeInfo?.tglAkhir || "").slice(0, 10);
    const url = `/laporan/buku-besar?account=${encodeURIComponent(r.nomor)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, "_blank");
  };

  const exportCsv = () => {
    const bulanIni = bulanDariKeterangan(periodeInfo?.keterangan || "");
    const lines: any[][] = [
      [`Neraca Percobaan - Periode ${periodeInfo?.keterangan || periode}`],
      ["Kode", "Keterangan", `Saldo ${bulanIni}`, `Saldo ${bulanDariKeterangan("") || "Awal"}`, "Perubahan"],
    ];
    for (const r of sorted) {
      lines.push([r.kode, r.nama, r.saldoAkhir, r.saldoAwal, r.saldoAkhir - r.saldoAwal]);
    }
    lines.push(["", `TOTAL (${sorted.length} akun detail)`, ringkasan.aktivaAkhir + ringkasan.pasivaAkhir, ringkasan.aktivaAwal + ringkasan.pasivaAwal, ""]);
    const csv = lines
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neraca-percobaan-${periode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Th = ({ label, k, className = "" }: { label: string; k: string; className?: string }) => (
    <th
      className={`cursor-pointer select-none ${className}`}
      onClick={() => toggleSort(k)}
      title="Klik untuk sorting"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px]">{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </span>
    </th>
  );

  const bulanIni = bulanDariKeterangan(periodeInfo?.keterangan || "");

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Neraca Percobaan</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Hanya akun <b>detail (turunan paling bawah)</b> — akun yang benar-benar punya Buku Besar.
            Nilai sama seperti Laporan Neraca (Aktiva vs Kewajiban + Modal).
          </p>
        </div>
        {filterSet && rows.length > 0 && (
          <button onClick={exportCsv} className="btn-primary">
            Export CSV
          </button>
        )}
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Periode <span className="text-red-500">*</span>
            </label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value ? Number(e.target.value) : "")}
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
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cari Akun</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kode / keterangan..."
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-64"
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
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
              >
                Ganti Filter
              </button>
            )}
          </div>

          {filterSet && <span className="badge">{filtered.length} akun</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      {!filterSet ? (
        <div className="report-card report-card-pad">
          <div className="text-center py-10 text-slate-400">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm font-semibold text-slate-600">Pilih Periode terlebih dahulu</div>
            <div className="text-xs mt-1">Laporan neraca percobaan akan dimuat setelah tombol Tampilkan ditekan.</div>
          </div>
        </div>
      ) : loading ? (
        <div className="report-card report-card-pad">
          <Spinner label="Memuat neraca percobaan..." />
        </div>
      ) : rows.length ? (
        <>
          <div className="report-card report-card-pad text-center">
            <div className="text-base font-bold text-slate-800 uppercase tracking-widest">Neraca Percobaan</div>
            <div className="text-xs text-slate-600 mt-1">
              Periode : <b>{(periodeInfo?.keterangan || "").toUpperCase()}</b>
              {periodeInfo?.tglMulai && periodeInfo?.tglAkhir
                ? ` (${tgl(periodeInfo.tglMulai)} s/d ${tgl(periodeInfo.tglAkhir)})`
                : ""}
            </div>
          </div>

          <div className="report-card report-card-pad">
            <ResponsiveReportTable>
              <table className="report-table bordered" style={{ minWidth: "780px" }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
                  <tr>
                    <Th label="Kode" k="kode" />
                    <Th label="Keterangan" k="nama" />
                    <Th label={`Saldo ${bulanIni}`} k="saldoAkhir" className="text-right" />
                    <Th label="Saldo Awal" k="saldoAwal" className="text-right" />
                    <Th label="Perubahan" k="perubahan" className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    paged.map((r) => (
                      <tr key={r.kode} className="border-b border-slate-100 hover:bg-teal-bg/30">
                        <td className="font-mono text-[11px]">{r.kode}</td>
                        <td>{r.nama}</td>
                        <td
                          className="text-right tabular-nums whitespace-nowrap font-semibold cursor-pointer hover:bg-teal-bg"
                          title="Klik 2x untuk Buku Besar akun ini"
                          onDoubleClick={() => bukaBukuBesar(r)}
                        >
                          {fmt(r.saldoAkhir)}
                        </td>
                        <td className="text-right tabular-nums whitespace-nowrap">{fmt(r.saldoAwal)}</td>
                        <td className="text-right tabular-nums whitespace-nowrap">{fmt(r.saldoAkhir - r.saldoAwal)}</td>
                      </tr>
                    ))}
                  {!loading && !paged.length && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-6">
                        Tidak ada data
                      </td>
                    </tr>
                  )}
                </tbody>
                {!loading && rows.length > 0 && (
                  <tfoot className="bg-teal-bg/50 font-bold">
                    <tr>
                      <td colSpan={2}>TOTAL ({rows.length} akun detail)</td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {fmt(ringkasan.aktivaAkhir + ringkasan.pasivaAkhir)}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {fmt(ringkasan.aktivaAwal + ringkasan.pasivaAwal)}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {fmt(ringkasan.aktivaAkhir + ringkasan.pasivaAkhir - (ringkasan.aktivaAwal + ringkasan.pasivaAwal))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </ResponsiveReportTable>
          </div>

          <div className="report-card report-card-pad grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total Aktiva</div>
              <div className="text-sm font-bold text-teal-dark">{fmt(ringkasan.aktivaAkhir)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total Kewajiban + Modal</div>
              <div className="text-sm font-bold text-slate-800">{fmt(ringkasan.pasivaAkhir)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Selisih Akhir</div>
              <div
                className={
                  "text-sm font-bold " +
                  (Math.abs(ringkasan.selisihAkhir) < 1 ? "text-teal-dark" : "text-amber-600")
                }
              >
                {fmt(ringkasan.selisihAkhir)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Selisih Awal</div>
              <div
                className={
                  "text-sm font-bold " +
                  (Math.abs(ringkasan.selisihAwal) < 1 ? "text-teal-dark" : "text-amber-600")
                }
              >
                {fmt(ringkasan.selisihAwal)}
              </div>
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
