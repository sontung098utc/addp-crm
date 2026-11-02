import { NextResponse } from "next/server";
import { runZaloCommand } from "../../../../../lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Zalo Thật (Tốc độ cao)
 */

let cachedConversations = null;
let lastFetchedAt = 0;

export async function GET() {
  try {
    const now = Date.now();
    // Cache 10s để tải trang tức thì
    if (cachedConversations && now - lastFetchedAt < 10000) {
      return NextResponse.json({ ok: true, cached: true, conversations: cachedConversations });
    }

    const result = await runZaloCommand(["conv", "recent", "--json"], { timeout: 10000 });
    if (!result.ok || !result.data) {
      return NextResponse.json({ ok: true, conversations: cachedConversations || [] });
    }

    const list = Array.isArray(result.data) ? result.data : [];
    const formatted = list.map((item) => ({
      id: item.threadId,
      name: item.name || "Khách Zalo",
      type: item.type === "Group" ? "GROUP" : "DIRECT",
      avatar: item.avatar || "",
      lastMessage: item.lastMessage || item.type || "Đã kết nối",
      lastActive: item.lastActive || "Gần đây",
      channel: "ZALO_PERSONAL",
      channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
    }));

    cachedConversations = formatted;
    lastFetchedAt = now;

    return NextResponse.json({ ok: true, conversations: formatted });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại." }, { status: 500 });
  }
}
