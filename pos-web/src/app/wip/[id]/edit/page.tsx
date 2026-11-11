"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import WipForm from "@/components/wip/WipForm";
import Spinner from "@/components/Spinner";

export default function WipEditPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [initial, setInitial] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/wip/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Gagal memuat data");
        return d;
      })
      .then((d) => {
        setInitial(d);
      })
      .catch((e) => setError(e?.message || "Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6"><Spinner label="Memuat data WIP..." /></div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!initial) return <div className="p-6 text-slate-400">Data tidak ditemukan</div>;

  return <WipForm mode="edit" id={id} initial={initial} />;
}
