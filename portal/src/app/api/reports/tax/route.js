import { NextResponse } from "next/server";
import { getTaxReport } from "@/lib/adsTaxEngine";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "ALL";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const report = getTaxReport({ startDate, endDate, platform });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    console.error("[TAX_REPORT_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
