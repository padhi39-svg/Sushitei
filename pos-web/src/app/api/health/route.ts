import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { queryMaster } from "@/lib/sqlserver";

export async function GET() {
  let pg: any = "down";
  let mssql: any = "down";
  try {
    await db.execute(sql`SELECT 1`);
    pg = "up";
  } catch (e: any) {
    pg = e.message;
  }
  try {
    await queryMaster("SELECT 1 AS ok");
    mssql = "up";
  } catch (e: any) {
    mssql = e.message;
  }
  return NextResponse.json({ postgres: pg, sqlserver_omega: mssql, mode: "langsung-baca-tanpa-sync" });
}
