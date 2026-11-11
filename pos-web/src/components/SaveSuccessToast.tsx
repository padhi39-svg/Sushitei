"use client";

import { useEffect, useState } from "react";
import { DATA_SAVED_EVENT } from "@/lib/save-feedback";

export default function SaveSuccessToast() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || "Data berhasil disimpan.");
    };
    window.addEventListener(DATA_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DATA_SAVED_EVENT, onSaved);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="fixed right-4 top-20 z-[100] flex items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-lg">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">✓</span>
      <span className="font-semibold">{message}</span>
      <button type="button" onClick={() => setMessage("")} className="ml-2 rounded border border-emerald-300 px-2 py-1 text-xs font-semibold hover:bg-emerald-50">OK</button>
    </div>
  );
}
