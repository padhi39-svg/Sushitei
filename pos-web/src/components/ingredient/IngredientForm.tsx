"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";
import Spinner from "@/components/Spinner";
import { notifyDataSaved } from "@/lib/save-feedback";

type Mode = "new" | "edit" | "view";

type Row = {
  key: string;
  bahanKode: string | null;
  qty: string;
  satuan: string;
  rasio: number;
  catatan: string;
};

type BarangMeta = {
  kode: string;
  nama: string;
  golongan: number;
  hpp: number;
  units: { satuan: string; rasio: number }[];
};

const GOLONGAN_LABEL: Record<number, string> = {
  0: "Bahan Baku",
  1: "Setengah Jadi",
  2: "Barang Jadi",
};

type Props = {
  mode: Mode;
  id?: number;
  initial?: { header: any; items: any[] } | null;
};

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;
const parseDecimal = (value: any) => {
  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return NaN;
  // Titik adalah format baku. Koma tunggal tetap diterima sebagai desimal,
  // lalu dinormalisasi sebelum dikirim sebagai angka; pemisah ribuan tidak dipakai.
  if (text.includes(",") && text.includes(".")) return NaN;
  return Number(text.replace(",", "."));
};
const hasMoreThan2Decimals = (value: any) => {
  const text = String(value ?? "").trim().replace(",", ".");
  const fraction = text.split(".")[1];
  return Boolean(fraction && fraction.length > 2);
};
const inputQty2 = (value: any) => {
  if (value === null || value === undefined || value === "") return "";
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
};
const displayQty2 = (value: any) => {
  const n = parseDecimal(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "-";
};
const displayNumber = (value: any, digits: number) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: digits }) : "-";
};

export default function IngredientForm({ mode, id, initial }: Props) {
  const router = useRouter();
  const readonly = mode === "view";

  const [jadiOptions, setJadiOptions] = useState<BarangMeta[]>([]);
  const [bahanOptions, setBahanOptions] = useState<BarangMeta[]>([]);
  // barang yang sudah punya resep: { barangKode: kodeResep }
  const [existingResep, setExistingResep] = useState<Record<string, string>>({});
  const [loadingLookup, setLoadingLookup] = useState(mode !== "view");
  const [lookupError, setLookupError] = useState("");

  const [form, setForm] = useState({
    barangKode: null as string | null,
    portion: "1.00",
    aktif: true,
    description: "",
    items: [] as Row[],
  });

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const initialized = useRef(false);

  // Inisialisasi dari data awal (mode edit / view)
  useEffect(() => {
    if (!initial) return;
    setForm({
      barangKode: initial.header?.barangKode || null,
      portion: inputQty2(initial.header?.portion ?? 1),
      aktif: Number(initial.header?.aktif ?? 1) === 1,
      description: initial.header?.description || "",
      items: (initial.items || []).map((it: any) => ({
        key: newKey(),
        bahanKode: it.bahanKode,
        qty: inputQty2(it.qty),
        satuan: it.satuan || "",
        rasio: Number(it.rasio ?? 1) || 1,
        catatan: it.catatan || "",
      })),
    });
    initialized.current = true;
  }, [initial]);

  // Lookup barang untuk dropdown (tidak perlu saat view)
  // + daftar barang yang sudah punya resep (untuk tanda di dropdown)
  useEffect(() => {
    if (mode === "view") return;
    let alive = true;
    setLoadingLookup(true);
    setLookupError("");
    Promise.all([
      fetch("/api/ingredient/lookup?mode=jadi", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/ingredient/lookup?mode=bahan", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/ingredient?page=1&pageSize=200", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jadi, bahan, existing]) => {
        if (!alive) return;
        setJadiOptions(Array.isArray(jadi) ? jadi : []);
        setBahanOptions(Array.isArray(bahan) ? bahan : []);
        const map: Record<string, string> = {};
        for (const row of existing?.rows || []) {
          if (row?.barangKode) map[row.barangKode] = row.code || "ada";
        }
        setExistingResep(map);
      })
      .catch(() => { if (alive) setLookupError("Gagal memuat data barang dari Omega"); })
      .finally(() => { if (alive) setLoadingLookup(false); });
    return () => { alive = false; };
  }, [mode]);

  const initialBahanNama = useMemo(() => {
    const map: Record<string, string> = {};
    for (const it of initial?.items || []) {
      if (it?.bahanKode) map[it.bahanKode] = it.bahanNama || it.bahanKode;
    }
    return map;
  }, [initial]);

  const jadiList: BarangMeta[] = useMemo(() => {
    const list = [...jadiOptions];
    if (form.barangKode && !list.some((b) => b.kode === form.barangKode)) {
      list.unshift({
        kode: form.barangKode,
        nama: initial?.header?.barangNama || form.barangKode,
        golongan: 2,
        hpp: 0,
        units: [],
      });
    }
    return list;
  }, [jadiOptions, form.barangKode, initial]);

  // Barang yang sudah punya resep (tanda di dropdown).
  // Saat edit, resep milik sendiri tetap boleh dipilih.
  const sudahPunyaResep = (kode: string) => {
    if (!existingResep[kode]) return false;
    return existingResep[kode] !== initial?.header?.code;
  };

  const bahanList = useMemo(() => {
    const list = [...bahanOptions];
    for (const r of form.items) {
      if (r.bahanKode && !list.some((b) => b.kode === r.bahanKode)) {
        list.unshift({
          kode: r.bahanKode,
          nama: initialBahanNama[r.bahanKode] || r.bahanKode,
          golongan: 0,
          hpp: 0,
          units: [{ satuan: r.satuan || "Unit", rasio: r.rasio || 1 }],
        });
      }
    }
    return list;
  }, [bahanOptions, form.items, initialBahanNama]);

  const metaOf = (kode: string | null): BarangMeta | undefined =>
    !kode ? undefined : (bahanOptions.find((b) => b.kode === kode) || bahanList.find((b) => b.kode === kode));

  const unitOf = (row: Row) => {
    const m = metaOf(row.bahanKode);
    return m?.units.find((u) => u.satuan === row.satuan);
  };

  // Qty dikonversi ke satuan dasar (rasio 1) dari bahan baku
  // contoh: 2 KARTON (rasio 24) = 48 PCS
  const stokDasarOf = (row: Row) => {
    const qty = parseDecimal(row.qty || 0);
    const rasio = unitOf(row)?.rasio ?? row.rasio ?? 1;
    return (isFinite(qty) ? qty : 0) * (rasio || 1);
  };

  const totalStokDasar = form.items.reduce((s, r) => s + stokDasarOf(r), 0);

  const update = (key: string, patch: Partial<Row>) => {
    setForm((f) => ({ ...f, items: f.items.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  };

  const addRow = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, { key: newKey(), bahanKode: null, qty: inputQty2(1), satuan: "", rasio: 1, catatan: "" }],
    }));
  };

  const removeRow = (key: string) => {
    setForm((f) => ({ ...f, items: f.items.filter((r) => r.key !== key) }));
  };

  const pickBahan = (key: string, kode: string | null) => {
    const m = kode ? bahanList.find((b) => b.kode === kode) : undefined;
    const first = m?.units?.[0];
    update(key, { bahanKode: kode, satuan: first?.satuan || "", rasio: first?.rasio || 1 });
  };

  const pickUnit = (row: Row, satuan: string) => {
    const m = metaOf(row.bahanKode);
    const u = m?.units.find((x) => x.satuan === satuan);
    update(row.key, { satuan, rasio: u?.rasio || 1 });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly || saving) return;
    setError("");

    if (!form.barangKode) { setError("Barang jadi wajib dipilih"); return; }
    if (!form.items.length) { setError("Minimal harus ada 1 bahan"); return; }

    const portion = parseDecimal(form.portion);
    if (!Number.isFinite(portion) || portion < 1 || hasMoreThan2Decimals(form.portion)) {
      setError("Porsi minimal 1 dan maksimal 2 angka desimal (gunakan titik)");
      return;
    }

    for (let i = 0; i < form.items.length; i++) {
      const r = form.items[i];
      if (!r.bahanKode) { setError(`Bahan baku baris ${i + 1} belum dipilih`); return; }
      if (!(parseDecimal(r.qty) > 0) || hasMoreThan2Decimals(r.qty)) {
        setError(`Qty baris ${i + 1} harus lebih dari 0 dan maksimal 2 angka desimal (gunakan titik)`);
        return;
      }
      if (!r.satuan) { setError(`Satuan baris ${i + 1} belum dipilih`); return; }
    }

    // 1 barang hanya boleh punya 1 resep
    if (form.barangKode && sudahPunyaResep(form.barangKode)) {
      setError(`Barang ${form.barangKode} sudah punya resep (${existingResep[form.barangKode]}). Gunakan Edit untuk mengubah.`);
      return;
    }

    const payload = {
      barangKode: form.barangKode,
      name: jadiList.find((b) => b.kode === form.barangKode)?.nama || initial?.header?.name || "",
      portion,
      aktif: form.aktif,
      description: form.description,
      items: form.items.map((r) => ({
        bahanKode: r.bahanKode,
        qty: parseDecimal(r.qty) || 0,
        satuan: r.satuan,
        catatan: r.catatan,
      })),
    };

    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch(
        mode === "new" ? "/api/ingredient" : `/api/ingredient/${id}`,
        {
          method: mode === "new" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Gagal menyimpan resep");
      notifyDataSaved();
      router.push("/barang/ingredient");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan resep");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const pageTitle =
    mode === "new" ? "Tambah Ingredient" : mode === "edit" ? "Ubah Ingredient" : "Detail Ingredient";
  const pageSubtitle =
    mode === "new" ? "Lengkapi data resep lalu simpan" : mode === "edit" ? "Ubah data resep lalu simpan" : "Resep ingredient (read-only)";

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="rounded-2xl border border-teal-bg bg-gradient-to-r from-[#E8F6F5] via-[#F3FBFA] to-white p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push("/barang/ingredient")}
            aria-label="Kembali"
            className="mt-0.5 h-8 w-8 grid place-items-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">{pageTitle}</h1>
            <p className="text-xs text-slate-500">{pageSubtitle}</p>
          </div>
          {!readonly && form.barangKode && (
            <span className="hidden sm:inline badge">{form.barangKode}</span>
          )}
        </div>
      </div>

      {(error || lookupError) && (
        <div className="report-card report-card-pad text-sm text-red-600 border border-red-200 bg-red-50">
          {error || lookupError}
        </div>
      )}

      <form onSubmit={submit} className="report-card p-4 md:p-5 space-y-4">
        {/* Barang Jadi / Setengah Jadi + Porsi + Aktif */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
            <label className="text-xs font-semibold text-slate-600 md:w-40 shrink-0">
              Barang Jadi / Setengah Jadi <span className="text-red-500">*</span>
            </label>
            <div className="flex-1 min-w-0">
              {readonly ? (
                <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  {initial?.header?.barangNama || form.barangKode || "-"}
                  {form.barangKode && <span className="text-slate-400"> ({form.barangKode})</span>}
                </div>
              ) : (
                <SearchableSelect
                  options={jadiList.map((b) => ({
                    value: b.kode,
                    label: `${b.kode} - ${b.nama}${sudahPunyaResep(b.kode) ? " (sudah ada resep)" : ""}`,
                    description: `${b.golongan === 1 ? "Setengah Jadi" : "Barang Jadi"}${sudahPunyaResep(b.kode) ? ` • sudah ada resep (${existingResep[b.kode]})` : ""}`,
                  }))}
                  value={form.barangKode}
                  onChange={(v) => setForm((f) => ({ ...f, barangKode: v }))}
                  placeholder={loadingLookup ? "Memuat barang..." : "Pilih barang jadi / setengah jadi..."}
                  disabled={loadingLookup || saving}
                  emptyText="Barang tidak ditemukan"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
            <label className="text-xs font-semibold text-slate-600 md:w-40 shrink-0">Porsi</label>
            <div className="flex-1 min-w-0">
              {readonly ? (
                <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
                  {displayQty2(form.portion)}
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.portion}
                  onChange={(e) => setForm((f) => ({ ...f, portion: e.target.value }))}
                  onBlur={() => setForm((f) => ({ ...f, portion: Number.isFinite(parseDecimal(f.portion)) && !hasMoreThan2Decimals(f.portion) ? inputQty2(f.portion) : f.portion }))}
                  className="w-full md:max-w-[220px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                  placeholder="1.00"
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600 md:w-40 shrink-0">Aktif</span>
            <input
              type="checkbox"
              checked={form.aktif}
              onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
              disabled={readonly || saving}
              className="h-4 w-4 accent-[#2BA8A2]"
            />
            {readonly && <span className="text-xs text-slate-500">{form.aktif ? "Ya" : "Tidak"}</span>}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* Bahan / Komponen */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-700">Bahan / Komponen</div>
            {!readonly && (
              <button
                type="button"
                onClick={addRow}
                disabled={saving}
                className="px-3 py-1.5 rounded-full border border-teal-primary text-teal-primary text-xs font-semibold hover:bg-teal-bg disabled:opacity-50"
              >
                + Tambah Bahan
              </button>
            )}
          </div>

          {loadingLookup && mode !== "view" ? (
            <Spinner label="Memuat bahan..." />
          ) : (
            <>
              {!form.items.length && (
                <div className="text-center text-slate-400 text-sm py-6 border border-dashed border-slate-200 rounded-xl">
                  Belum ada bahan.{!readonly && " Klik “+ Tambah Bahan” untuk menambah."}
                </div>
              )}

              {/* Desktop table */}
              {form.items.length > 0 && (
                <div className="hidden md:block">
                  <table className="detail-table w-full">
                    <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
                      <tr>
                        <th className="w-[32%]">Bahan / Komponen</th>
                        <th className="w-[10%] text-right">Qty</th>
                        <th className="w-[16%]">Unit</th>
                        <th className="w-[14%] text-right">Stok (satuan dasar)</th>
                        <th className="w-[20%]">Catatan</th>
                        {!readonly && <th className="w-[8%] text-center">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((row) => {
                        const m = metaOf(row.bahanKode);
                        return (
                          <tr key={row.key}>
                            <td className="align-top">
                              {readonly ? (
                                <div className="text-xs text-slate-700">
                                  {m?.nama || initialBahanNama[row.bahanKode || ""] || "-"}
                                  {m && (
                                    <span className="text-[10px] text-slate-400 ml-1">
                                      {GOLONGAN_LABEL[m.golongan] || ""}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <SearchableSelect
                                  options={bahanList.map((b) => ({
                                    value: b.kode,
                                    label: `${b.kode} - ${b.nama}`,
                                    description: `${GOLONGAN_LABEL[b.golongan] || ""}${b.units.length ? " • " + b.units.map((u) => u.satuan).join(", ") : ""}`,
                                  }))}
                                  value={row.bahanKode}
                                  onChange={(v) => pickBahan(row.key, v)}
                                  placeholder="Pilih bahan..."
                                  inputClassName="!py-1.5 !text-xs"
                                  disabled={saving}
                                  emptyText="Bahan tidak ditemukan"
                                />
                              )}
                            </td>
                            <td className="align-top">
                              {readonly ? (
                                <div className="text-xs text-right">{displayQty2(row.qty)}</div>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.qty}
                                  onChange={(e) => update(row.key, { qty: e.target.value })}
                                  onBlur={() => update(row.key, { qty: Number.isFinite(parseDecimal(row.qty)) && !hasMoreThan2Decimals(row.qty) ? inputQty2(row.qty) : row.qty })}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-right"
                                  placeholder="0.00"
                                  disabled={saving}
                                />
                              )}
                            </td>
                            <td className="align-top">
                              {readonly ? (
                                <div className="text-xs">{row.satuan || "-"}</div>
                              ) : (
                                <select
                                  value={row.satuan}
                                  onChange={(e) => pickUnit(row, e.target.value)}
                                  disabled={!row.bahanKode || saving}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:bg-slate-100"
                                >
                                  <option value="">Pilih</option>
                                  {(m?.units || []).map((u) => (
                                    <option key={u.satuan} value={u.satuan}>
                                       {u.satuan} ({displayNumber(u.rasio, 4)})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="align-top text-right text-xs font-semibold whitespace-nowrap">
                              {displayNumber(stokDasarOf(row), 4)}
                            </td>
                            <td className="align-top">
                              {readonly ? (
                                <div className="text-xs text-slate-600">{row.catatan || "-"}</div>
                              ) : (
                                <input
                                  value={row.catatan}
                                  onChange={(e) => update(row.key, { catatan: e.target.value })}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                                  placeholder="Catatan"
                                  disabled={saving}
                                />
                              )}
                            </td>
                            {!readonly && (
                              <td className="align-top text-center">
                                <button
                                  type="button"
                                  onClick={() => removeRow(row.key)}
                                  disabled={saving}
                                  className="text-red-500 hover:text-red-700 text-xs font-semibold"
                                >
                                  Hapus
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={readonly ? 3 : 4} className="text-right text-xs font-semibold text-slate-600">
                          Total Qty (satuan dasar)
                        </td>
                        <td className="text-right text-xs font-bold text-slate-800 whitespace-nowrap" colSpan={readonly ? 1 : 2}>
                          {displayNumber(totalStokDasar, 4)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Mobile cards */}
              {form.items.length > 0 && (
                <div className="md:hidden space-y-2">
                  {form.items.map((row) => {
                    const m = metaOf(row.bahanKode);
                    return (
                      <div key={row.key} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-white">
                        <div>
                          <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Bahan / Komponen</div>
                          {readonly ? (
                            <div className="text-xs text-slate-700">
                              {m?.nama || initialBahanNama[row.bahanKode || ""] || "-"}
                              {m && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  {GOLONGAN_LABEL[m.golongan] || ""}
                                </span>
                              )}
                            </div>
                          ) : (
                            <SearchableSelect
                              options={bahanList.map((b) => ({
                                value: b.kode,
                                label: `${b.kode} - ${b.nama}`,
                                description: `${GOLONGAN_LABEL[b.golongan] || ""}${b.units.length ? " • " + b.units.map((u) => u.satuan).join(", ") : ""}`,
                              }))}
                              value={row.bahanKode}
                              onChange={(v) => pickBahan(row.key, v)}
                              placeholder="Pilih bahan..."
                              inputClassName="!py-1.5 !text-xs"
                              disabled={saving}
                              emptyText="Bahan tidak ditemukan"
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Qty</div>
                            {readonly ? (
                              <div className="text-xs">{displayQty2(row.qty)}</div>
                            ) : (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.qty}
                                onChange={(e) => update(row.key, { qty: e.target.value })}
                                onBlur={() => update(row.key, { qty: Number.isFinite(parseDecimal(row.qty)) && !hasMoreThan2Decimals(row.qty) ? inputQty2(row.qty) : row.qty })}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-right"
                                placeholder="0.00"
                                disabled={saving}
                              />
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Unit</div>
                            {readonly ? (
                              <div className="text-xs">{row.satuan || "-"}</div>
                            ) : (
                              <select
                                value={row.satuan}
                                onChange={(e) => pickUnit(row, e.target.value)}
                                disabled={!row.bahanKode || saving}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:bg-slate-100"
                              >
                                <option value="">Pilih</option>
                                {(m?.units || []).map((u) => (
                                  <option key={u.satuan} value={u.satuan}>
                                     {u.satuan} ({displayNumber(u.rasio, 4)})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Stok (satuan dasar)</div>
                             <div className="text-xs font-semibold">{displayNumber(stokDasarOf(row), 4)}</div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Catatan</div>
                          {readonly ? (
                            <div className="text-xs text-slate-600">{row.catatan || "-"}</div>
                          ) : (
                            <input
                              value={row.catatan}
                              onChange={(e) => update(row.key, { catatan: e.target.value })}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                              placeholder="Catatan"
                              disabled={saving}
                            />
                          )}
                        </div>

                        {!readonly && (
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => removeRow(row.key)}
                              disabled={saving}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold"
                            >
                              Hapus
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between rounded-xl bg-teal-bg/40 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-600">Total Qty (satuan dasar)</span>
                     <span className="text-sm font-bold text-slate-800">{displayNumber(totalStokDasar, 4)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Deskripsi */}
        <div className="flex flex-col md:flex-row gap-1 md:gap-3">
          <label className="text-xs font-semibold text-slate-600 md:w-40 shrink-0 md:pt-2">Deskripsi</label>
          <div className="flex-1 min-w-0">
            {readonly ? (
              <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 min-h-[64px] whitespace-pre-wrap">
                {form.description || "-"}
              </div>
            ) : (
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Deskripsi resep (opsional)"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none"
                disabled={saving}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          {readonly ? (
            <>
              <Link href="/barang/ingredient" className="px-4 py-1.5 rounded-full border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                Kembali
              </Link>
              <Link
                href={`/barang/ingredient/${id}/edit`}
                className="px-4 py-1.5 rounded-full bg-teal-primary text-white text-xs font-semibold hover:bg-teal-dark"
              >
                Edit
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => router.push("/barang/ingredient")}
                disabled={saving}
                className="px-4 py-1.5 rounded-full border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving || loadingLookup || !form.items.length}
                className="px-4 py-1.5 rounded-full bg-teal-primary text-white text-xs font-semibold hover:bg-teal-dark disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          )}
        </div>

        {/* Info audit: user create & update */}
        {initial?.header && (initial.header.userNameCreate || initial.header.userNameEdit || initial.header.userCreate || initial.header.userEdit) && (
          <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-500 space-y-0.5">
            {initial.header.userNameCreate && (
              <div>Created by: <span className="font-semibold text-slate-700">{initial.header.userNameCreate}</span>
                {initial.header.createdAt && <span className="ml-1">({new Date(initial.header.createdAt).toLocaleString("id-ID")})</span>}
              </div>
            )}
            {initial.header.userNameEdit && initial.header.userEdit !== initial.header.userCreate && (
              <div>Updated by: <span className="font-semibold text-slate-700">{initial.header.userNameEdit}</span>
                {initial.header.updatedAt && <span className="ml-1">({new Date(initial.header.updatedAt).toLocaleString("id-ID")})</span>}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
