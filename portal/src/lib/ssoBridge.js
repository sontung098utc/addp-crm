import crypto from "crypto";
import { createSessionToken, verifySessionToken, getStaffByIdOrCode } from "./auth.js";
import { buildDataScopeFilter } from "./rbac.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT } from "./pilotConfig.js";

/**
 * Cầu nối Xác thực SSO/JWT giữa Next.js Portal (`portal/`) & Javis OS FastAPI (`server/`) (WBS-09)
 * Giúp dùng chung phiên đăng nhập duy nhất trên https://crm.addp.vn
 */

const JAVIS_INTERNAL_URL = process.env.JAVIS_API_URL || "http://127.0.0.1:7777";

export function issueSsoBridgePayload(staffOrCode) {
  const secret = process.env.CRM_JWT_SECRET;
  if (!secret) {
    return {
      ok: false,
      error: "[SECURITY_CONFIG_ERROR] CRM_JWT_SECRET chưa được cấu hình trong biến môi trường (Fail closed).",
    };
  }

  const staff =
    typeof staffOrCode === "string" || typeof staffOrCode === "number"
      ? getStaffByIdOrCode(staffOrCode)
      : staffOrCode;

  if (!staff) {
    return { ok: false, error: "Không tìm thấy thông tin nhân sự để cấp token SSO." };
  }

  const safeUser = staff || {
    id: "ADMIN",
    code: "ADMIN",
    name: "Quản Trị Viên ADDP",
    role: "ADMIN",
  };
  const sessionToken = createSessionToken(safeUser);
  const nonce = crypto.randomBytes(12).toString("base64url");
  const staffCode = safeUser?.code || safeUser?.id || safeUser?.staffId || "ADMIN";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${staffCode}:${nonce}`)
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
      id: safeUser?.id || safeUser?.staffId || "ADMIN",
      code: staffCode,
      name: safeUser?.name || "Quản Trị Viên ADDP",
      role: safeUser?.role || "ADMIN",
      roleLabel: safeUser?.roleLabel || "Quản trị viên (Toàn quyền)",
      teamName: safeUser?.teamName || "Ban Giám Đốc",
      dailyCareTarget: safeUser?.dailyCareTarget ?? 0,
      dailyMsgTarget: safeUser?.dailyMsgTarget ?? DEFAULT_DAILY_ZALO_MSG_LIMIT,
      allowedChannelAccountIds: safeUser?.allowedChannelAccountIds || [],
    },
    rbacScopes: {
      customers: buildDataScopeFilter(safeUser, "customers"),
      conversations: buildDataScopeFilter(safeUser, "conversations"),
      orders: buildDataScopeFilter(safeUser, "orders"),
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
