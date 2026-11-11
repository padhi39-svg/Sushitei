"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PenjualanForm from "@/components/penjualan/PenjualanForm";
import Spinner from "@/components/Spinner";

export default function Page() {
  const params = useParams();
  const id = Number(params.id);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/penjualan/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Gagal memuat data");
        return d;
      })
      .then(setData)
      .catch((e: any) => setError(e?.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="report-card report-card-pad"><Spinner label="Memuat transaksi..." /></div>;
  if (error || !data) return <div className="report-card report-card-pad text-red-600 text-xs">{error || "Data tidak ditemukan"}</div>;
  return <PenjualanForm mode="view" id={id} initial={data} />;
}
