import { NextResponse } from "next/server";
import { runZaloCommand } from "../../../../../lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Zalo Thật
 * Tối ưu hóa: Cache bộ nhớ đệm 5 phút (300.000ms) để tải trang tức thì (<50ms).
 * Sắp xếp chuẩn xác theo người nhắn tin gần nhất từ trên xuống dưới.
 */

let cachedConversations = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 300000; // 5 phút

function cleanTimeLabel(rawTime) {
  if (!rawTime || typeof rawTime !== "string") return "Gần đây";
  // Nếu có định dạng "HH:mm:ss DD/MM/YYYY" hoặc tương tự
  const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    return timeMatch[1]; // e.g. "00:46"
  }
  return rawTime.length > 10 ? rawTime.slice(0, 10) : rawTime;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const now = Date.now();

    // 1. Phục vụ ngay lập tức từ bộ nhớ đệm nếu chưa hết hạn và không ép tải lại
    if (!forceRefresh && cachedConversations && now - lastFetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        ok: true,
        cached: true,
        conversations: cachedConversations,
      });
    }

    // 2. Tải danh sách hội thoại gần nhất trực tiếp từ Zalo CLI
    const result = await runZaloCommand(["conv", "recent", "--json"], { timeout: 15000 });
    if (!result.ok || !result.data) {
      if (cachedConversations) {
        return NextResponse.json({ ok: true, cached: true, conversations: cachedConversations });
      }
      return NextResponse.json({ ok: true, conversations: [] });
    }

    const list = Array.isArray(result.data) ? result.data : [];

    // 3. Chuẩn hóa dữ liệu & giữ nguyên thứ tự tin nhắn mới nhất từ Zalo
    const formatted = list.map((item, index) => {
      const timeLabel = cleanTimeLabel(item.lastActive);
      return {
        id: item.threadId,
        name: item.name || "Khách Zalo",
        type: item.type === "Group" ? "GROUP" : "DIRECT",
        avatar: item.avatar || "",
        lastMessage: item.lastMessage || (item.type === "Group" ? `Nhóm ${item.memberCount || ""} thành viên` : "Tin nhắn gần đây"),
        lastActive: timeLabel,
        rawIndex: index, // Thứ tự sắp xếp gần nhất từ Zalo (0 là mới nhất)
        channel: "ZALO_PERSONAL",
        channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
      };
    });

    cachedConversations = formatted;
    lastFetchedAt = now;

    return NextResponse.json({ ok: true, cached: false, conversations: formatted });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    if (cachedConversations) {
      return NextResponse.json({ ok: true, cached: true, conversations: cachedConversations });
    }
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại Zalo." }, { status: 500 });
  }
}
