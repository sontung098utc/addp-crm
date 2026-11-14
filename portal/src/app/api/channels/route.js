import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  PLATFORM_INFO,
  listAllChannels,
  createChannelAccount,
  updateChannelAccount,
  deleteChannelAccount,
} from "../../../lib/connectionHub.js";
import { syncBotStatesWithChannels } from "../../../lib/botControlStore.js";
import { guardApiRequest, filterChannelsForStaff } from "../../../lib/rbac.js";

/**
 * API Quản lý Đa Tài Khoản Kênh (ConnectionHub - WBS-11)
 * Lưu trữ mã hóa Token/Session của 7 nền tảng
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH", "KHO", "KE_TOAN"],
      moduleKey: "channels",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const channels = filterChannelsForStaff(guard.staff, listAllChannels());
    // Che giấu bí mật / token trong cấu hình kênh để client không đọc được plain secret
    const safeChannels = channels.map((ch) => {
      const cfg = ch.config ? { ...ch.config } : {};
      if (cfg.appSecret) cfg.appSecret = "[CONFIGURED]";
      if (cfg.clientSecret) cfg.clientSecret = "[CONFIGURED]";
      if (cfg.accessToken) cfg.accessToken = "[TOKEN_PROTECTED]";
      if (cfg.refreshToken) cfg.refreshToken = "[TOKEN_PROTECTED]";
      return {
        ...ch,
        config: cfg,
      };
    });

    return NextResponse.json({
      ok: true,
      platforms: PLATFORM_INFO,
      channels: safeChannels,
    });
  } catch (error) {
    console.error("[CHANNELS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi tải danh sách kênh kết nối." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "channels",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const result = createChannelAccount(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Đã thêm tài khoản kênh '${result.channel.name}' thành công!`,
      channel: result.channel,
    });
  } catch (error) {
    console.error("[CHANNELS_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Không thể thêm tài khoản kênh mới." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "channels",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "Thiếu mã tài khoản kênh." }, { status: 400 });
    }

    const result = updateChannelAccount(id, updates);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    try {
      syncBotStatesWithChannels();
    } catch {}

    return NextResponse.json({
      ok: true,
      message: `Đã cập nhật cấu hình tài khoản '${result.channel.name}' thành công!`,
      channel: result.channel,
    });
  } catch (error) {
    console.error("[CHANNELS_PUT_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi cập nhật kênh." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN"],
      moduleKey: "channels",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Thiếu ID kênh cần xóa." }, { status: 400 });
    }

    const result = deleteChannelAccount(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Đã xóa tài khoản kênh thành công.",
    });
  } catch (error) {
    console.error("[CHANNELS_DELETE_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xóa tài khoản kênh." },
      { status: 500 }
    );
  }
}
