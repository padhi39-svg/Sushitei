"use client";
import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { notifyDataSaved } from "@/lib/save-feedback";

export default function SettingDatabasePage() {
  const [current, setCurrent] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/database", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal memuat");
      setCurrent(d.current);
      setDatabases(Array.isArray(d.databases) ? d.databases : []);
      setSelected(d.current);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Gagal memuat" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apply = async () => {
    if (!selected || selected === current) {
      setMsg({ ok: false, text: "Pilih database yang berbeda" });
      return;
    }
    if (!confirm(`Ganti database SQL Server ke "${selected}"? Master data akan dibaca dari database ini.`)) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: selected }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Gagal menerapkan");
      setCurrent(d.database);
      setSelected(d.database);
      setMsg({ ok: true, text: `Database diganti ke ${d.database}. Memuat ulang...` });
      notifyDataSaved("Database berhasil diterapkan.");
      setTimeout(() => window.location.reload(), 3000);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Gagal menerapkan" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="w-full max-w-[1520px] mx-auto"><Spinner /></div>;
  }

  return (
    <div className="w-full max-w-[900px] mx-auto space-y-3">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
        <h1 className="text-base md:text-lg font-bold text-slate-800">Pengaturan Database SQL Server</h1>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Pilih database SQL Server (Omega) yang dibaca untuk master data. Hanya admin.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Database saat ini</label>
          <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-mono">{current}</div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Pilih database baru</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 bg-white"
          >
            {databases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Hanya database yang memiliki schema Omega (Barang, Gudang, Satuan, BrgPrice, MstPeriode) yang dapat diterapkan.
          </p>
        </div>

        {msg && (
          <p className={"text-sm font-semibold " + (msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
        )}

        <button
          onClick={apply}
          disabled={saving || !selected || selected === current}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-teal-primary hover:bg-teal-dark disabled:opacity-50"
        >
          {saving ? <><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin mr-2 align-middle" />Menerapkan...</> : "Terapkan & Reload"}
        </button>
      </div>
    </div>
  );
}
