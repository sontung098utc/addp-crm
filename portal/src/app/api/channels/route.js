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
import { guardApiRequest } from "../../../lib/rbac.js";

/**
 * API Quản lý Đa Tài Khoản Kênh (ConnectionHub - WBS-11)
 * Lưu trữ mã hóa Token/Session của 7 nền tảng
 */

export async function GET() {
  try {
    const channels = listAllChannels();
    return NextResponse.json({
      ok: true,
      platforms: PLATFORM_INFO,
      channels,
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
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
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
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
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
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
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
