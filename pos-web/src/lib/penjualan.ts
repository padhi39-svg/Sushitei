import { queryMaster } from "@/lib/sqlserver";

export type BarangJual = {
  kode: string;
  nama: string;
  satuan: string; // satuan terkecil
  rasio: number; // rasio satuan terkecil (satuan dasar)
  harga: number; // harga per satuan terkecil (snapshot awal)
};

export type HargaError = { kode: string; pesan: string };

/**
 * Harga + satuan terkecil untuk sekumpulan kode barang (batch),
 * sumber Delta: Omega BrgPrice (Master Harga Jual) + Satuan.
 * - Satuan terkecil = Rasio terkecil (MIN) di Satuan.
 * - Harga per terkecil: kalau ada harga di Rasio terkecil -> pakai itu.
 *   Kalau tidak, harga dari rasio lebih besar dibagi rasionya.
 * Harga yang dipakai adalah yang terbaru (MAX Tgl) per Rasio,
 * kolom HrgJual (fallback HrgAkhir).
 */
export async function getHargaJualMap(kodes: string[]) {
  const uniq = Array.from(new Set((kodes || []).filter(Boolean)));
  const map: Record<string, BarangJual> = {};
  const errors: HargaError[] = [];
  if (!uniq.length) return { map, errors };

  const params: Record<string, any> = {};
  const inList = uniq.map((k, i) => { params[`k${i}`] = k; return `@k${i}`; }).join(",");

  const [barangRows, satuanRows, priceRows] = await Promise.all([
    queryMaster(
      `SELECT b.Kode, b.Keterangan, b.Golongan, b.Aktif
       FROM dbo.Barang b
       WHERE b.Kode IN (${inList})`,
      params
    ),
    queryMaster(
      `SELECT Brg, Satuan, Rasio FROM dbo.Satuan
       WHERE Brg IN (${inList}) ORDER BY Brg, Rasio`,
      params
    ),
    queryMaster(
      `SELECT p.Brg, p.Rasio, p.Tgl, p.HrgJual, p.HrgAkhir
       FROM dbo.BrgPrice p
       WHERE p.Brg IN (${inList})
         AND p.Tgl = (SELECT MAX(p2.Tgl) FROM dbo.BrgPrice p2 WHERE p2.Brg = p.Brg AND p2.Rasio = p.Rasio)`,
      params
    ),
  ]);

  const barangByKode: Record<string, any> = {};
  for (const b of barangRows as any[]) barangByKode[b.Kode] = b;

  const satuanByKode: Record<string, { satuan: string; rasio: number }[]> = {};
  for (const u of satuanRows as any[]) {
    (satuanByKode[u.Brg] ||= []).push({ satuan: u.Satuan, rasio: Number(u.Rasio || 1) });
  }

  const hargaByKodeRasio: Record<string, Record<number, number>> = {};
  for (const pr of priceRows as any[]) {
    const h = Number(pr.HrgJual || 0) || Number(pr.HrgAkhir || 0);
    if (!h) continue;
    (hargaByKodeRasio[pr.Brg] ||= {})[Number(pr.Rasio)] = h;
  }

  for (const kode of uniq) {
    const b = barangByKode[kode];
    if (!b) { errors.push({ kode, pesan: `Kode ${kode} tidak ditemukan di Omega` }); continue; }
    const units = (satuanByKode[kode] || []).slice().sort((a, b2) => a.rasio - b2.rasio);
    if (!units.length) { errors.push({ kode, pesan: `Kode ${kode} tidak punya satuan` }); continue; }
    const terkecil = units[0];
    const daftarHarga = hargaByKodeRasio[kode] || {};
    let harga = 0;
    if (daftarHarga[terkecil.rasio]) harga = daftarHarga[terkecil.rasio];
    else {
      // cari rasio terdekat di atasnya yang punya harga -> bagi rasio
      for (const u of units) {
        if (daftarHarga[u.rasio]) { harga = Math.round((daftarHarga[u.rasio] / (u.rasio || 1)) * 100) / 100; break; }
      }
    }
    if (!harga) { errors.push({ kode, pesan: `Kode ${kode} belum ada harga jual di Omega` }); continue; }
    map[kode] = { kode, nama: b.Keterangan || "", satuan: terkecil.satuan, rasio: terkecil.rasio, harga };
  }
  return { map, errors };
}

/** Kode nota otomatis: 00001/01/PJL/YYYYMM/TTTT (urut per bulan). */
export function buatKodeNota(cabang: string, tgl: Date, urutBulanKe: number) {
  const yyyymm = `${tgl.getFullYear()}${String(tgl.getMonth() + 1).padStart(2, "0")}`;
  return `${cabang || "00001/01"}/PJL/${yyyymm}/${String(urutBulanKe).padStart(4, "0")}`;
}
