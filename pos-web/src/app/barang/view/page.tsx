"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rupiah, tanggal, golongan, angka } from "@/lib/format";
import Spinner from "@/components/Spinner";

function Field({ label, value, required }: { label: string; value: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
      <label className="text-xs font-semibold text-slate-600 md:w-44 shrink-0">
        {label}{required ? " *" : ""}
      </label>
      <div className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 truncate">
        {value || "-"}
      </div>
    </div>
  );
}

export default function DetailBarangPage() {
  const router = useRouter();
  const [kode, setKode] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kode") || "";
    setKode(k);
    if (!k) { setLoading(false); setError("Kode barang tidak ada di URL"); return; }
    (async () => {
      try {
        const res = await fetch(`/api/master/barang?kode=${encodeURIComponent(k)}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) { setError(d?.error || "Gagal memuat detail"); setData(null); }
        else setData(d);
      } catch { setError("Gagal memuat detail"); }
      finally { setLoading(false); }
    })();
  }, []);

  const b = data?.barang;
  const satuan: any[] = data?.satuan || [];
  const harga: any[] = data?.harga || [];

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="rounded-2xl border border-teal-bg bg-gradient-to-r from-[#E8F6F5] via-[#F3FBFA] to-white p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/barang")} aria-label="Kembali"
            className="mt-0.5 h-8 w-8 grid place-items-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">Detail Barang</h1>
            <p className="text-xs text-slate-500">Master Barang</p>
          </div>
        </div>
      </div>

      {loading && <div className="report-card report-card-pad"><Spinner label="Memuat detail barang..." /></div>}
      {error && !loading && <div className="report-card report-card-pad text-sm text-red-600">{error}</div>}

      {b && !loading && (
        <>
          {/* Form utama */}
          <div className="report-card p-4 md:p-5 space-y-2.5">
            <Field label="Kode" value={b.Kode} required />
            <Field label="Nama" value={b.Keterangan} required />
            <Field label="Kategori" value={b.KategoriNama || b.Kategori} />
            <Field label="Spesifikasi" value={b.Spesifikasi} />
            <Field label="Merk" value={b.MerekNama || b.Merek} />
            <Field label="Ikhtisar" value={b.IkhtisarNomor ? `${b.IkhtisarNomor} - ${b.IkhtisarNama || ""}` : (b.Hint || "")} />
            <Field label="HPP (Rp)" value={rupiah(b.HPPStandart)} />
            <Field label="Jenis" value={golongan(b.Golongan)} />
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-semibold text-slate-600 md:w-44 shrink-0">Aktif</span>
              <input type="checkbox" checked={!!b.Aktif} readOnly disabled className="h-4 w-4 accent-[#2BA8A2]" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 md:w-44 shrink-0">Tampil Menu</span>
              <input type="checkbox" checked={!!b.TampilMenu} readOnly disabled className="h-4 w-4 accent-[#2BA8A2]" />
            </div>
          </div>

          {/* Satuan + Riwayat Harga: desktop 50:50, mobile atas-bawah (Satuan dulu) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {/* Satuan */}
            <div className="report-card p-4 md:p-5 space-y-2 min-w-0">
              <div className="text-sm font-bold text-slate-700">Satuan</div>
              <div className="w-full overflow-x-auto">
                <table className="detail-table">
                  <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white">
                    <tr><th>Nama</th><th>Rasio</th></tr>
                  </thead>
                  <tbody>
                    {satuan.map((s: any, i: number) => (
                      <tr key={i}>
                        <td>{s.Satuan}</td>
                        <td>{angka(s.Rasio)}</td>
                      </tr>
                    ))}
                    {!satuan.length && <tr><td colSpan={2} className="text-center text-slate-400 py-4">Belum ada satuan</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400">
                Contoh: pcs = 1, lsn = 12 pcs, dus = 48 pcs. Data satuan read-only dari Omega.
              </p>
            </div>

            {/* Riwayat Harga */}
            <div className="report-card p-4 md:p-5 space-y-2 min-w-0">
              <div className="text-sm font-bold text-slate-700">Riwayat Harga</div>
              <div className="w-full overflow-x-auto">
                <table className="detail-table">
                  <thead>
                    <tr><th>Harga</th><th>Satuan</th><th>Tanggal Berlaku</th></tr>
                  </thead>
                  <tbody>
                    {harga.map((h: any, i: number) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">{rupiah(h.HrgJual)}</td>
                        <td>{h.Satuan || "-"}</td>
                        <td className="whitespace-nowrap">{tanggal(h.Tgl)}</td>
                      </tr>
                    ))}
                    {!harga.length && <tr><td colSpan={3} className="text-center text-slate-400 py-4">Belum ada riwayat harga</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Catatan */}
          <div className="report-card p-4 md:p-5 space-y-2">
            <div className="text-xs font-semibold text-slate-600">Catatan</div>
            <textarea readOnly disabled value={b.Info || b.Hint || ""} placeholder="Catatan tambahan (opsional)"
              className="w-full min-h-[70px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 resize-none" />
          </div>
        </>
      )}
    </div>
  );
}
