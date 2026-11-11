"use client";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: number[];
};

export default function Pagination({
  page, pageSize, total, onPage, onPageSize, pageSizes = [10, 20, 50, 100],
}: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const nums: (number | "...")[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) nums.push(i);
  } else {
    nums.push(1);
    if (page > 3) nums.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) nums.push(i);
    if (page < pages - 2) nums.push("...");
    nums.push(pages);
  }

  const btn = "min-w-[30px] h-[30px] px-2 rounded-lg border text-xs font-semibold transition-colors";
  const active = "bg-teal-primary border-teal-primary text-white";
  const normal = "bg-white border-slate-200 text-slate-600 hover:bg-teal-bg";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-1 border-t border-slate-100">
      <div className="text-[11px] text-slate-500">
        Menampilkan <b>{from}</b>–<b>{to}</b> dari <b>{total}</b> data
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onPageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-[30px] px-2 rounded-lg border border-slate-200 text-xs text-slate-600 bg-white"
            aria-label="Jumlah per halaman"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>{s} / hal</option>
            ))}
          </select>
        )}

        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}
          className={`${btn} ${normal} disabled:opacity-40 disabled:cursor-not-allowed`} aria-label="Sebelumnya">
          ‹
        </button>

        {nums.map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="px-1 text-xs text-slate-400">…</span>
          ) : (
            <button key={n} type="button" onClick={() => onPage(n)}
              className={`${btn} ${n === page ? active : normal}`}>{n}</button>
          )
        )}

        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}
          className={`${btn} ${normal} disabled:opacity-40 disabled:cursor-not-allowed`} aria-label="Berikutnya">
          ›
        </button>
      </div>
    </div>
  );
}
