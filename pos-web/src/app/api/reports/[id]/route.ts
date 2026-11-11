import { NextRequest, NextResponse } from "next/server";
import { getReportById, queryMaster } from "@/lib/sqlserver";

// GET /api/reports/1001?TGLAWAL=2026-01-01&TGLAKHIR=2026-01-31&Cabang=%
// Mengambil Query1 dari ReportList, mengganti placeholder :TGLAWAL=DATETIME: dsb, lalu jalan langsung ke SQL Server.
// Catatan: query lama pakai #staff/#kategori dari desktop. Versi web harus sediakan context itu (TODO per laporan).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const report = await getReportById(id);
  if (!report) return NextResponse.json({ error: "ReportList tidak ditemukan" }, { status: 404 });

  const q = req.nextUrl.searchParams;
  let sqlText: string = report.Query1;

  // Ganti placeholder umum
  const replaceParam = (name: string, value: string) => {
    const re = new RegExp(`:${name}=[^:\\s;]+:`, "gi");
    sqlText = sqlText.replace(re, `'${value}'`);
  };
  if (q.get("TGLAWAL")) replaceParam("TGLAWAL", q.get("TGLAWAL")!);
  if (q.get("TGLAKHIR")) replaceParam("TGLAKHIR", q.get("TGLAKHIR")!);
  if (q.get("Cabang")) replaceParam("Cabang", q.get("Cabang")!);

  // TODO: picks up #staff/#kategori handling per report - for now jalankan apa adanya (mungkin gagal kalau butuh temp table desktop)
  try {
    const rows = await queryMaster(sqlText);
    return NextResponse.json({ report: { id: report.ID, title: report.Title, dept: report.Dept }, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, report: { id: report.ID, title: report.Title }, previewSql: sqlText.slice(0, 2000) }, { status: 500 });
  }
}
