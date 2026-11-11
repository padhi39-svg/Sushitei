"use client";
import { useEffect, useState } from "react";
import { rupiah, angka, yaTidak } from "@/lib/format";
import Spinner from "@/components/Spinner";
import Pagination from "@/components/Pagination";

export default function MasterSatuanPage() {
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
          `/api/master/satuan?search=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`,
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

  return (
    <div className="w-full max-w-[1520px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-800">Master Satuan</h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Sumber: SQL Server Omega <code>dbo.Satuan</code> (relasi <code>Satuan.Brg → Barang.Kode</code>) — tanpa sync.
          </p>
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Cari kode barang / nama barang / satuan..."
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-80" />
          <span className="badge">{total} baris</span>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>

      <div className="report-card report-card-pad">
        <div className="report-table-wrapper" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          <table className="report-table">
            <thead className="bg-gradient-to-r from-teal-primary to-teal-light text-white sticky top-0">
              <tr>
                <th>Kode Barang</th><th>Keterangan</th><th className="text-right">Rasio</th><th>Satuan</th>
                <th>Aktif</th><th>Satuan Beli</th><th className="text-right">Prioritas</th><th className="text-right">Harga Satuan</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><Spinner /></td></tr>}
              {!loading && items.map((s: any, i: number) => (
                <tr key={`${s.Brg}-${s.Rasio}-${i}`} className="border-b border-slate-100">
                  <td className="font-semibold">{s.Brg}</td>
                  <td>{s.Keterangan || "-"}</td>
                  <td className="text-right">{angka(s.Rasio)}</td>
                  <td>{s.Satuan}</td>
                  <td>{yaTidak(s.SatuanAktif)}</td>
                  <td>{yaTidak(s.SatuanBeli)}</td>
                  <td className="text-right">{s.Prioritas ?? "-"}</td>
                  <td className="text-right">{rupiah(s.HargaSatuan)}</td>
                </tr>
              ))}
              {!loading && !items.length && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-6">{error ? "Gagal memuat" : "Tidak ada data"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
