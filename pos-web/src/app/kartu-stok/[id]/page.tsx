"use client";
import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import KartuStokForm from "@/components/kartu-stok/KartuStokForm";

export default function KartuStokDetailPage({ params }: { params: { id: string } }) {
  const [initial, setInitial] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/kartu-stok/${params.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setError(d.error); return; }
        setInitial(d);
      })
      .catch(() => { if (alive) setError("Gagal memuat data"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [params.id]);

  if (loading) return <div className="w-full max-w-[1520px] mx-auto"><Spinner /></div>;
  if (error) return <div className="w-full max-w-[1520px] mx-auto text-red-600 text-sm">{error}</div>;
  if (!initial) return null;

  return <KartuStokForm mode="view" id={Number(params.id)} initial={initial} />;
}