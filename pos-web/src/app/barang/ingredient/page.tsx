"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { angka, yaTidak } from "@/lib/format";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";
import DataCardList from "@/components/DataCardList";

export default function MasterIngredientPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/ingredient?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        if (!res.ok) {
          setError(d?.error || "Gagal memuat data");
          setItems([]);
          setTotal(0);
        } else {
          setItems(Array.isArray(d.rows) ? d.rows : []);
          setTotal(Number(d.total || 0));
          // kalau halaman kosong tapi masih ada data, mundur satu halaman
          if (page > 1 && Array.isArray(d.rows) && d.rows.length === 0 && Number(d.total || 0) > 0) {
            setPage(page - 1);
          }
        }
      } catch {
        setError("Gagal memuat data");
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, page, pageSize, reload]);

  // Hapus fungsi delete - hanya aktif/nonaktif via Edit
  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Master Ingredient</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Resep (BOM) barang jadi &amp; barang setengah jadi. Header &amp; bahan baku disimpan di PostgreSQL,
            master barang &amp; satuan dibaca live dari SQL Server Omega. Gunakan Import Excel untuk mengisi banyak resep sekaligus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/barang/ingredient/import" className="px-3 py-1.5 rounded-lg border border-teal-primary text-teal-primary text-[11px] font-semibold hover:bg-teal-bg">Import Excel</Link>
          <Link href="/barang/ingredient/new" className="btn-primary">+ Tambah Resep</Link>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Cari kode / nama barang jadi / setengah jadi..."
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-80"
          />
          <span className="badge">{total} resep</span>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      <div className="report-card report-card-pad">
        {/* Desktop: tabel */}
        <div className="report-table-wrapper hidden md:block" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          <table className="report-table">
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
              <tr>
                <th>Kode</th>
                <th>Barang Jadi / Setengah Jadi</th>
                <th className="text-center">Porsi</th>
                <th className="text-center">Jml Bahan</th>
                <th className="text-right">Total Qty</th>
                <th className="text-center">Aktif</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><Spinner /></td></tr>}
              {!loading && items.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-teal-bg/40">
                  <td className="font-semibold">{r.code}</td>
                  <td>
                    <div className="font-semibold">{r.barangNama || r.name}</div>
                    <div className="text-[10px] text-slate-400">{r.barangKode}</div>
                  </td>
                  <td className="text-center">{angka(r.portion, 2)}</td>
                  <td className="text-center">{r.itemCount}</td>
                  <td className="text-right font-semibold">{angka(r.totalQty, 4)}</td>
                  <td className="text-center">{yaTidak(r.aktif)}</td>
                  <td className="text-center whitespace-nowrap">
                    <button
                      onClick={() => router.push(`/barang/ingredient/${r.id}`)}
                      className="px-3 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold hover:bg-teal-dark"
                    >
                      View
                    </button>
                    <button
                      onClick={() => router.push(`/barang/ingredient/${r.id}/edit`)}
                      className="ml-1 px-3 py-1 rounded-full border border-amber-500 text-amber-600 text-[11px] font-semibold hover:bg-amber-50"
                    >
                      Edit
                    </button>

                  </td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-6">
                    {error ? "Gagal memuat" : "Belum ada resep"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: kartu */}
        <DataCardList
          loading={loading}
          emptyText={error ? "Gagal memuat data" : "Belum ada resep"}
          emptyIcon="📋"
          items={items.map((r: any) => ({
            key: r.id,
            title: r.barangNama || r.name || "-",
            subtitle: `${r.code} • ${r.barangKode}`,
            fields: [
              { label: "Porsi", value: angka(r.portion, 2) },
              { label: "Jml Bahan", value: r.itemCount },
              { label: "Total Qty", value: angka(r.totalQty, 4) },
              { label: "Aktif", value: yaTidak(r.aktif) },
            ],
            actions: (
              <>
                <button
                  onClick={() => router.push(`/barang/ingredient/${r.id}`)}
                  className="px-3 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold hover:bg-teal-dark"
                >
                  View
                </button>
                <button
                  onClick={() => router.push(`/barang/ingredient/${r.id}/edit`)}
                  className="px-3 py-1 rounded-full border border-amber-500 text-amber-600 text-[11px] font-semibold hover:bg-amber-50"
                >
                  Edit
                </button>

              </>
            ),
          }))}
        />

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
          pageSizes={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
}
