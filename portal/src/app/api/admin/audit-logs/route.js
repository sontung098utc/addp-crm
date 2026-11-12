import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { guardApiRequest } from "@/lib/rbac.js";
import { getRecentMessageAudits } from "@/lib/adapters/messageAuditLogger.js";

/**
 * ADDP CRM — API TRUY XUẤT NHẬT KÝ KIỂM TOÁN GỬI TIN NHẮN (AUDIT LOGS)
 * GET /api/admin/audit-logs
 * Phục vụ giám sát tuân thủ, đối soát trạng thái gửi tin (queued, sent, failed, mocked),
 * mã phản hồi HTTP provider và người gửi.
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "settings",
      resourceType: "audit_logs",
    });

    if (!guard.ok) {
      return guard.response;
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(5, Number(searchParams.get("limit")) || 50));
    const logs = getRecentMessageAudits(limit);

    return NextResponse.json({
      ok: true,
      count: logs.length,
      logs,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
