import { NextResponse } from "next/server";
import { runZaloCommand, getActiveZaloHome } from "../../../../../lib/zaloRunner.js";
import fs from "fs";
import path from "path";
import readline from "readline";

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Zalo Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Không dùng số liệu giả, 100% dữ liệu lấy từ Zalo Client & history.jsonl.
 * Sắp xếp chuẩn xác theo người nhắn tin gần nhất từ trên xuống dưới.
 */

// Bộ nhớ cache danh bạ bạn bè & nhóm để không phải gọi CLI liên tục (5 phút)
let cachedFriendsMap = null;
let cachedGroupsMap = null;
let lastMetaFetchedAt = 0;
const META_CACHE_TTL_MS = 300000; // 5 phút

/**
 * Lấy danh bạ bạn bè và nhóm từ Zalo (có cache bộ nhớ đệm)
 */
async function getFriendsAndGroups(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedFriendsMap &&
    cachedGroupsMap &&
    now - lastMetaFetchedAt < META_CACHE_TTL_MS
  ) {
    return { friendMap: cachedFriendsMap, groupMap: cachedGroupsMap };
  }

  const [fRes, gRes] = await Promise.all([
    runZaloCommand(["friend", "list", "--json"], { timeout: 15000 }),
    runZaloCommand(["group", "list", "--json"], { timeout: 15000 }),
  ]);

  const friendMap = new Map();
  if (fRes.ok && Array.isArray(fRes.data)) {
    for (const f of fRes.data) {
      friendMap.set(String(f.userId), f);
    }
  }

  const groupMap = new Map();
  if (gRes.ok && Array.isArray(gRes.data)) {
    for (const g of gRes.data) {
      groupMap.set(String(g.threadId), g);
    }
  }

  cachedFriendsMap = friendMap;
  cachedGroupsMap = groupMap;
  lastMetaFetchedAt = now;

  return { friendMap, groupMap };
}

/**
 * Đọc toàn bộ luồng tin nhắn thời gian thực từ history.jsonl
 * Lấy tin nhắn mới nhất cho từng threadId
 */
async function getLatestThreadsFromHistory(zaloHome) {
  const historyPath = path.join(zaloHome, ".zalo-agent-cli", "history.jsonl");
  const threadsMap = new Map();

  if (!fs.existsSync(historyPath)) {
    return threadsMap;
  }

  try {
    const fileStream = fs.createReadStream(historyPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        const tid = String(msg.threadId);
        const ts = Number(msg.timestamp) || 0;
        const existing = threadsMap.get(tid);

        if (!existing || ts >= existing.timestamp) {
          threadsMap.set(tid, {
            threadId: tid,
            threadType: msg.threadType || (msg.isGroup ? "group" : "dm"),
            senderName: msg.senderName || "",
            senderId: msg.senderId || "",
            isSelf: Boolean(msg.isSelf),
            text: msg.text || (msg.type === "chat.photo" ? "[Hình ảnh]" : "[Tin nhắn]"),
            type: msg.type || "text",
            timestamp: ts,
          });
        }
      } catch {}
    }
  } catch (err) {
    console.error("[ZALO_HISTORY_READ_ERROR]", err);
  }

  return threadsMap;
}

/**
 * Format thời gian hiển thị: Hôm nay (HH:mm), Hôm qua, hoặc DD/MM
 */
function formatTimeLabel(timestamp) {
  if (!timestamp) return "Gần đây";
  const date = new Date(timestamp);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${mins}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Hôm qua";

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const targetHome = getActiveZaloHome();

    // 1. Đọc đồng thời: Tin nhắn mới nhất từ history.jsonl & Danh bạ
    const [threadsMap, { friendMap, groupMap }] = await Promise.all([
      getLatestThreadsFromHistory(targetHome),
      getFriendsAndGroups(forceRefresh),
    ]);

    // 2. Sắp xếp các cuộc trò chuyện có tin nhắn thực tế giảm dần theo thời gian (mới nhất lên đầu)
    const activeThreads = Array.from(threadsMap.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );

    const conversations = [];
    const processedIds = new Set();

    for (const thread of activeThreads) {
      processedIds.add(thread.threadId);
      const isGroup = thread.threadType === "group" || groupMap.has(thread.threadId);
      let name = "";
      let avatar = "";
      let memberCount = 0;
      let phone = "";

      if (isGroup) {
        const g = groupMap.get(thread.threadId);
        name = g?.name || `Nhóm Zalo (${thread.threadId.slice(-4)})`;
        memberCount = g?.memberCount || 0;
      } else {
        const f = friendMap.get(thread.threadId);
        if (f) {
          name = f.displayName || f.zaloName || "Khách Zalo";
          avatar = f.avatar || "";
          phone = f.phoneNumber || "";
        } else if (thread.isSelf) {
          name = "Cloud của tôi (My Documents)";
        } else {
          name = thread.senderName || "Khách Zalo";
        }
      }

      // Tạo nội dung tóm tắt hiển thị
      let snippet = thread.text;
      if (thread.isSelf) {
        snippet = `Bạn: ${thread.text}`;
      } else if (isGroup && thread.senderName) {
        snippet = `${thread.senderName}: ${thread.text}`;
      }

      conversations.push({
        id: thread.threadId,
        name,
        type: isGroup ? "GROUP" : "DIRECT",
        avatar,
        phone,
        memberCount,
        lastMessage: snippet || "[Tin nhắn]",
        lastActive: formatTimeLabel(thread.timestamp),
        timestamp: thread.timestamp,
        channel: "ZALO_PERSONAL",
        channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
      });
    }

    // 3. Bổ sung các nhóm & bạn bè còn lại trong danh bạ chưa phát sinh tin nhắn mới gần đây
    for (const [gid, g] of groupMap.entries()) {
      if (!processedIds.has(gid)) {
        processedIds.add(gid);
        conversations.push({
          id: gid,
          name: g.name || "Nhóm Zalo",
          type: "GROUP",
          avatar: "",
          memberCount: g.memberCount || 0,
          lastMessage: `Nhóm ${g.memberCount || 0} thành viên`,
          lastActive: "Danh bạ",
          timestamp: 0,
          channel: "ZALO_PERSONAL",
          channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
        });
      }
    }

    for (const [uid, f] of friendMap.entries()) {
      if (!processedIds.has(uid)) {
        processedIds.add(uid);
        conversations.push({
          id: uid,
          name: f.displayName || f.zaloName || "Bạn bè",
          type: "DIRECT",
          avatar: f.avatar || "",
          phone: f.phoneNumber || "",
          lastMessage: "Chưa có tin nhắn mới",
          lastActive: "Danh bạ",
          timestamp: 0,
          channel: "ZALO_PERSONAL",
          channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: conversations.length,
      activeCount: activeThreads.length,
      conversations,
    });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại Zalo." }, { status: 500 });
  }
}
