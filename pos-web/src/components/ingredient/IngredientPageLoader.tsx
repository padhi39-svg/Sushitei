"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import IngredientForm from "./IngredientForm";
import Spinner from "@/components/Spinner";

export default function IngredientPageLoader({ mode }: { mode: "view" | "edit" }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params?.id);

  const [data, setData] = useState<{ header: any; items: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      setLoading(false);
      setError("ID resep tidak valid");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/ingredient/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Gagal memuat resep");
        return d;
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e?.message || "Gagal memuat resep"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="w-full space-y-3">
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
              <h1 className="text-xl font-bold text-slate-800">
                {mode === "edit" ? "Ubah Ingredient" : "Detail Ingredient"}
              </h1>
              <p className="text-xs text-slate-500">Master Ingredient</p>
            </div>
          </div>
        </div>
        <div className="report-card report-card-pad">
          <Spinner label="Memuat resep..." />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-3">
        <div className="report-card report-card-pad text-sm text-red-600">
          {error || "Resep tidak ditemukan"}
        </div>
        <div>
          <button
            type="button"
            onClick={() => router.push("/barang/ingredient")}
            className="px-4 py-1.5 rounded-full border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
          >
            ← Kembali ke daftar resep
          </button>
        </div>
      </div>
    );
  }

  return <IngredientForm mode={mode} id={id} initial={data} />;
}
