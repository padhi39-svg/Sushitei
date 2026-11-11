"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rupiah, golongan, yaTidak } from "@/lib/format";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import DataCardList from "@/components/DataCardList";

export default function MasterBarangPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const res = await fetch(
          `/api/master/barang?search=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        if (!res.ok) { setError(d?.error || "Gagal memuat data"); setItems([]); setTotal(0); }
        else { setItems(Array.isArray(d.rows) ? d.rows : []); setTotal(Number(d.total || 0)); }
      } catch { setError("Gagal memuat data"); setItems([]); setTotal(0); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, page, pageSize]);

  const view = (kode: string) => router.push(`/barang/view?kode=${encodeURIComponent(kode)}`);

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Master Barang</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Sumber: SQL Server Omega <code>dbo.Barang</code> — dibaca langsung, tanpa sync.
            Klik <b>View</b> untuk melihat detail satuan &amp; harga.
          </p>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Cari kode / keterangan barang..."
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-80" />
          <span className="badge">{total} baris</span>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      <div className="report-card report-card-pad">
        {/* Desktop: tabel */}
        <div className="report-table-wrapper hidden md:block" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          <table className="report-table">
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
              <tr>
                <th>Kode</th><th>Keterangan</th><th>Kategori</th><th>Merk</th>
                <th>Golongan</th><th>Aktif</th><th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><Spinner /></td></tr>}
              {!loading && items.map((b: any) => (
                <tr key={b.Kode} className="border-b border-slate-100 hover:bg-teal-bg/40">
                  <td className="font-semibold">{b.Kode}</td>
                  <td>{b.Keterangan || "-"}</td>
                  <td>{b.KategoriNama || b.Kategori || "-"}</td>
                  <td>{b.MerekNama || b.Merek || "-"}</td>
                  <td>{golongan(b.Golongan)}</td>
                  <td>{yaTidak(b.Aktif)}</td>
                  <td className="text-center">
                    <button onClick={() => view(b.Kode)}
                      className="px-3 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold hover:bg-teal-dark">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-6">{error ? "Gagal memuat" : "Tidak ada data"}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: kartu */}
        <DataCardList
          loading={loading}
          emptyText={error ? "Gagal memuat data" : "Tidak ada data"}
          emptyIcon="📦"
          items={items.map((b: any) => ({
            key: b.Kode,
            title: b.Kode,
            subtitle: b.Keterangan || "-",
            fields: [
              { label: "Kategori", value: b.KategoriNama || b.Kategori || "-" },
              { label: "Merek", value: b.MerekNama || b.Merek || "-" },
              { label: "Golongan", value: golongan(b.Golongan) },
              { label: "Aktif", value: yaTidak(b.Aktif) },
            ],
            actions: (
              <button onClick={() => view(b.Kode)}
                className="px-3 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold hover:bg-teal-dark">
                View
              </button>
            ),
          }))}
        />

        <Pagination
          page={page} pageSize={pageSize} total={total}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
          pageSizes={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );
}
