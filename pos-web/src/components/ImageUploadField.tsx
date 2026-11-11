"use client";
import { useRef, useState } from "react";

type Props = {
  value?: string;
  kind?: "logo" | "background" | "general";
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  preview?: "square" | "wide";
};

/**
 * Input upload gambar (logo / background) -> simpan ke public/uploads
 * lalu kembalikan URL publiknya ke parent.
 */
export default function ImageUploadField({
  value = "",
  kind = "general",
  onChange,
  label,
  hint,
  preview = "square",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/settings/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setErr(d?.error || "Upload gagal");
      onChange(d.url || "");
    } catch {
      setErr("Upload gagal");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setErr("");
    if (value.startsWith("/uploads/")) {
      await fetch(`/api/settings/upload?path=${encodeURIComponent(value)}`, { method: "DELETE" }).catch(() => {});
    }
    onChange("");
  };

  return (
    <div>
      {label && <div className="block text-xs font-bold text-[#3C3C3C] mb-1">{label}</div>}

      <div className="flex items-start gap-3">
        <div
          className={
            preview === "wide"
              ? "w-40 h-24 rounded-lg border border-slate-300 bg-slate-50 shrink-0 overflow-hidden grid place-items-center"
              : "w-16 h-16 rounded-lg border border-slate-300 bg-slate-50 shrink-0 overflow-hidden grid place-items-center"
          }
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="preview" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-400 text-center px-1">Tidak ada</span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? "Mengupload..." : value ? "Ganti File" : "Upload File"}
            </button>
            {value && (
              <button
                type="button"
                onClick={remove}
                className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100"
              >
                Hapus
              </button>
            )}
          </div>

          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... atau /uploads/..."
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none border border-slate-300 bg-white focus:ring-2 focus:ring-teal-bg focus:border-teal-primary"
          />
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
          {err && <p className="text-[11px] text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
