import { NextResponse } from "next/server";
import { getStaffKpiReport } from "@/lib/kpiCustomerEngine";

export async function GET() {
  try {
    const report = getStaffKpiReport();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    console.error("[STAFF_KPI_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
