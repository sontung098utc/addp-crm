import { NextResponse } from "next/server";
import { runZaloCommand, getActiveZaloHome } from "../../../../../lib/zaloRunner.js";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Lịch Sử Tin Nhắn Zalo Thật (Tốc độ cao)
 */

function getOwnerId(homeDir) {
  try {
    const accPath = path.join(homeDir, ".zalo-agent-cli", "accounts.json");
    if (fs.existsSync(accPath)) {
      const list = JSON.parse(fs.readFileSync(accPath, "utf8"));
      const active = Array.isArray(list) ? list.find((a) => a.active) || list[0] : null;
      return active?.ownId || "1781287338457243967";
    }
  } catch {}
  return "1781287338457243967";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json({ error: "Thiếu tham số threadId." }, { status: 400 });
    }

    const targetHome = getActiveZaloHome();
    const ownerId = getOwnerId(targetHome);

    const result = await runZaloCommand(["msg", "history", threadId, "--json"], {
      homeDir: targetHome,
      timeout: 10000,
    });

    if (!result.ok || !result.data) {
      return NextResponse.json({ ok: true, threadId, messages: [] });
    }

    const rawMessages = Array.isArray(result.data.messages) ? result.data.messages : [];
    const formatted = rawMessages.map((m) => {
      const isMe = String(m.senderId) === String(ownerId) || m.isMe === true;
      return {
        id: m.msgId || String(Date.now()),
        text: m.text || (m.type === "image" ? "[Hình ảnh]" : "[Tin nhắn]"),
        senderId: m.senderId,
        senderName: m.senderName || (isMe ? "Sơn Tùng" : "Khách"),
        isMe,
        timestamp: m.timestamp || Date.now(),
        time: new Date(m.timestamp || Date.now()).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: new Date(m.timestamp || Date.now()).toLocaleDateString("vi-VN"),
        type: m.type || "text",
      };
    });

    return NextResponse.json({ ok: true, threadId, messages: formatted });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
