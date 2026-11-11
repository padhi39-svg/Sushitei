import { NextRequest, NextResponse } from "next/server";
import { listReports } from "@/lib/sqlserver";

// GET /api/reports?dept=PENJUALAN  -> daftar laporan dari ReportList (SQL Server)
export async function GET(req: NextRequest) {
  const dept = req.nextUrl.searchParams.get("dept") || undefined;
  const rows = await listReports(dept);
  return NextResponse.json(rows);
}
