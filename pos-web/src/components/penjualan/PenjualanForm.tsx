"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { angka, rupiah } from "@/lib/format";
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
  hrgSatuan: string; // kosong = ambil dari Omega saat simpan (mode new)
  keterangan: string;
  hargaMeta: string; // info harga dari lookup (mode new)
};

type BarangMeta = { kode: string; nama: string };
type Gudang = { Kode: string; Keterangan: string };

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

function getCabangFromCookie(): string {
  try {
    const m = document.cookie.match(/(?:^|; )x-cabang=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

export default function PenjualanForm({ mode, id, initial }: { mode: Mode; id?: number; initial?: any }) {
  const router = useRouter();
  const readonly = mode === "view";

  const [gudangList, setGudangList] = useState<Gudang[]>([]);
  const [barangList, setBarangList] = useState<BarangMeta[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(mode !== "view");
  const [lookupError, setLookupError] = useState("");

  const [form, setForm] = useState({
    tgl: new Date().toISOString().slice(0, 10),
    cabang: "00001/01",
    gudang: "",
    pelangganKode: "",
    pelangganNama: "",
    keterangan: "",
    items: [] as Row[],
  });

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");

  const total = form.items.reduce((s, it) => {
    const j = Number(it.jml || 0);
    const h = Number(it.hrgSatuan || 0);
    return s + j * h;
  }, 0);
  const canSave =
    !readonly && !saving && !!form.gudang && !!form.tgl && form.items.length > 0 &&
    form.items.every((it) => it.brgKode && Number(it.jml) > 0);

  useEffect(() => {
    if (!initial) return;
    const h = initial.header || {};
    setNota(h.kodeNota || "");
    setForm({
      tgl: h.tgl ? new Date(h.tgl).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      cabang: h.cabang || "00001/01",
      gudang: h.gudang || "",
      pelangganKode: h.pelangganKode || "",
      pelangganNama: h.pelangganNama || "",
      keterangan: h.keterangan || "",
      items: (initial.items || []).map((it: any) => ({
        key: newKey(),
        brgKode: it.brgKode,
        brgNama: it.brgNama || it.brgKode,
        jml: it.jml ? String(Number(it.jml)) : "",
        satuan: it.satuan || "",
        hrgSatuan: mode === "new" ? "" : String(Number(it.hrgSatuan || 0)),
        keterangan: it.keterangan || "",
        hargaMeta: "",
      })),
    });
  }, [initial, mode]);

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
      fetch("/api/penjualan/lookup", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([g, b]) => {
        if (!alive) return;
        const allGudang = Array.isArray(g?.rows) ? g.rows : [];
        const filtered = cabang && cabang !== "%"
          ? allGudang.filter((x: any) => String(x.Kode).startsWith(cabang + "/"))
          : allGudang;
        setGudangList(filtered);
        if (!form.gudang && filtered.length) {
          setForm((prev) => ({ ...prev, gudang: filtered[0].Kode }));
        }
        setBarangList(Array.isArray(b?.rows) ? b.rows.map((r: any) => ({ kode: r.Kode, nama: r.Keterangan })) : []);
      })
      .catch(() => { if (alive) setLookupError("Gagal memuat data master dari Omega"); })
      .finally(() => { if (alive) setLoadingLookup(false); });
    return () => { alive = false; };
  }, [mode]);

  const addRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { key: newKey(), brgKode: null, brgNama: "", jml: "", satuan: "", hrgSatuan: "", keterangan: "", hargaMeta: "" }],
    }));
  };
  const removeRow = (key: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((r) => r.key !== key) }));
  };
  const updateRow = (key: string, patch: Partial<Row>) => {
    setForm((prev) => ({ ...prev, items: prev.items.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  };

  const onBarangChange = async (key: string, kode: string | null) => {
    if (!kode) { updateRow(key, { brgKode: null, brgNama: "", satuan: "", hrgSatuan: "", hargaMeta: "" }); return; }
    const meta = barangList.find((b) => b.kode === kode);
    updateRow(key, { brgKode: kode, brgNama: meta?.nama || kode, satuan: "", hrgSatuan: "", hargaMeta: "Cari harga..." });
    try {
      const res = await fetch(`/api/penjualan/lookup?brg=${encodeURIComponent(kode)}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) {
        updateRow(key, { hargaMeta: d?.error || "Tidak ada harga" });
        return;
      }
      updateRow(key, {
        satuan: d.meta?.satuan || "",
        hrgSatuan: String(d.meta?.harga ?? ""),
        brgNama: d.meta?.nama || meta?.nama || kode,
        hargaMeta: `Harga: ${rupiah(d.meta?.harga ?? 0)} / ${d.meta?.satuan || ""}`,
      });
    } catch {
      updateRow(key, { hargaMeta: "Gagal cek harga" });
    }
  };

  const save = async () => {
    if (!form.gudang) { setError("Gudang wajib dipilih"); return; }
    if (!form.items.length) { setError("Detail barang wajib diisi"); return; }
    for (const it of form.items) {
      if (!it.brgKode) { setError("Pilih barang untuk semua baris detail"); return; }
      if (!it.jml || Number(it.jml) <= 0) { setError("Qty harus lebih dari 0"); return; }
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const url = mode === "edit" && id ? `/api/penjualan/${id}` : "/api/penjualan";
      const res = await fetch(url, {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tgl: form.tgl,
          cabang: form.cabang,
          gudang: form.gudang,
          pelangganKode: form.pelangganKode || null,
          pelangganNama: form.pelangganNama || null,
          keterangan: form.keterangan,
          items: form.items.map((it) => ({
            brgKode: it.brgKode,
            brgNama: it.brgNama,
            gudang: form.gudang,
            jml: Number(it.jml),
            keterangan: it.keterangan,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Gagal menyimpan");
      notifyDataSaved();
      router.push("/penjualan");
    } catch (e: any) {
      setError(e?.message || "Gagal menyimpan");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Gabungkan barang dari form items (mode edit/view) agar dropdown tampil nama walau
  // barang tersebut tidak ada di daftar 200 pertama dari API lookup Omega.
  const allBarang = useMemo(() => {
    const kodeSet = new Set(barangList.map((b) => b.kode));
    const extra = form.items
      .filter((it) => it.brgKode && !kodeSet.has(it.brgKode))
      .map((it) => ({ kode: it.brgKode!, nama: it.brgNama || it.brgKode! }));
    return [...barangList, ...extra];
  }, [barangList, form.items]);

  const barangOptions = allBarang.map((b) => ({
    value: b.kode,
    label: `${b.kode} - ${b.nama}`,
  }));

  return (
    <div className="w-full space-y-3 px-2 md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xs md:text-sm font-bold text-slate-800">
            {mode === "new" ? "Transaksi Penjualan Baru" : mode === "edit" ? "Edit Transaksi Penjualan" : "Detail Transaksi Penjualan"}
          </h1>
          <p className="text-[9px] text-slate-600 mt-0.5">Harga diambil dari Master Harga Jual Omega saat simpan pertama, lalu tersimpan (snapshot) di Postgres.</p>
        </div>
        <Link href="/penjualan" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Kembali</Link>
      </div>

      {loadingLookup ? (
        <div className="report-card report-card-pad"><Spinner label="Memuat data master..." /></div>
      ) : lookupError ? (
        <div className="report-card report-card-pad text-red-600 text-[10px]">{lookupError}</div>
      ) : (
        <>
          <div className="report-card report-card-pad">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal</label>
                <input type="date" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full"
                  value={form.tgl} onChange={(e) => setForm((p) => ({ ...p, tgl: e.target.value }))} disabled={readonly} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kode Nota</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-[10px] bg-slate-100 w-full font-mono"
                  value={nota || "Auto Generate"} disabled />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cabang</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-[10px] bg-slate-100 w-full" value={form.cabang} disabled />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gudang <span className="text-red-500">*</span></label>
                <select value={form.gudang} onChange={(e) => setForm((p) => ({ ...p, gudang: e.target.value }))} disabled={readonly}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white w-full">
                  <option value="">-- Pilih Gudang --</option>
                  {gudangList.map((g: any) => <option key={g.Kode} value={g.Kode}>{g.Kode} - {g.Keterangan}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pelanggan (Kode)</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full font-mono"
                  value={form.pelangganKode} onChange={(e) => setForm((p) => ({ ...p, pelangganKode: e.target.value }))} disabled={readonly} placeholder="opsional" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pelanggan (Nama)</label>
                <input type="text" className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full"
                  value={form.pelangganNama} onChange={(e) => setForm((p) => ({ ...p, pelangganNama: e.target.value }))} disabled={readonly} placeholder="opsional" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Keterangan</label>
                <textarea className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-full" rows={2}
                  value={form.keterangan} onChange={(e) => setForm((p) => ({ ...p, keterangan: e.target.value }))} disabled={readonly} />
              </div>
            </div>
          </div>

          <div className="report-card report-card-pad">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-700">Detail Barang (satuan terkecil, harga dari Master Harga Jual)</h2>
              {!readonly && (
                <button onClick={addRow} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">+ Tambah Baris</button>
              )}
            </div>

            <div className="hidden md:block report-table-wrapper">
              <table className="report-table bordered" style={{ minWidth: "900px" }}>
                <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
                  <tr>
                    <th className="w-[40px] text-center">No</th>
                    <th className="min-w-[200px]">Barang</th>
                    <th className="w-[80px] text-right">Qty</th>
                    <th className="w-[80px]">Satuan</th>
                    <th className="w-[130px] text-right">Harga Sat</th>
                    <th className="w-[140px] text-right">Subtotal</th>
                    <th>Keterangan</th>
                    {!readonly && <th className="w-[70px] text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((row, idx) => (
                    <tr key={row.key} className="border-b border-slate-200">
                      <td className="text-center text-slate-400 text-[11px]">{idx + 1}</td>
                      <td>
                        <SearchableSelect options={barangOptions} value={row.brgKode} onChange={(v) => onBarangChange(row.key, v ? String(v) : null)}
                          placeholder="Cari barang jadi..." disabled={readonly} allowClear={true} tabIndex={row.brgKode ? -1 : 0} />
                        {row.hargaMeta && <div className="text-[9px] text-slate-400 mt-0.5">{row.hargaMeta}</div>}
                      </td>
                      <td>
                        <input type="number" step="0.01" className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-right"
                          value={row.jml} onChange={(e) => updateRow(row.key, { jml: e.target.value })} disabled={readonly} />
                      </td>
                      <td><span className="text-xs text-slate-600 px-1">{row.satuan || "-"}</span></td>
                      <td className="text-right text-xs">{row.hrgSatuan ? rupiah(row.hrgSatuan) : "-"}</td>
                      <td className="text-right text-xs font-semibold">{Number(row.jml || 0) * Number(row.hrgSatuan || 0) ? rupiah(Number(row.jml || 0) * Number(row.hrgSatuan || 0)) : "-"}</td>
                      <td>
                        <input type="text" className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                          value={row.keterangan} onChange={(e) => updateRow(row.key, { keterangan: e.target.value })} disabled={readonly}
                          onKeyDown={(e) => { if (e.key === "Enter" && !readonly) { e.preventDefault(); addRow(); } }} />
                      </td>
                      {!readonly && (
                        <td className="text-center">
                          <button onClick={() => removeRow(row.key)} className="text-red-600 hover:text-red-800" title="Hapus baris">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {form.items.length === 0 && (
                    <tr><td colSpan={readonly ? 7 : 8} className="text-center text-slate-400 py-6">Belum ada detail. Klik "Tambah Baris".</td></tr>
                  )}
                </tbody>
                {form.items.length > 0 && (
                  <tfoot className="bg-teal-bg/40 font-bold">
                    <tr><td colSpan={5}>TOTAL</td><td className="text-right">{rupiah(total)}</td><td colSpan={readonly ? 1 : 2}></td></tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {form.items.map((row, idx) => (
                <div key={row.key} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">Item #{idx + 1}</span>
                    {!readonly && (
                      <button onClick={() => removeRow(row.key)} className="text-red-600 hover:text-red-800" title="Hapus baris">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Barang</label>
                    <SearchableSelect options={barangOptions} value={row.brgKode} onChange={(v) => onBarangChange(row.key, v ? String(v) : null)}
                      placeholder="Cari barang jadi..." disabled={readonly} allowClear={true} tabIndex={row.brgKode ? -1 : 0} />
                    {row.hargaMeta && <div className="text-[9px] text-slate-400 mt-0.5">{row.hargaMeta}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Qty ({row.satuan || "-"})</label>
                      <input type="number" step="0.01" className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] text-right"
                        value={row.jml} onChange={(e) => updateRow(row.key, { jml: e.target.value })} disabled={readonly} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Harga Sat</label>
                      <input type="text" className="w-full px-2 py-1 border border-slate-300 rounded text-[10px] text-right bg-slate-50" value={row.hrgSatuan ? rupiah(row.hrgSatuan) : "-"} disabled />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Keterangan</label>
                    <input type="text" className="w-full px-2 py-1 border border-slate-300 rounded text-[10px]" value={row.keterangan}
                      onChange={(e) => updateRow(row.key, { keterangan: e.target.value })} disabled={readonly} />
                  </div>
                </div>
              ))}
              {form.items.length === 0 && <div className="text-center text-slate-400 py-6">Belum ada detail.</div>}
              {form.items.length > 0 && <div className="text-right text-sm font-bold">Total: {rupiah(total)}</div>}
            </div>
          </div>

          {!readonly && (
            <div className="report-card report-card-pad">
              {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
              <div className="flex gap-2 items-center flex-wrap">
                <button onClick={save} disabled={!canSave} className="btn-primary disabled:opacity-50 inline-flex items-center gap-2">
                  {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
                <button onClick={() => router.push("/penjualan")} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-50">Batal</button>
                <span className="text-[10px] text-slate-500">Total: <b>{rupiah(total)}</b> — harga diambil dari Master Harga Jual saat simpan.</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
