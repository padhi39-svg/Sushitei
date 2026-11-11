export default function Spinner({ label = "Memuat data..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
      <span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-teal-primary animate-spin" />
      <span>{label}</span>
    </div>
  );
}
