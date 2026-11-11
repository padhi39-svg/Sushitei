"use client";
import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import DataCardList from "@/components/DataCardList";
import { notifyDataSaved } from "@/lib/save-feedback";

export default function LevelManagerPage() {
  const [items, setItems] = useState<any[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", name: "" });
  const [check, setCheck] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Matriks menu cukup diambil sekali
  useEffect(() => {
    fetch("/api/level-manager/menus")
      .then((r) => r.json())
      .then((m) => setMenus(m.menus || []))
      .catch(() => setMenus([]));
  }, []);

  // Daftar level (per halaman)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/level-manager?page=${page}&pageSize=${pageSize}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setItems(Array.isArray(d?.rows) ? d.rows : []);
        setTotal(Number(d?.total || 0));
      })
      .catch(() => { if (alive) { setItems([]); setTotal(0); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, pageSize, reload]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg("");
    const permissions = Object.entries(check).filter(([, v]) => v).map(([k, v]) => {
      const [menu_code, permission_code] = k.split("|");
      return { menu_code, permission_code, allowed: v };
    });
    try {
      const res = await fetch("/api/level-manager", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, permissions }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(`Gagal: ${d.error || "menyimpan level"}`); return; }
      setForm({ code: "", name: "" });
      setCheck({});
      setPage(1);
      setReload((v) => v + 1);
      notifyDataSaved();
    } catch (error: any) {
      setMsg(`Gagal: ${error?.message || "menyimpan level"}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("Hapus level ini? (soft delete)")) return;
    await fetch(`/api/level-manager/${id}`, { method: "DELETE" });
    setReload((v) => v + 1);
  };

  const toggle = (menu: string, perm: string) => {
    const k = `${menu}|${perm}`;
    setCheck((p) => ({ ...p, [k]: !p[k] }));
  };

  const toggleAll = (menu: string, perms: string[], on: boolean) => {
    setCheck((p) => {
      const next = { ...p };
      perms.forEach((perm) => { next[`${menu}|${perm}`] = on; });
      return next;
    });
  };

  const grouped = menus.reduce<Record<string, any[]>>((acc, m) => {
    (acc[m.group] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div>
        <h1 className="text-base md:text-lg font-bold text-slate-800">Master Level Manager</h1>
        <p className="text-[11px] text-slate-600 mt-0.5">Referensi D:\pos - Kode, Nama, matriks izin per menu. ID urut 1,2,3...</p>
      </div>

      <div className="report-card report-card-pad">
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <input placeholder="Kode (mis: KASIR)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <input placeholder="Nama (mis: Kasir)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            {saving ? "Menyimpan..." : "Tambah Level"}
          </button>
        </form>
        {msg && <p className="text-xs mt-2 text-teal-dark">{msg}</p>}
      </div>

      <div className="report-card report-card-pad">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Izin untuk level baru (centang yang boleh)</h3>
        {Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="mb-3">
            <div className="text-xs font-bold text-teal-dark uppercase tracking-wide mb-1">{group}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {list.map((m: any) => (
                <div key={m.code} className="border border-slate-200 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-slate-700">{m.name} <span className="text-slate-400 font-normal">({m.path})</span></span>
                    <span className="flex gap-2 text-[11px]">
                      <button type="button" onClick={() => toggleAll(m.code, m.permissions || ["VIEW"], true)} className="text-teal-primary font-semibold">Semua</button>
                      <button type="button" onClick={() => toggleAll(m.code, m.permissions || ["VIEW"], false)} className="text-slate-400 font-semibold">Reset</button>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {(m.permissions || ["VIEW"]).map((p: string) => {
                      const k = `${m.code}|${p}`;
                      return (
                        <label key={p} className="text-xs inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={!!check[k]} onChange={() => toggle(m.code, p)} className="accent-[#2BA8A2]" /> {p}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="report-card report-card-pad">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-bold text-slate-700">Daftar Level</h3>
          <span className="badge">{total} level</span>
        </div>
        {/* Desktop: tabel */}
        <div className="report-table-wrapper hidden md:block">
          <table className="report-table">
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
              <tr><th>ID</th><th>Kode</th><th>Nama</th><th>Jumlah Izin</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><Spinner /></td></tr>}
              {!loading && items.map((l: any) => (
                <tr key={l.id} className="border-b border-slate-100"><td>{l.id}</td><td>{l.code}</td><td>{l.name}</td><td>{l.permissionsCount}</td>
                <td><button onClick={() => del(l.id)} className="text-red-600 text-xs font-semibold">Hapus</button></td></tr>
              ))}
              {!loading && !items.length && <tr><td colSpan={5} className="text-center text-slate-400 py-6">Tidak ada data</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile: kartu */}
        <DataCardList
          loading={loading}
          emptyText="Tidak ada data"
          emptyIcon="🔐"
          items={items.map((l: any) => ({
            key: l.id,
            title: l.name || "-",
            subtitle: l.code,
            fields: [
              { label: "ID", value: l.id },
              { label: "Jumlah Izin", value: l.permissionsCount },
            ],
            actions: (
              <button onClick={() => del(l.id)} className="px-3 py-1 rounded-full border border-red-300 text-red-600 text-[11px] font-semibold hover:bg-red-50">
                Hapus
              </button>
            ),
          }))}
        />

        <Pagination
          page={page} pageSize={pageSize} total={total}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
          pageSizes={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
}
