"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import { notifyDataSaved } from "@/lib/save-feedback";

export default function ImportIngredientPage() {
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [result, setResult] = useState<any>(null);
  const [failure, setFailure] = useState<{ message: string; errors: any[] } | null>(null);
  const [error, setError] = useState("");

  const kirim = async () => {
    if (!file) { setError("File Excel wajib dipilih"); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setResult(null);
    setFailure(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("updateExisting", updateExisting ? "1" : "0");
      const res = await fetch("/api/ingredient/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        setFailure({
          message: d?.error || "Gagal import",
          errors: Array.isArray(d?.errors) ? d.errors : [],
        });
        return;
      }
      setResult(d);
      notifyDataSaved("Master ingredient berhasil diimport.");
    } catch (e: any) {
      setError(e?.message || "Gagal import");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      "Kode Barang;Nama Barang;Porsi;Aktif;Deskripsi;Kode Bahan;Qty;Satuan;Catatan",
      "00001/184;Beef Rice Bowl Sweet Soy Sc;1;Ya;Contoh resep;00001/BB001;0.2;kg;Bahan utama",
      "00001/184;Beef Rice Bowl Sweet Soy Sc;1;Ya;Contoh resep;00001/BB002;0.1;KG;Bahan kedua",
    ].join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-ingredient.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Import Master Ingredient (Excel)</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Satu baris = satu bahan. Baris dengan <b>Kode Barang</b> sama akan digabung menjadi satu resep.
            Kode barang, kode bahan, dan satuan divalidasi langsung ke database master yang aktif.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadTemplate} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Download Template</button>
          <Link href="/barang/ingredient" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Kembali</Link>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">File Excel (.xlsx/.xls/.csv) <span className="text-red-500">*</span></label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setFailure(null); setError(""); }}
              disabled={saving}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                disabled={saving}
                className="mt-0.5 h-4 w-4 accent-[#2BA8A2]"
              />
              <span>
                <span className="font-semibold">Perbarui resep yang sudah ada</span>
                <span className="block text-[10px] text-slate-500 mt-0.5">Jika tidak dicentang, resep yang sudah ada akan dilewati dan dilaporkan sebagai error.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1">
          <div className="font-bold text-slate-700">Kolom yang dibaca:</div>
          <div><b>Kode Barang</b> (wajib), <b>Nama Barang</b> (opsional), <b>Porsi</b> (opsional, default 1), <b>Aktif</b> (Ya/Tidak), <b>Deskripsi</b> (opsional).</div>
          <div><b>Kode Bahan</b> (wajib), <b>Qty</b> (wajib, &gt; 0), <b>Satuan</b> (wajib, harus terdaftar di database master yang aktif), <b>Catatan</b> (opsional).</div>
          <div className="text-slate-500">Nama kolom tidak membedakan huruf besar/kecil. Contoh: Kode Barang, Kode Bahan, Qty, Satuan.</div>
        </div>

        {error && <div className="text-xs text-red-600 mt-2 whitespace-pre-wrap">{error}</div>}
        <div className="mt-3">
          <button onClick={kirim} disabled={saving || !file} className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {saving ? "Mengimport..." : "Import & Simpan"}
          </button>
        </div>
        {saving && <div className="mt-2"><Spinner label="Memvalidasi resep ke Omega..." /></div>}
      </div>

      {failure && (
        <div className="report-card report-card-pad border border-red-200 bg-red-50">
          <div className="text-xs font-bold text-red-700">{failure.message}</div>
          {failure.errors.length > 0 && (
            <ul className="mt-2 text-[11px] text-red-700 space-y-0.5 max-h-60 overflow-auto">
              {failure.errors.map((e: any, i: number) => (
                <li key={i}>{e.baris ? `Baris ${e.baris}: ` : ""}{e.pesan}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div className="report-card report-card-pad">
          <div className="text-xs font-bold text-slate-800">
            Import selesai: <b>{result.recipes}</b> resep ({result.created} baru, {result.updated} diperbarui), <b>{result.items}</b> bahan.
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            <Link href="/barang/ingredient" className="text-teal-700 font-semibold hover:underline">Lihat Master Ingredient</Link>
            <span className="mx-2">•</span>
            <Link href="/laporan/daftar-ingredient" className="text-teal-700 font-semibold hover:underline">Buka Laporan Daftar Ingredient</Link>
          </div>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold text-red-700 mb-1">Bagian yang dilewati / bermasalah ({result.errors.length}):</div>
              <ul className="text-[11px] text-slate-600 space-y-0.5 max-h-52 overflow-auto">
                {result.errors.map((e: any, i: number) => (
                  <li key={i}>{e.baris ? `Baris ${e.baris}: ` : ""}{e.pesan}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
