"use client";
import { useState } from "react";

type Col = { key: string; label: string };

export default function PivotArea({
  fields,
  onChange,
  cols,
  pool,
}: {
  fields: string[];
  onChange: (next: string[]) => void;
  cols: Col[];
  pool: string[];
}) {
  const [dragField, setDragField] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const label = (k: string) => cols.find((c) => c.key === k)?.label || k;

  const add = (k: string) => {
    if (!fields.includes(k)) onChange([...fields, k]);
  };
  const remove = (k: string) => onChange(fields.filter((f) => f !== k));
  const moveBefore = (from: string, toIndex: number) => {
    if (!from || fields[toIndex] === from) return;
    const next = fields.filter((f) => f !== from);
    next.splice(Math.min(toIndex, next.length), 0, from);
    onChange(next);
  };

  return (
    <div
      className="mb-2 rounded-lg border border-dashed border-teal-primary/60 bg-teal-bg/30 p-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (dragField) {
          add(dragField);
          setDragField(null);
          setDragOver(null);
        }
      }}
    >
      <div className="text-[10px] font-bold text-slate-600 mb-1.5">
        Area Baris (tahan &amp; tarik field ke sini, urutan dari kiri ke kanan = berjenjang)
      </div>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {fields.map((key, idx) => (
          <span
            key={key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", key);
              setDragField(key);
            }}
            onDragEnd={() => {
              setDragField(null);
              setDragOver(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              moveBefore(dragField || "", idx);
              setDragField(null);
              setDragOver(null);
            }}
            className={
              "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-primary text-white text-[11px] font-semibold cursor-move select-none " +
              (dragOver === key ? "ring-2 ring-amber-400" : "")
            }
          >
            {idx + 1}. {label(key)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(key);
              }}
              className="ml-0.5 hover:text-white/80 text-[10px]"
            >
              ✕
            </button>
          </span>
        ))}
        {fields.length === 0 && (
          <span className="text-[11px] text-slate-400">Belum ada field — tarik field di bawah ke sini.</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="text-[10px] text-slate-500 mr-1">Sumber field:</span>
        {pool.map((key) => (
          <span
            key={key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", key);
              setDragField(key);
            }}
            onDragEnd={() => setDragField(null)}
            onClick={() => add(key)}
            className="inline-flex items-center px-2 py-1 rounded-full bg-white border border-slate-300 text-[11px] text-slate-600 cursor-grab hover:border-teal-primary hover:text-teal-dark select-none"
          >
            {label(key)}
          </span>
        ))}
        {pool.length === 0 && <span className="text-[11px] text-slate-400">Semua field sudah dipakai.</span>}
      </div>
    </div>
  );
}
