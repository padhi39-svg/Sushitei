import { NextRequest, NextResponse } from "next/server";
import {
  getBukuBesarDetail,
  getDaftarAkunBukuBesar,
  getInfoAkun,
} from "@/lib/bukuBesar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache in-memory untuk hasil TVF (jalur lambat). TTL 1 jam.
// Kunci: account|from|to. Jalur cepat (< 1 detik) tidak perlu di-cache.
type CacheEntry = {
  payload: any;
  fetchedAt: number;
};
const cache = new Map<string, CacheEntry>();
const TTL = 60 * 60 * 1000; // 1 jam

// GET /api/laporan/buku-besar?account=&from=&to=&mode=akun
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "data";

    if (mode === "akun") {
      const cabang = searchParams.get("cabang") || "00001/01";
      const rows = await getDaftarAkunBukuBesar(cabang);
      return NextResponse.json({ rows });
    }

    const account = searchParams.get("account") || searchParams.get("accountCode") || "";
    const from = searchParams.get("from") || searchParams.get("startDate") || "";
    const to = searchParams.get("to") || searchParams.get("endDate") || "";
    const refresh = searchParams.get("refresh") === "1";

    if (!account) return NextResponse.json({ error: "Akun wajib dipilih" }, { status: 400 });
    if (!from || !to) return NextResponse.json({ error: "Tanggal wajib dipilih" }, { status: 400 });

    const info = await getInfoAkun(account);
    if (!info) return NextResponse.json({ error: `Akun ${account} tidak ditemukan` }, { status: 404 });

    const key = `${account}|${from}|${to}`;
    if (!refresh) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.fetchedAt < TTL) {
        return NextResponse.json({ ...hit.payload, dariCache: true });
      }
    }

    const detail = await getBukuBesarDetail(account, from, to);

    const payload = {
      account: {
        nomor: info.Nomor,
        nama: info.Keterangan,
        sifat: info.Sifat ? "Debit" : "Kredit",
      },
      from,
      to,
      saldoAwal: detail.saldoAwal,
      saldoAkhirPa: detail.saldoAkhirPa,
      debetPa: detail.debetPa,
      kreditPa: detail.kreditPa,
      rows: detail.rows,
      totalMasuk: detail.totalMasuk,
      totalKeluar: detail.totalKeluar,
      totalRows: detail.totalRows,
      ownCount: detail.ownCount,
      sumber: detail.sumber,
    };

    // Cache hanya hasil TVF (hasil cepat sudah sangat cepat)
    if (detail.sumber === "tvf") {
      cache.set(key, { payload, fetchedAt: Date.now() });
    }

    return NextResponse.json({ ...payload, dariCache: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gagal memuat buku besar" }, { status: 500 });
  }
}
