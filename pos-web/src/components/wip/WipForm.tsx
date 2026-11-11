"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { angka } from "@/lib/format";
import SearchableSelect from "@/components/SearchableSelect";
import Spinner from "@/components/Spinner";
import { notifyDataSaved } from "@/lib/save-feedback";

type Mode = "new" | "edit" | "view";

type Row = {
  key: string;
  brgKode: string | null;
  brgNama: string;
  jml: string;
  satuan: string;
  rasio: number;
  keterangan: string;
  satuanList: { satuan: string; rasio: number }[];
  hpp: number; // HPP per pcs
  totalHpp: number; // Total HPP (qty × hpp)
};

type BarangMeta = {
  kode: string;
  nama: string;
  units: { satuan: string; rasio: number }[];
};

type Gudang = { Kode: string; Keterangan: string };

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function WipForm({ mode, id, initial }: { mode: Mode; id?: number; initial?: any }) {
  const router = useRouter();
  const readonly = mode === "view";

  const [gudangList, setGudangList] = useState<Gudang[]>([]);
  const [barangList, setBarangList] = useState<BarangMeta[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(mode !== "view");
  const [lookupError, setLookupError] = useState("");

  const [form, setForm] = useState({
    kodenota: "",
    tgl: new Date().toISOString().slice(0, 10),
    cabang: "00001/01",
    gudang: "",
    keterangan: "",
    status: "POSTED",
    items: [] as Row[],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const savingRef = useRef(false);

  // Validasi: tombol Simpan enabled hanya jika semua field terisi
  const canSave = !readonly && !saving && form.gudang && form.tgl && form.items.length > 0 && form.items.every((it) => it.brgKode && Number(it.jml) > 0);
  const rowRefs = useRef<Record<string, { qty?: HTMLInputElement | null; barang?: HTMLInputElement | null }>>({});

  // Inisialisasi dari data awal (mode edit / view)
  useEffect(() => {
    if (!initial) return;
    const h = initial.header || {};
    const items = (initial.items || []).map((it: any) => ({
      key: newKey(),
      brgKode: it.brgKode,
      brgNama: it.brgNama || it.brgKode,
      jml: it.jml ? String(Number(it.jml)) : "",
      satuan: it.satuan || "",
      rasio: Number(it.rasio ?? 1) || 1,
      keterangan: it.keterangan || "",
      satuanList: [],
      hpp: Number(it.hpp || 0),
      totalHpp: Number(it.totalHpp || 0),
    }));
    // Fetch satuan for each item from Omega (master/barang API)
    (async () => {
      for (const it of items) {
        if (!it.brgKode) continue;
        try {
          const res = await fetch(`/api/master/barang?kode=${encodeURIComponent(it.brgKode)}`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const units = Array.isArray(data?.satuan) ? data.satuan : [];
            it.satuanList = units.map((u: any) => ({ satuan: u.Satuan || u.satuan, rasio: Number(u.Rasio || u.rasio || 1) }));
            // Ensure saved satuan is in the list
            if (it.satuan && !it.satuanList.some((u: any) => u.satuan === it.satuan)) {
              it.satuanList.push({ satuan: it.satuan, rasio: it.rasio });
            }
            if (!it.satuan && it.satuanList.length > 0) {
              it.satuan = it.satuanList[0].satuan;
              it.rasio = it.satuanList[0].rasio;
            }
          } else {
            // Fallback: add saved satuan to list
            if (it.satuan) {
              it.satuanList = [{ satuan: it.satuan, rasio: it.rasio }];
            }
          }
        } catch {
          if (it.satuan) {
            it.satuanList = [{ satuan: it.satuan, rasio: it.rasio }];
          }
        }
      }
      setForm((prev) => ({ ...prev, items: [...items] }));
    })();
    setForm({
      kodenota: h.kodenota || "",
      tgl: h.tgl ? new Date(h.tgl).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      cabang: h.cabang || "00001/01",
      gudang: h.gudang || "",
      keterangan: h.keterangan || "",
      status: "POSTED",
      items,
    });
  }, [initial]);

  // Lookup gudang dari Omega + barang setengah jadi
  useEffect(() => {
    if (mode === "view") return;
    let alive = true;
    setLoadingLookup(true);
    setLookupError("");
    const cabang = getCabangFromCookie();
    if (cabang && cabang !== "%") {
      setForm((prev) => ({ ...prev, cabang }));
    }
    Promise.all([
      fetch("/api/laporan/mutasi-persediaan?mode=gudang&cabang=" + encodeURIComponent(cabang), { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([g]) => {
        if (!alive) return;
        const allGudang = Array.isArray(g?.rows) ? g.rows : [];
        const filtered = cabang && cabang !== "%"
          ? allGudang.filter((x: any) => String(x.Kode).startsWith(cabang + "/"))
          : allGudang;
        setGudangList(filtered);
        if (!form.gudang && filtered.length) {
          setForm((prev) => ({ ...prev, gudang: filtered[0].Kode }));
        }
      })
      .catch(() => { if (alive) setLookupError("Gagal memuat data gudang dari Omega"); })
      .finally(() => { if (alive) setLoadingLookup(false); });
    return () => { alive = false; };
  }, [mode]);

  // Lookup barang setengah jadi untuk dropdown
  useEffect(() => {
    if (mode === "view") return;
    let alive = true;
    fetch("/api/wip/generate", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d?.rows) ? d.rows : [];
        setBarangList(list.map((r: any) => ({
          kode: r.brgKode,
          nama: r.brgNama,
          units: r.satuanList || [],
        })));
      })
      .catch(() => {})
      .finally(() => {});
    return () => { alive = false; };
  }, [mode]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/wip/generate", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal generate");
      const rows: Row[] = (d.rows || []).map((r: any) => ({
        key: newKey(),
        brgKode: r.brgKode,
        brgNama: r.brgNama,
        jml: "",
        satuan: r.defaultSatuan || "",
        rasio: r.defaultRasio || 1,
        keterangan: "",
        satuanList: r.satuanList || [],
        hpp: 0,
        totalHpp: 0,
      }));
      setForm((prev) => ({ ...prev, items: [...prev.items, ...rows] }));
    } catch (e: any) {
      alert(e?.message || "Gagal generate");
    } finally {
      setGenerating(false);
    }
  };

  const addRow = () => {
    const newK = newKey();
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { key: newK, brgKode: null, brgNama: "", jml: "", satuan: "", rasio: 1, keterangan: "", satuanList: [], hpp: 0, totalHpp: 0 }],
    }));
  };

  const removeRow = (key: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((r) => r.key !== key) }));
  };

  const updateRow = (key: string, patch: Partial<Row>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  };

  const onBarangChange = (key: string, kode: string | null) => {
    const meta = barangList.find((b) => b.kode === kode);
    if (meta) {
      updateRow(key, {
        brgKode: kode,
        brgNama: meta.nama || "",
        satuanList: meta.units || [],
        satuan: meta.units?.[0]?.satuan || "",
        rasio: meta.units?.[0]?.rasio || 1,
        hpp: 0,
        totalHpp: 0,
      });
    } else if (kode) {
      // Fetch from Omega if not in list
      updateRow(key, { brgKode: kode, brgNama: kode, satuanList: [], satuan: "", rasio: 1 });
      fetch(`/api/master/barang?kode=${encodeURIComponent(kode)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          const units = Array.isArray(data?.satuan) ? data.satuan : [];
          const satuanList = units.map((u: any) => ({ satuan: u.Satuan || u.satuan, rasio: Number(u.Rasio || u.rasio || 1) }));
          updateRow(key, {
            brgNama: data?.barang?.Keterangan || kode,
            satuanList,
            satuan: satuanList.length > 0 ? satuanList[0].satuan : "",
            rasio: satuanList.length > 0 ? satuanList[0].rasio : 1,
          });
        })
        .catch(() => {});
    } else {
      updateRow(key, { brgKode: null, brgNama: "", satuanList: [], satuan: "", rasio: 1 });
    }
  };

  const onSatuanChange = (key: string, satuan: string) => {
    const row = form.items.find((r) => r.key === key);
    const meta = barangList.find((b) => b.kode === row?.brgKode);
    const unit = meta?.units?.find((u) => u.satuan === satuan);
    updateRow(key, { satuan, rasio: unit?.rasio || 1 });
  };

  const save = async () => {
    if (!form.gudang) { setError("Gudang wajib dipilih"); return; }
    if (form.items.length === 0) { setError("Detail barang wajib diisi"); return; }
    for (const it of form.items) {
      if (!it.brgKode) { setError("Pilih barang untuk semua baris detail"); return; }
      if (!it.jml || Number(it.jml) <= 0) { setError("Qty harus lebih dari 0"); return; }
    }

    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const url = mode === "edit" && id ? `/api/wip/${id}` : "/api/wip";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tgl: form.tgl,
          cabang: form.cabang,
          gudang: form.gudang,
          keterangan: form.keterangan,
          status: form.status,
          items: form.items.map((it) => ({
            brgKode: it.brgKode,
            brgNama: it.brgNama,
            gudang: form.gudang,
            jml: Number(it.jml),
            rasio: it.rasio,
            satuan: it.satuan,
            hrgSatuan: 0,
            keterangan: it.keterangan,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal menyimpan");
      notifyDataSaved();
      router.push("/wip");
    } catch (e: any) {
      setError(e?.message || "Gagal menyimpan");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const barangOptions = barangList.map((b) => ({
    value: b.kode,
    label: `${b.kode} - ${b.nama}`,
  }));

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-sm font-bold text-slate-800">
            {mode === "new" ? "Transaksi Persediaan WIP Baru" : mode === "edit" ? "Edit Transaksi WIP" : "Detail Transaksi WIP"}
          </h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Persediaan Work In Progress (Setengah Jadi)</p>
        </div>
        <Link href="/wip" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">
          Kembali
        </Link>
      </div>

      {loadingLookup ? (
        <div className="report-card report-card-pad"><Spinner label="Memuat data master..." /></div>
      ) : lookupError ? (
        <div className="report-card report-card-pad text-red-600 text-[10px]">{lookupError}</div>
      ) : (
        <>
          {/* Header */}
          <div className="report-card report-card-pad">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kode Nota</label>
                <input
                  type="text"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full"
                  value={readonly ? (initial?.header?.kodenota || "") : (form.kodenota || "Auto Generate")}
                  disabled
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal</label>
                <input
                  type="date"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full"
                  value={form.tgl}
                  onChange={(e) => setForm((p) => ({ ...p, tgl: e.target.value }))}
                  disabled={readonly}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cabang</label>
                <input
                  type="text"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-[10px] bg-slate-100 w-full"
                  value={form.cabang}
                  disabled
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Gudang <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.gudang}
                  onChange={(e) => setForm((p) => ({ ...p, gudang: e.target.value }))}
                  disabled={readonly}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full"
                >
                  <option value="">-- Pilih Gudang --</option>
                  {gudangList.map((g: any) => (
                    <option key={g.Kode} value={g.Kode}>{g.Kode} - {g.Keterangan}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status</label>
                <input
                  type="text"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-100 w-full"
                  value={readonly ? (initial?.header?.status || "POSTED") : "POSTED"}
                  disabled
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keterangan</label>
                <textarea
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full"
                  rows={2}
                  value={form.keterangan}
                  onChange={(e) => setForm((p) => ({ ...p, keterangan: e.target.value }))}
                  disabled={readonly}
                />
              </div>
            </div>
          </div>

          {/* Detail */}
          <div className="report-card report-card-pad">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-700">Detail Barang Setengah Jadi</h2>
              {!readonly && (
                <div className="flex gap-2">
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-[10px] font-semibold hover:bg-teal-bg disabled:opacity-50"
                  >
                    {generating ? "Generating..." : "Generate (Setengah Jadi)"}
                  </button>
                  <button
                    onClick={addRow}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50"
                  >
                    + Tambah Baris
                  </button>
                </div>
              )}
            </div>

            {/* Desktop: tabel horizontal */}
          <div className="hidden md:block report-table-wrapper">
            <table className="report-table bordered" style={{ minWidth: "900px" }}>
              <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
                <tr>
                  <th className="w-[40px] text-center">No</th>
                  <th className="min-w-[200px]">Barang (Setengah Jadi)</th>
                  <th className="w-[80px] text-right">Qty</th>
                  <th className="w-[80px]">Satuan</th>
                  {/* HPP calculated in background on save */}
                  <th>Keterangan</th>
                  {!readonly && <th className="w-[80px] text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {form.items.map((row, idx) => (
                  <tr key={row.key} className="border-b border-slate-200">
                    <td className="text-center text-slate-400 text-[11px]">{idx + 1}</td>
                    <td>
                      <SearchableSelect
                        options={barangOptions}
                        value={row.brgKode}
                        onChange={(v) => onBarangChange(row.key, v ? String(v) : null)}
                        placeholder="Cari barang..."
                        disabled={readonly}
                        allowClear={true}
                        tabIndex={row.brgKode ? -1 : 0}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-right"
                        value={row.jml}
                        onChange={(e) => updateRow(row.key, { jml: e.target.value })}
                        disabled={readonly}
                      />
                    </td>
                    <td>
                      {row.satuanList.length <= 1 ? (
                        <span className="text-xs text-slate-600 px-2 py-1">{row.satuan || "-"}</span>
                      ) : (
                        <select
                          value={row.satuan}
                          onChange={(e) => onSatuanChange(row.key, e.target.value)}
                          disabled={readonly}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          {row.satuanList.map((u) => (
                            <option key={u.satuan} value={u.satuan}>{u.satuan}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    {/* HPP calculated in background */}
                    <td>
                      <input
                        type="text"
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        value={row.keterangan}
                        onChange={(e) => updateRow(row.key, { keterangan: e.target.value })}
                        disabled={readonly}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !readonly) {
                            e.preventDefault();
                            addRow();
                          }
                        }}
                      />
                    </td>
                    {!readonly && (
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {idx === form.items.length - 1 && (
                            <button
                              onClick={() => addRow()}
                              className="text-teal-600 text-[10px] font-bold hover:bg-teal-50 rounded px-1.5 py-0.5"
                              title="Tambah baris baru"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => removeRow(row.key)}
                            className="text-red-600 hover:text-red-800"
                            title="Hapus baris"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {form.items.length === 0 && (
                  <tr>
                    <td colSpan={readonly ? 4 : 5} className="text-center text-slate-400 py-6">
                      Belum ada detail. Klik "Generate" atau "Tambah Baris".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: card per baris (kebawah) */}
          <div className="md:hidden space-y-3">
            {form.items.map((row, idx) => (
              <div key={row.key} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500">Item #{idx + 1}</span>
                  {!readonly && (
                    <div className="flex items-center gap-2">
                      {idx === form.items.length - 1 && (
                        <button
                          onClick={() => addRow()}
                          className="text-teal-600 hover:text-teal-800"
                          title="Tambah baris baru"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => removeRow(row.key)}
                        className="text-red-600 hover:text-red-800"
                        title="Hapus baris"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Barang</label>
                  <SearchableSelect
                    options={barangOptions}
                    value={row.brgKode}
                    onChange={(v) => onBarangChange(row.key, v ? String(v) : null)}
                    placeholder="Cari barang..."
                    disabled={readonly}
                    allowClear={true}
                    tabIndex={row.brgKode ? -1 : 0}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] text-right"
                      value={row.jml}
                      onChange={(e) => updateRow(row.key, { jml: e.target.value })}
                      disabled={readonly}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Satuan</label>
                    {row.satuanList.length <= 1 ? (
                      <span className="block w-full px-2 py-1 text-[10px] text-slate-600">{row.satuan || "-"}</span>
                    ) : (
                      <select
                        value={row.satuan}
                        onChange={(e) => onSatuanChange(row.key, e.target.value)}
                        disabled={readonly}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] bg-white"
                      >
                        {row.satuanList.map((u) => (
                          <option key={u.satuan} value={u.satuan}>{u.satuan}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Keterangan</label>
                  <input
                    type="text"
                    className="w-full px-2 py-1 border border-slate-300 rounded text-[10px]"
                    value={row.keterangan}
                    onChange={(e) => updateRow(row.key, { keterangan: e.target.value })}
                    disabled={readonly}
                  />
                </div>
                {/* HPP calculated in background on save */}
                {!readonly && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => addRow()}
                      className="text-teal-600 text-[10px] font-bold hover:bg-teal-50 rounded px-2 py-1 border border-teal-300"
                    >
                      + Tambah Baris
                    </button>
                  </div>
                )}
              </div>
            ))}
            {form.items.length === 0 && (
              <div className="text-center text-slate-400 py-6">
                Belum ada detail. Klik "Generate" atau "Tambah Baris".
              </div>
            )}
          </div>
          </div>

          {/* Footer */}
          {!readonly && (
            <div className="report-card report-card-pad">
              {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
              {/* HPP calculated automatically on save */}
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={!canSave}
                  className="btn-primary disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  onClick={() => router.push("/wip")}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
