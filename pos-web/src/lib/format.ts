export function rupiah(v: any) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "-";
  return "Rp " + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function angka(v: any, digits = 4) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function tanggal(v: any) {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function yaTidak(v: any) {
  return v === true || v === 1 || v === "1" ? "Ya" : "Tidak";
}

export const GOLONGAN: Record<string, string> = {
  "0": "Bahan Baku",
  "1": "Setengah Jadi",
  "2": "Barang Jadi",
};

export function golongan(v: any) {
  return GOLONGAN[String(v ?? "")] || "-";
}
