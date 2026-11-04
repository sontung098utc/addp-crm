import { NextResponse } from "next/server";
import { getCustomerRetentionReport } from "@/lib/kpiCustomerEngine";

export async function GET() {
  try {
    const report = getCustomerRetentionReport();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    console.error("[CUSTOMER_RETENTION_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
