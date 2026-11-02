import crypto from "crypto";
import { createSessionToken, verifySessionToken, getStaffByIdOrCode } from "./auth.js";
import { buildDataScopeFilter } from "./rbac.js";

/**
 * Cầu nối Xác thực SSO/JWT giữa Next.js Portal (`portal/`) & Javis OS FastAPI (`server/`) (WBS-09)
 * Giúp dùng chung phiên đăng nhập duy nhất trên https://crm.addp.vn
 */

const SECRET = process.env.CRM_JWT_SECRET || "ADDP_CRM_DEFAULT_DEV_SECRET_2026";
const JAVIS_INTERNAL_URL = process.env.JAVIS_API_URL || "http://127.0.0.1:8000";

export function issueSsoBridgePayload(staffOrCode) {
  const staff =
    typeof staffOrCode === "string" || typeof staffOrCode === "number"
      ? getStaffByIdOrCode(staffOrCode)
      : staffOrCode;

  if (!staff) {
    return { ok: false, error: "Không tìm thấy thông tin nhân sự để cấp token SSO." };
  }

  const sessionToken = createSessionToken(staff);
  const nonce = crypto.randomBytes(12).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${staff.code}:${nonce}`)
    .digest("hex")
    .slice(0, 16);
  const wsTicket = `wst_${nonce}.${sig}`;

  return {
    ok: true,
    bridgeVersion: "addp-crm-sso-v1",
    domain: process.env.NEXT_PUBLIC_CRM_DOMAIN || "crm.addp.vn",
    javisGatewayUrl: JAVIS_INTERNAL_URL,
    sessionToken,
    wsTicket,
    staff: {
      id: staff.id,
      code: staff.code,
      name: staff.name,
      role: staff.role,
      roleLabel: staff.roleLabel,
      teamName: staff.teamName,
      dailyCareTarget: staff.dailyCareTarget,
      dailyMsgTarget: staff.dailyMsgTarget,
      allowedChannelAccountIds: staff.allowedChannelAccountIds || [],
    },
    rbacScopes: {
      customers: buildDataScopeFilter(staff, "customers"),
      conversations: buildDataScopeFilter(staff, "conversations"),
      orders: buildDataScopeFilter(staff, "orders"),
    },
  };
}

export async function syncSessionWithJavisFastApi(sessionToken) {
  const verified = verifySessionToken(sessionToken);
  if (!verified) {
    return { ok: false, error: "Token phiên đăng nhập không hợp lệ." };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${JAVIS_INTERNAL_URL}/api/crm/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: sessionToken }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const remoteData = await res.json();
      return {
        ok: true,
        mode: "LIVE_FASTAPI_BRIDGE",
        ...remoteData,
      };
    }
  } catch {
    // Fallback khi Javis FastAPI chưa bật ở cổng 8000 trong môi trường dev độc lập
  }

  const localPayload = issueSsoBridgePayload(verified.code || verified);
  return {
    ...localPayload,
    mode: "SHARED_HMAC_JWT_BRIDGE",
  };
}
