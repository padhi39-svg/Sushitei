"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { rupiah } from "@/lib/format";
import { notifyDataSaved } from "@/lib/save-feedback";

type Gudang = { Kode: string; Keterangan: string };

export default function ImportPenjualanPage() {
  const [gudangList, setGudangList] = useState<Gudang[]>([]);
  const [tgl, setTgl] = useState(new Date().toISOString().slice(0, 10));
  const [gudang, setGudang] = useState("");
  const [pelangganNama, setPelangganNama] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/laporan/mutasi-persediaan?mode=gudang", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.rows)) { setGudangList(d.rows); if (d.rows.length) setGudang(d.rows[0].Kode); } })
      .catch(() => {});
  }, []);

  const kirim = async () => {
    if (!file) { setError("File Excel wajib dipilih"); return; }
    if (!gudang) { setError("Gudang wajib dipilih"); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tgl", tgl);
      fd.append("gudang", gudang);
      fd.append("pelangganNama", pelangganNama);
      fd.append("keterangan", keterangan);
      const res = await fetch("/api/penjualan/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal import");
      setResult(d);
      notifyDataSaved("Data penjualan berhasil diimport.");
    } catch (e: any) {
      setError(e?.message || "Gagal import");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const downloadTemplate = () => {
    const csv = "Kode Barang;Qty\r\n00001/184;10\r\n";
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-penjualan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-sm font-bold text-slate-800">Import Penjualan (Excel)</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Kolom: <b>Kode Barang</b> + <b>Qty</b>. Satuan terkecil &amp; harga otomatis dari Master Harga Jual. Hasil import langsung <b>POSTED</b>.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Download Template</button>
          <Link href="/penjualan" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Kembali</Link>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal</label>
            <input type="date" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full" value={tgl} onChange={(e) => setTgl(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gudang <span className="text-red-500">*</span></label>
            <select value={gudang} onChange={(e) => setGudang(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full">
              <option value="">-- Pilih Gudang --</option>
              {gudangList.map((g) => <option key={g.Kode} value={g.Kode}>{g.Kode} - {g.Keterangan}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pelanggan (Nama)</label>
            <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full" value={pelangganNama} onChange={(e) => setPelangganNama(e.target.value)} placeholder="opsional" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">File Excel (.xlsx/.xls/.csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keterangan</label>
            <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="opsional" />
          </div>
        </div>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
        <div className="mt-3">
          <button onClick={kirim} disabled={saving} className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {saving ? "Mengimport..." : "Import & Simpan (POSTED)"}
          </button>
        </div>
        {saving && <div className="mt-2"><Spinner label="Mengimport, cek harga ke Omega..." /></div>}
      </div>

      {result && (
        <div className="report-card report-card-pad">
          <div className="text-xs font-bold text-slate-800">
            Import selesai: <b>{result.imported}</b> dari <b>{result.totalRows}</b> baris → Kode Nota <b className="font-mono">{result.kodeNota}</b> (Code {result.code})
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            <Link href={`/penjualan/${result.id}`} className="text-teal-700 font-semibold hover:underline">Lihat transaksi</Link>
          </div>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold text-red-700 mb-1">Baris bermasalah ({result.errors.length}):</div>
              <ul className="text-[11px] text-slate-600 space-y-0.5 max-h-52 overflow-auto">
                {result.errors.map((e: any, i: number) => (
                  <li key={i}>Baris {e.baris}: {e.pesan}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
