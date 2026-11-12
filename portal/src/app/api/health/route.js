import { NextResponse } from "next/server";
import { isSafePilotMode } from "@/lib/pilotConfig";

/**
 * Endpoint kiểm tra trạng thái hoạt động của CRM Portal (WBS-01 & WBS-02)
 * URL: GET /api/health
 * Đảm bảo: Trên môi trường staging, domain phản ánh chính xác địa chỉ staging (hoặc host cục bộ),
 * TUYỆT ĐỐI không trả về domain production (crm.addp.vn) khi đang chạy staging/pilot.
 */
export async function GET(request) {
  const host = request?.headers?.get("host");
  const proto = request?.headers?.get("x-forwarded-proto") || "http";
  const appEnv = process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "development");

  let domain = "";
  if (appEnv === "staging" || appEnv === "development") {
    domain = host ? `${proto}://${host}` : (process.env.APP_URL || `http://localhost:${process.env.PORT || 3006}`);
  } else {
    domain = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://crm.addp.vn";
  }

  return NextResponse.json({
    status: "ok",
    service: "addp-crm-portal",
    appEnv,
    domain,
    safeMode: isSafePilotMode(),
    timestamp: new Date().toISOString(),
  });
}
