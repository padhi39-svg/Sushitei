"use client";
import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import DataCardList from "@/components/DataCardList";
import { notifyDataSaved } from "@/lib/save-feedback";

export default function UsersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [cabangs, setCabangs] = useState<{ kode: string; nama: string }[]>([]);
  const [cabangOpen, setCabangOpen] = useState(false);
  const [cabangLoading, setCabangLoading] = useState(true);
  const [cabangError, setCabangError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", level_id: "", password: "", cabang: [] as string[] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/level-manager?all=1").then((r) => r.json())
      .then((d) => setLevels(Array.isArray(d?.rows) ? d.rows : []))
      .catch(() => setLevels([]));
  }, []);

  useEffect(() => {
    fetch("/api/master/cabang", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Gagal memuat cabang");
        setCabangs(Array.isArray(d?.rows) ? d.rows : []);
      })
      .catch((e) => setCabangError(e?.message || "Gagal memuat cabang"))
      .finally(() => setCabangLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
        const d = await res.json();
        setItems(Array.isArray(d?.rows) ? d.rows : []);
        setTotal(Number(d?.total || 0));
      } catch { setItems([]); setTotal(0); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, page, pageSize, reload]);

  const clearForm = () => {
    setForm({ name: "", email: "", level_id: "", password: "", cabang: [] });
    setEditingId(null);
    setCabangOpen(false);
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg("");
    const isEditing = editingId !== null;
    try {
      const res = await fetch(isEditing ? `/api/users/${editingId}` : "/api/users", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, level_id: Number(form.level_id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Gagal: ${d.error || "menyimpan user"}`);
        return;
      }
      clearForm();
      setPage(1);
      setReload((v) => v + 1);
      notifyDataSaved();
    } catch (error: any) {
      setMsg(`Gagal: ${error?.message || "menyimpan user"}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleCabang = (kode: string) => {
    setForm((prev) => ({
      ...prev,
      cabang: prev.cabang.includes(kode) ? prev.cabang.filter((item) => item !== kode) : [...prev.cabang, kode],
    }));
  };

  const del = async (id: number) => {
    if (!confirm("Hapus user ini? (soft delete)")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(`Gagal menghapus: ${d?.error || "terjadi kesalahan"}`); return; }
    setMsg("User berhasil dihapus.");
    setReload((v) => v + 1);
  };

  const edit = (user: any) => {
    setEditingId(user.id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      level_id: String(user.levelId || ""),
      password: "",
      cabang: user.cabang ? String(user.cabang).split(",").map((value: string) => value.trim()).filter(Boolean) : [],
    });
    setMsg("");
    setCabangOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const displayCabang = (value: unknown) => {
    const codes = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
    if (!codes.length) return "Semua cabang";
    const nameByCode = new Map(cabangs.map((cabang) => [cabang.kode, cabang.nama]));
    return codes.map((code) => nameByCode.get(code) || "Cabang tidak ditemukan").join(", ");
  };

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Master User</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">Referensi D:\pos - Kode USR urut, Nama, Level</p>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <form onSubmit={saveUser} className="grid grid-cols-1 md:grid-cols-6 gap-2">
          {editingId !== null && <div className="md:col-span-6 text-sm font-bold text-blue-700">Edit User</div>}
          <input placeholder="Nama *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <select value={form.level_id} onChange={(e) => setForm({ ...form, level_id: e.target.value })} required className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="">Pilih Level...</option>
            {levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input placeholder={editingId !== null ? "Password baru (opsional)" : "Password *"} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={editingId === null} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <div className="relative">
            <button type="button" onClick={() => setCabangOpen((open) => !open)} className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-left flex items-center justify-between gap-2">
              <span className="truncate">{form.cabang.length ? form.cabang.map((kode) => cabangs.find((cabang) => cabang.kode === kode)?.nama || "Cabang tidak ditemukan").join(", ") : "Semua cabang"}</span>
              <span className="text-slate-500">▾</span>
            </button>
            {cabangOpen && (
              <>
                <button type="button" aria-label="Tutup pilihan cabang" className="fixed inset-0 z-20 cursor-default" onClick={() => setCabangOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-full min-w-[240px] max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-30">
                  <label className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
                    <input type="checkbox" checked={form.cabang.length === 0} onChange={() => setForm((prev) => ({ ...prev, cabang: [] }))} />
                    Semua cabang
                  </label>
                  <div className="my-1 border-t border-slate-100" />
                  {cabangLoading && <div className="px-2 py-2 text-xs text-slate-500">Memuat daftar cabang...</div>}
                  {!cabangLoading && cabangs.map((cabang) => (
                    <label key={cabang.kode} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
                      <input type="checkbox" checked={form.cabang.includes(cabang.kode)} onChange={() => toggleCabang(cabang.kode)} />
                      <span>{cabang.nama}</span>
                    </label>
                  ))}
                  {!cabangLoading && !cabangs.length && <div className="px-2 py-2 text-xs text-slate-500">Tidak ada cabang dari master Gudang.</div>}
                </div>
              </>
            )}
            {cabangError && <p className="mt-1 text-[10px] text-red-600">{cabangError}</p>}
          </div>
          <button type="submit" disabled={saving} className="btn-primary justify-center disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? (
              <><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Menyimpan...</>
            ) : editingId !== null ? "Simpan Perubahan" : "Tambah"}
          </button>
          {editingId !== null && <button type="button" onClick={clearForm} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">Batal</button>}
        </form>
        {msg && <p className="text-xs mt-2 text-teal-dark">{msg}</p>}
      </div>

      <div className="report-card report-card-pad">
        <div className="flex items-center gap-2 mb-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari kode / nama / email..." className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-72" />
          <span className="badge">{total} user</span>
        </div>
        {/* Desktop: tabel */}
        <div className="report-table-wrapper hidden md:block">
          <table className="report-table">
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
               <tr><th>ID</th><th>Kode</th><th>Nama</th><th>Level</th><th>Email</th><th>Cabang</th><th>Aktif</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><Spinner /></td></tr>}
              {!loading && items.map((u: any) => (
                <tr key={u.id} className="border-b border-slate-100"><td>{u.id}</td><td>{u.code}</td><td>{u.name}</td><td>{u.levelName || "-"}</td><td>{u.email}</td><td>{displayCabang(u.cabang)}</td><td>{u.aktif ? "Ya" : "Tidak"}</td>
                <td>
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => edit(u)} className="text-blue-600 hover:text-blue-800" title="Edit" aria-label={`Edit ${u.name}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => del(u.id)} className="text-red-600 hover:text-red-800" title="Hapus" aria-label={`Hapus ${u.name}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-9 0h12" />
                      </svg>
                    </button>
                  </div>
                </td></tr>
              ))}
              {!loading && !items.length && <tr><td colSpan={8} className="text-center text-slate-400 py-6">Tidak ada data</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile: kartu */}
        <DataCardList
          loading={loading}
          emptyText="Tidak ada data"
          emptyIcon="👤"
          items={items.map((u: any) => ({
            key: u.id,
            title: u.name || "-",
            subtitle: u.code,
            fields: [
              { label: "ID", value: u.id },
              { label: "Level", value: u.levelName || "-" },
              { label: "Email", value: u.email || "-" },
              { label: "Cabang", value: displayCabang(u.cabang) },
              { label: "Aktif", value: u.aktif ? "Ya" : "Tidak" },
            ],
            actions: (
              <div className="flex items-center gap-3">
                <button onClick={() => edit(u)} className="text-blue-600 hover:text-blue-800" title="Edit" aria-label={`Edit ${u.name}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => del(u.id)} className="text-red-600 hover:text-red-800" title="Hapus" aria-label={`Hapus ${u.name}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-9 0h12" />
                  </svg>
                </button>
              </div>
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
