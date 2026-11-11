"use client";
import { useEffect, useState } from "react";

export default function SelectCabangPage() {
  const [cabangs, setCabangs] = useState<{ kode: string; nama: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const d = await res.json();
        const list = Array.isArray(d?.user?.cabangs) ? d.user.cabangs : [];
        if (list.length <= 1) {
          const onlyCabang = list[0] || "%";
          const selectRes = await fetch("/api/auth/select-cabang", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ cabang: onlyCabang }),
          });
          const selectData = await selectRes.json().catch(() => ({}));
          if (!selectRes.ok) throw new Error(selectData?.error || "Gagal memilih cabang");
          const sp = new URLSearchParams(window.location.search);
          let next = sp.get("next") || "/dashboard";
          if (!next.startsWith("/") || next.startsWith("/login")) next = "/dashboard";
          window.location.replace(next);
          return;
        }
        const branchRes = await fetch("/api/master/cabang", { cache: "no-store" });
        const branchData = await branchRes.json();
        if (!branchRes.ok) throw new Error(branchData?.error || "Gagal memuat nama cabang");
        const names = new Map<string, string>((branchData?.rows || []).map((branch: any) => [String(branch.kode), String(branch.nama || "")]));
        setCabangs(list.map((kode: string) => ({
          kode,
          nama: names.get(kode) || "Nama cabang tidak tersedia",
        })));
        setSelected(d?.user?.cabang || list[0]);
      } catch { setError("Gagal memuat data user"); }
      finally { setLoading(false); }
    })();
  }, []);

  const confirm = async () => {
    if (!selected) return setError("Pilih cabang terlebih dahulu");
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/auth/select-cabang", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabang: selected }), credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data?.error || "Gagal memilih cabang");
      const sp = new URLSearchParams(window.location.search);
      let next = sp.get("next") || "/dashboard";
      if (!next.startsWith("/") || next.startsWith("/login")) next = "/dashboard";
      window.location.href = next;
    } catch { setError("Gagal memilih cabang"); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Memuat...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-slate-800 mb-1">Pilih Cabang</h1>
        <p className="text-sm text-slate-500 mb-4">User ini memiliki lebih dari satu cabang. Pilih cabang yang akan digunakan untuk sesi ini.</p>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm mb-4">
          {cabangs.map((c) => <option key={c.kode} value={c.kode}>{c.nama}</option>)}
        </select>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button onClick={confirm} disabled={submitting || !selected} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60" style={{ backgroundColor: "#14532D" }}>
          {submitting ? "Memproses..." : "Masuk"}
        </button>
      </div>
    </div>
  );
}
