import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { guardApiRequest, filterChannelsForStaff } from "@/lib/rbac.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT } from "@/lib/pilotConfig.js";
import {
  ZALO_FRIEND_MSG_MAX_LEN,
  DEFAULT_MIN_DELAY_SEC,
  DEFAULT_MAX_DELAY_SEC,
  DEFAULT_DAILY_FRIEND_LIMIT,
  parseAndNormalizePhones,
  listConnectedZaloAccounts,
  createAutoFriendCampaign,
  controlAutoFriendCampaign,
  getAllAutoFriendCampaigns,
} from "@/lib/zaloAutoFriendEngine.js";

/**
 * ADDP CRM — API Tự động kết bạn Zalo cá nhân từ danh sách SĐT
 */

export async function GET() {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "zalo-auto-friend",
    });
    if (!guard.ok) return guard.response;

    const staff = guard.liveStaff || guard.staff;
    const allAccounts = listConnectedZaloAccounts();
    const allowedAccounts = filterChannelsForStaff(staff, allAccounts).map((acc) => ({
      id: acc.id,
      ownId: acc.ownId,
      name: acc.name,
      status: acc.status,
      sentToday: acc.sentToday || 0,
    }));

    const campaigns = getAllAutoFriendCampaigns();

    return NextResponse.json({
      ok: true,
      accounts: allowedAccounts,
      campaigns,
      antiBanRules: {
        minDelaySec: DEFAULT_MIN_DELAY_SEC,
        maxDelaySec: DEFAULT_MAX_DELAY_SEC,
        defaultDailyLimit: DEFAULT_DAILY_FRIEND_LIMIT,
        maxDailyLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT,
        maxMessageLength: ZALO_FRIEND_MSG_MAX_LEN,
        policy: `Điều 4 AGENTS.md: Giãn cách ngẫu nhiên ${DEFAULT_MIN_DELAY_SEC}–${DEFAULT_MAX_DELAY_SEC} giây/lượt, giới hạn tối đa ${DEFAULT_DAILY_ZALO_MSG_LIMIT} lượt/ngày/nick Zalo.`,
      },
    });
  } catch (error) {
    console.error("[GET /api/zalo/auto-friend]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi máy chủ khi tải dữ liệu kết bạn Zalo tự động." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "zalo-auto-friend",
    });
    if (!guard.ok) return guard.response;

    const staff = guard.liveStaff || guard.staff;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "parse-phones") {
      const input = body?.rawText ?? body?.phones ?? "";
      const result = parseAndNormalizePhones(input);
      return NextResponse.json({
        ok: true,
        ...result,
      });
    }

    if (action === "start" || action === "schedule") {
      const requestedIds = Array.isArray(body?.accountIds)
        ? body.accountIds.map((x) => String(x || "").trim()).filter(Boolean)
        : [];

      const allAccounts = listConnectedZaloAccounts();
      const allowedAccounts = filterChannelsForStaff(staff, allAccounts);

      const selectedAccounts = allowedAccounts.filter(
        (acc) =>
          requestedIds.includes(String(acc.id)) ||
          (acc.ownId && requestedIds.includes(String(acc.ownId)))
      );

      if (selectedAccounts.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Vui lòng chọn ít nhất 1 nick Zalo cá nhân hợp lệ và đang kết nối.",
          },
          { status: 400 }
        );
      }

      const created = createAutoFriendCampaign({
        name: body?.name,
        phones: body?.phones ?? body?.rawText ?? [],
        accounts: selectedAccounts,
        messageTemplate: body?.messageTemplate || "",
        minDelaySec: body?.minDelaySec,
        maxDelaySec: body?.maxDelaySec,
        dailyLimitPerAccount: body?.dailyLimitPerAccount,
        scheduledAt: action === "schedule" ? body?.scheduledAt : body?.scheduledAt || null,
        createdBy: staff,
        mockMode: Boolean(body?.mockMode),
      });

      if (!created.ok) {
        return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        campaign: created.campaign,
        message:
          created.campaign.status === "SCHEDULED"
            ? "Đã đặt lịch chiến dịch kết bạn Zalo tự động."
            : "Đã khởi chạy chiến dịch kết bạn Zalo tự động.",
      });
    }

    if (action === "pause" || action === "resume" || action === "cancel") {
      const id = String(body?.id || "").trim();
      if (!id) {
        return NextResponse.json({ ok: false, error: "Thiếu mã chiến dịch." }, { status: 400 });
      }
      const res = controlAutoFriendCampaign(id, action);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
      }
      return NextResponse.json({ ok: true, campaign: res.campaign });
    }

    return NextResponse.json(
      { ok: false, error: "Hành động không được hỗ trợ." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[POST /api/zalo/auto-friend]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi máy chủ khi xử lý yêu cầu kết bạn Zalo." },
      { status: 500 }
    );
  }
}
