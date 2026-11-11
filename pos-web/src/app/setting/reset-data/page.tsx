"use client";
import { useState } from "react";
import Spinner from "@/components/Spinner";

export default function SettingResetDataPage() {
  const [confirmText, setConfirmText] = useState("");
  const [mode, setMode] = useState<"trx" | "trx+ingredient">("trx");
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const run = async () => {
    if (confirmText !== "HAPUS") {
      setMsg({ ok: false, text: "Ketik HAPUS untuk konfirmasi" });
      return;
    }
    if (!confirm(mode === "trx" ? "Hapus semua transaksi (WIP + Penjualan + Rekonsiliasi Pemakaian)?" : "Hapus semua transaksi + master ingredient? Kode resep berikutnya akan dimulai lagi dari ING/000001.")) return;
    setRunning(true);
    setMsg(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/settings/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirm: confirmText }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Gagal menghapus");
      // Backup download
      if (d?.backup) {
        const blob = new Blob([JSON.stringify(d.backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup-reset-${mode}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setLastResult(d);
      setMsg({ ok: true, text: "Data berhasil dihapus. Backup diunduh." });
      setConfirmText("");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Gagal menghapus" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full max-w-[900px] mx-auto space-y-3">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
        <h1 className="text-base md:text-lg font-bold text-slate-800">Reset Data (Hapus Transaksi)</h1>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Hapus data transaksi di Postgres. Master user, level, menu, dan pengaturan tidak dihapus. Hanya admin.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Mode hapus</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === "trx"} onChange={() => setMode("trx")} />
              Hapus semua transaksi (WIP + Penjualan + Rekonsiliasi Pemakaian)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === "trx+ingredient"} onChange={() => setMode("trx+ingredient")} />
              Hapus transaksi + master ingredient (resep dan reset kode ke ING/000001)
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Ketik HAPUS untuk konfirmasi</label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300"
            placeholder="HAPUS"
          />
        </div>

        {msg && (
          <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
        )}

        {lastResult && (
          <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
            <div>WIP: {lastResult.deleted?.wip} (items {lastResult.deleted?.wipItems})</div>
          <div>Penjualan: {lastResult.deleted?.penjualan} (items {lastResult.deleted?.penjualanItems})</div>
          <div>Rekonsiliasi Pemakaian: {lastResult.deleted?.kartuStok} (items {lastResult.deleted?.kartuStokItems})</div>
            {mode === "trx+ingredient" && (
              <div>Ingredient: {lastResult.deleted?.ingredient} (items {lastResult.deleted?.ingredientItems})</div>
            )}
          </div>
        )}

        <button
          onClick={run}
          disabled={running || confirmText !== "HAPUS"}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {running ? "Menghapus..." : "Hapus Sekarang"}
        </button>
      </div>
    </div>
  );
}
