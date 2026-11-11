"use client";

type CardItem = {
  key?: string | number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  fields?: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
};

type Props = {
  items: CardItem[];
  loading?: boolean;
  emptyText?: string;
  emptyIcon?: React.ReactNode;
};

/**
 * Tampilan data dalam bentuk kartu (card) untuk layar kecil (< md).
 * Dipakai sebagai pengganti tabel supaya tidak perlu scroll horizontal.
 */
export default function DataCardList({
  items,
  loading = false,
  emptyText = "Tidak ada data",
  emptyIcon,
}: Props) {
  if (loading) {
    return (
      <div className="md:hidden py-4">
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
          <span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-teal-primary animate-spin" />
          <span>Memuat data...</span>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="md:hidden py-8 text-center text-slate-400 text-sm">
        {emptyIcon && <div className="text-2xl mb-1">{emptyIcon}</div>}
        {emptyText}
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-2 py-1">
      {items.map((it, i) => (
        <div
          key={it.key ?? i}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-800 break-words">{it.title}</div>
              {it.subtitle && (
                <div className="text-[11px] text-slate-400 break-words">{it.subtitle}</div>
              )}
            </div>
          </div>

          {!!it.fields?.length && (
            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1">
              {it.fields.map((f, fi) => (
                <div key={fi} className="min-w-0">
                  <div className="text-[10px] text-slate-400">{f.label}</div>
                  <div className="text-xs font-semibold text-slate-700 break-words">{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {it.actions && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end gap-1.5 flex-wrap">
              {it.actions}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
