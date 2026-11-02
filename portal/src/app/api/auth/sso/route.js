import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  getStaffByIdOrCode,
  createSessionToken,
} from "../../../../lib/auth.js";
import {
  issueSsoBridgePayload,
  syncSessionWithJavisFastApi,
} from "../../../../lib/ssoBridge.js";

/**
 * API Cầu nối SSO/JWT giữa Next.js Portal và Javis OS FastAPI (WBS-09)
 * GET /api/auth/sso?staffCode=S002 -> Kiểm tra & cấp vé SSO đồng bộ giữa 2 dịch vụ
 * POST /api/auth/sso -> Trao đổi token trực tiếp với Javis FastAPI (/api/crm/sso/exchange)
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const { searchParams } = new URL(request.url);
    const requestedCode = searchParams.get("staffCode") || "ADMIN";

    let token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token || searchParams.get("staffCode")) {
      const targetStaff = getStaffByIdOrCode(requestedCode) || getStaffByIdOrCode("ADMIN");
      token = createSessionToken(targetStaff);
    }

    const synced = await syncSessionWithJavisFastApi(token);
    return NextResponse.json(synced);
  } catch (error) {
    console.error("[SSO_GET_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi máy chủ khi đồng bộ phiên SSO." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const staffCode = body.staffCode || "ADMIN";
    const payload = issueSsoBridgePayload(staffCode);
    if (!payload.ok) {
      return NextResponse.json({ error: payload.error }, { status: 400 });
    }
    const synced = await syncSessionWithJavisFastApi(payload.sessionToken);
    return NextResponse.json(synced);
  } catch (error) {
    console.error("[SSO_POST_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể khởi tạo phiên SSO." },
      { status: 500 }
    );
  }
}
