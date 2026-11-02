import { NextResponse } from "next/server";

/**
 * Endpoint kiểm tra trạng thái hoạt động của CRM Portal (WBS-01 & WBS-02)
 * URL: GET /api/health
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "addp-crm-portal",
    domain: process.env.NEXT_PUBLIC_SITE_URL || "https://crm.addp.vn",
    timestamp: new Date().toISOString(),
  });
}
