import { NextResponse } from "next/server";
import { getGoldenHoursReport } from "@/lib/adsTaxEngine";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "ALL";
    const report = getGoldenHoursReport(channel);

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    console.error("[ADS_REPORT_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
