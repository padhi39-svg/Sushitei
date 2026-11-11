"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import { notifyDataSaved } from "@/lib/save-feedback";

type Mode = "new" | "view";
type Row = {
  bahanKode: string;
  bahanNama: string;
  satuan: string;
  pemakaianLaporan: number;
  saldoAwal: number;
  masuk: number;
  sisa: number;
  hpp: number;
  keterangan: string;
};

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

function num(v: any) { const n = Number(v); return isNaN(n) ? 0 : n; }

export default function KartuStokForm({ mode, id, initial }: { mode: Mode; id?: number; initial?: any }) {
  const router = useRouter();
  const readonly = mode === "view";

  const [penjualanList, setPenjualanList] = useState<any[]>([]);
  const [penjualanId, setPenjualanId] = useState<number | null>(initial?.header?.penjualanId || null);
  const [penjualanInfo, setPenjualanInfo] = useState<any>(initial?.header ? { kodeNota: initial.header.kodeNotaPenjualan, tgl: initial.header.tgl, gudang: initial.header.gudang } : null);
  const [tgl, setTgl] = useState(initial?.header?.tgl ? new Date(initial.header.tgl).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [cabang, setCabang] = useState(initial?.header?.cabang || getCabangFromCookie() || "00001/01");
  const [gudang, setGudang] = useState(initial?.header?.gudang || "");
  const [keterangan, setKeterangan] = useState(initial?.header?.keterangan || "");
  const [items, setItems] = useState<Row[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingPenjualan, setLoadingPenjualan] = useState(mode === "new");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");

  // Load available penjualan (unreconciled, posted)
  useEffect(() => {
    if (mode !== "new") return;
    let alive = true;
    fetch(`/api/penjualan?status=POSTED&unreconciled=1&cabang=${encodeURIComponent(cabang)}&pageSize=200`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setPenjualanList(Array.isArray(d?.rows) ? d.rows : []);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingPenjualan(false); });
    return () => { alive = false; };
  }, [mode, cabang]);

  // Load initial items for view mode
  useEffect(() => {
    if (mode !== "view" || !initial?.items) return;
    setItems(initial.items.map((it: any) => ({
      bahanKode: it.bahanKode,
      bahanNama: it.bahanNama || it.bahanKode,
      satuan: it.satuan || "",
      pemakaianLaporan: Number(it.pemakaianLaporan || 0),
      saldoAwal: Number(it.saldoAwal || 0),
      masuk: Number(it.masuk || 0),
      sisa: Number(it.sisa || 0),
      hpp: Number(it.hpp || 0),
      keterangan: it.keterangan || "",
    })));
  }, [mode, initial]);

  const loadPreview = async (pid: number) => {
    setLoadingPreview(true);
    setError("");
    try {
      const res = await fetch(`/api/kartu-stok/preview?penjualanId=${pid}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal memuat preview");
      setPenjualanInfo(d.penjualan);
      setGudang(d.penjualan.gudang);
      setCabang(d.penjualan.cabang || cabang);
      setItems(d.items.map((it: any) => ({
        bahanKode: it.bahanKode,
        bahanNama: it.bahanNama,
        satuan: it.satuan,
        pemakaianLaporan: Number(it.pemakaianLaporan || 0),
        saldoAwal: Number(it.saldoAwal || 0),
        masuk: Number(it.masuk || 0),
        sisa: Number(it.sisa || 0),
        hpp: Number(it.hpp || 0),
        keterangan: "",
      })));
    } catch (e: any) {
      setError(e?.message || "Gagal memuat preview");
      setItems([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePenjualanChange = (pid: number) => {
    setPenjualanId(pid || null);
    setItems([]);
    setPenjualanInfo(null);
    if (pid) loadPreview(pid);
  };

  const updateItem = (idx: number, patch: Partial<Row>) => {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!penjualanId) { setError("Pilih penjualan terlebih dahulu"); return; }
    if (!items.length) { setError("Tidak ada bahan baku"); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/kartu-stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          penjualanId,
          tgl,
          cabang,
          gudang,
          keterangan,
          items: items.map((it, idx) => ({
            bahanKode: it.bahanKode,
            bahanNama: it.bahanNama,
            satuan: it.satuan,
            pemakaianLaporan: it.pemakaianLaporan,
            saldoAwal: it.saldoAwal,
            masuk: it.masuk,
            sisa: it.sisa,
            hpp: it.hpp,
            keterangan: it.keterangan,
            urutan: idx + 1,
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Gagal menyimpan");
      notifyDataSaved();
      router.push("/kartu-stok");
    } catch (e: any) {
      setError(e?.message || "Gagal menyimpan");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const voidTrx = async () => {
    if (!id) return;
    if (!confirm("Void/batal transaksi kartu stok ini?")) return;
    const res = await fetch(`/api/kartu-stok/${id}`, { method: "PATCH" });
    if (res.ok) router.push("/kartu-stok");
    else {
      const d = await res.json().catch(() => ({}));
      setError(d?.error || "Gagal void");
    }
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-sm font-bold text-slate-800">
            {mode === "new" ? "Rekonsiliasi Pemakaian Penjualan Baru" : "Detail Rekonsiliasi Pemakaian Penjualan"}
          </h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Rekonsiliasi pemakaian bahan baku per nota penjualan.</p>
        </div>
        <Link href="/kartu-stok" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">
          Kembali
        </Link>
      </div>

      {loadingPenjualan && mode === "new" ? (
        <div className="report-card report-card-pad"><Spinner label="Memuat data master..." /></div>
      ) : (
        <>
          <div className="report-card report-card-pad">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kode Nota</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full font-mono"
                  value={initial?.header?.kodeNota || (mode === "new" ? "Auto Generate" : "")} disabled />
              </div>
              {mode === "new" && (
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kode Nota Penjualan *</label>
                  <select
                    value={penjualanId || ""}
                    onChange={(e) => handlePenjualanChange(Number(e.target.value) || 0)}
                    disabled={readonly}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full"
                  >
                    <option value="">-- Pilih Penjualan --</option>
                    {penjualanList.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.kodeNota} — {new Date(p.tgl).toLocaleDateString("id-ID")} — {p.gudang}</option>
                    ))}
                  </select>
                </div>
              )}
              {mode === "view" && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kode Nota Penjualan</label>
                  <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full font-mono" value={penjualanInfo?.kodeNota || ""} disabled />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal</label>
                <input type="date" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full" value={tgl} onChange={(e) => setTgl(e.target.value)} disabled={readonly} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cabang</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full" value={cabang} disabled />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gudang</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full" value={gudang} disabled />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keterangan</label>
                <textarea className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full" rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} disabled={readonly} />
              </div>
            </div>
          </div>

          {loadingPreview && <div className="report-card report-card-pad"><Spinner label="Memuat preview..." /></div>}

          {items.length > 0 && (
            <div className="report-card report-card-pad">
              <h2 className="text-xs font-bold text-slate-700 mb-2">Detail Bahan Baku</h2>
              <div className="report-table-wrapper" style={{ overflowX: "auto" }}>
                  <table className="report-table bordered" style={{ minWidth: "700px" }}>
                  <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
                    <tr>
                      <th className="min-w-[180px]">Bahan Baku</th>
                      <th className="w-[70px]">Satuan</th>
                      <th className="w-[100px] text-right">Saldo Awal</th>
                      <th className="w-[90px] text-right">Masuk</th>
                      <th className="w-[90px] text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, idx) => {
                      return (
                        <tr key={idx} className="border-b border-slate-200">
                          <td className="text-[11px]">{r.bahanKode} — {r.bahanNama}</td>
                          <td className="text-[11px] text-center">{r.satuan}</td>
                          <td className="text-right">
                            <input type="number" step="0.01" disabled={readonly} className="w-full px-1 py-0.5 border border-slate-300 rounded text-xs text-right"
                              value={r.saldoAwal} onChange={(e) => updateItem(idx, { saldoAwal: Number(e.target.value) })} />
                          </td>
                          <td className="text-right">
                            <input type="number" step="0.01" disabled={readonly} className="w-full px-1 py-0.5 border border-slate-300 rounded text-xs text-right"
                              value={r.masuk} onChange={(e) => updateItem(idx, { masuk: Number(e.target.value) })} />
                          </td>
                          <td className="text-right">
                            <input type="number" step="0.01" disabled={readonly} className="w-full px-1 py-0.5 border border-slate-300 rounded text-xs text-right"
                              value={r.sisa} onChange={(e) => updateItem(idx, { sisa: Number(e.target.value) })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex gap-2">
                {!readonly && (
                  <button onClick={save} disabled={saving || !items.length} className="btn-primary disabled:opacity-50">
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                )}
                {!readonly && id && (
                  <button onClick={voidTrx} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-[10px] font-semibold hover:bg-red-50">Void</button>
                )}
                {error && <span className="text-xs text-red-600">{error}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
