import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  ensureAccountHistorySynced,
  getAllActiveZaloHomes,
  getActiveZaloHome,
} from "@/lib/zaloRunner.js";
import { guardApiRequest } from "@/lib/rbac.js";

/**
 * ADDP Omnichannel AI CRM — API Kích Hoạt Đồng Bộ Lịch Sử Zalo Tức Thì (Universal Manual & Initial Sync)
 * POST /api/channels/zalo/sync
 * Body: { homeDir?: string, accountId?: string }
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "channels",
    });
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    let body = {};
    try {
      body = await request.json();
    } catch {}

    const { homeDir, accountId } = body;

    if (homeDir) {
      const result = await ensureAccountHistorySynced(homeDir, accountId);
      return NextResponse.json({
        ok: result.ok,
        message: result.ok
          ? "Đã đồng bộ lịch sử hội thoại thành công!"
          : result.error || "Lỗi đồng bộ lịch sử.",
        state: result.state || null,
      });
    }

    // Nếu không truyền homeDir cụ thể -> đồng bộ cho tất cả tài khoản Zalo đang kết nối
    const accounts = getAllActiveZaloHomes();
    const targets =
      accounts.length > 0
        ? accounts
        : [{ homeDir: getActiveZaloHome(), ownId: "1781287338457243967" }];

    const results = await Promise.all(
      targets.map(async (acc) => {
        const res = await ensureAccountHistorySynced(acc.homeDir, acc.ownId);
        return {
          accountId: acc.ownId || acc.accountId,
          displayName: acc.displayName || acc.name,
          ...res,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      message: `Đã kích hoạt đồng bộ lịch sử cho ${results.length} tài khoản Zalo!`,
      results,
    });
  } catch (error) {
    console.error("[ZALO_SYNC_ROUTE_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi máy chủ khi đồng bộ lịch sử Zalo." },
      { status: 500 }
    );
  }
}
