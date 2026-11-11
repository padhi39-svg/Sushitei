"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
};

type Props = {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  className?: string;
  inputClassName?: string;
  maxShown?: number;
  emptyText?: string;
  tabIndex?: number;
};

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  disabled = false,
  required = false,
  allowClear = true,
  className = "",
  inputClassName = "",
  maxShown = 100,
  emptyText = "Tidak ada data",
  tabIndex,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      o.value.toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const shown = filtered.slice(0, maxShown);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapRef} className={"relative " + className}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.label || "")}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(""); } }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          className={
            "w-full px-3 py-2 pr-14 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 " +
            "focus:outline-none focus:ring-2 focus:ring-teal-primary/30 focus:border-teal-primary " +
            "disabled:bg-slate-100 disabled:text-slate-500 " + inputClassName
          }
          aria-label={placeholder}
          tabIndex={tabIndex}
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {allowClear && value && !disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(null); setQuery(""); }}
              className="h-6 w-6 grid place-items-center rounded text-slate-400 hover:text-red-500 hover:bg-slate-100"
              title="Kosongkan"
              aria-label="Kosongkan pilihan"
            >
              ×
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (!disabled) { setOpen((v) => !v); setQuery(""); } }}
            className="h-6 w-6 grid place-items-center rounded text-slate-400 hover:text-teal-primary hover:bg-slate-100"
            aria-label="Buka pilihan"
          >
            ▾
          </button>
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {shown.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">{emptyText}</div>
          )}
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              className={
                "w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg transition-colors " +
                (o.value === value ? "bg-teal-bg text-teal-dark font-semibold" : "text-slate-700")
              }
            >
              <div className="truncate">{o.label}</div>
              {o.description && (
                <div className="text-[10px] text-slate-400 truncate">{o.description}</div>
              )}
            </button>
          ))}
          {filtered.length > shown.length && (
            <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
              {filtered.length - shown.length} pilihan lain — ketik untuk mempersempit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
