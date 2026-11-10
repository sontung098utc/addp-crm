import fs from "fs";
import path from "path";
import { getAllActiveZaloHomes, getActiveZaloHome } from "./zaloRunner.js";
import { getAllConversationTags } from "./tagStore.js";
import { getAllCustomers, maskPhoneMiddle } from "./customerIdentityResolver.js";

/**
 * ADDP CRM — Broadcast Real Audience Resolver
 * Trích xuất danh sách người nhận THỰC TẾ 100% từ:
 * 1. Danh bạ bạn bè & hội thoại Zalo Cá Nhân thật (crm-meta-cache.json + history.jsonl).
 * 2. Khách hàng đa kênh đã từng nhắn tin (omnichannel_messages.json + Facebook + Zalo OA).
 * 3. Bộ lọc Thẻ Tag thực tế (conversation_tags.json + customers.json).
 */

/**
 * Trích xuất danh sách bạn bè & liên hệ thực tế của tài khoản Zalo Cá Nhân
 */
export function getRealZaloFriends(preferredHomeDir = "") {
  const contactsMap = new Map();
  const threadTags = getAllConversationTags();

  // Xác định các thư mục Zalo cần quét
  const activeAccounts = getAllActiveZaloHomes();
  let homeDirs = [];
  if (preferredHomeDir) {
    homeDirs = [preferredHomeDir];
  } else if (activeAccounts.length > 0) {
    homeDirs = activeAccounts.map((a) => a.homeDir);
  } else {
    const fallback = getActiveZaloHome();
    if (fallback) homeDirs = [fallback];
  }

  // 1. Quét crm-meta-cache.json từ các thư mục Zalo
  for (const hDir of homeDirs) {
    const cachePath = path.join(hDir, ".zalo-agent-cli", "crm-meta-cache.json");
    if (fs.existsSync(cachePath)) {
      try {
        const raw = fs.readFileSync(cachePath, "utf8");
        const meta = JSON.parse(raw);
        if (Array.isArray(meta?.friends)) {
          for (const f of meta.friends) {
            if (!f?.userId) continue;
            const uid = String(f.userId);
            const fullName = f.displayName || f.zaloName || "Khách Zalo";
            const tags = Array.isArray(threadTags[uid]) ? [...threadTags[uid]] : [];
            if (!tags.includes("Bạn Bè Zalo")) tags.push("Bạn Bè Zalo");

            contactsMap.set(uid, {
              id: uid,
              fullName,
              name: fullName,
              phone: f.phoneNumber || "",
              maskedPhone: maskPhoneMiddle(f.phoneNumber || ""),
              zaloUid: uid,
              zaloThreadId: uid,
              channel: "ZALO_PERSONAL",
              channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
              avatar: f.avatar || "",
              tags,
              lastInteractionTime: meta.updatedAt ? new Date(meta.updatedAt).toISOString() : null,
              hasExistingThread: true,
              source: "ZALO_FRIENDS",
            });
          }
        }
      } catch (err) {
        console.error("[AUDIENCE_CACHE_ERR]", err.message);
      }
    }
  }

  // 2. Quét từ các file lịch sử tin nhắn thực tế (zalo_history_...jsonl & history.jsonl)
  const candidateHistoryFiles = [
    path.resolve(process.cwd(), "portal", "data", "zalo_history_1781287338457243967.jsonl"),
    path.resolve(process.cwd(), "data", "zalo_history_1781287338457243967.jsonl"),
    ...homeDirs.map((hd) => path.join(hd, ".zalo-agent-cli", "history.jsonl")),
    ...homeDirs.map((hd) => path.join(hd, ".zalo-agent-cli", "crm-group-history.jsonl")),
  ];

  for (const hFile of candidateHistoryFiles) {
    if (!fs.existsSync(hFile)) continue;
    try {
      const content = fs.readFileSync(hFile, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const msg = JSON.parse(trimmed);
        if (msg.threadType === "group") continue; // Không gửi broadcast vào nhóm

        const uid = String(msg.threadId || msg.senderId || "");
        if (!uid || uid === "1781287338457243967" || uid.length < 8) continue;

        const currentTags = Array.isArray(threadTags[uid]) ? [...threadTags[uid]] : [];
        const isSelf = Boolean(msg.isSelf);
        const contactName =
          !isSelf && msg.senderName && !/ADDP|Dược sĩ|Chuyên viên|Khách/i.test(msg.senderName)
            ? msg.senderName
            : null;

        if (!contactsMap.has(uid)) {
          const finalName = contactName || `Khách Zalo #${uid.slice(-4)}`;
          const tags = currentTags.length > 0 ? currentTags : ["Đã Từng Nhắn Tin Zalo"];
          contactsMap.set(uid, {
            id: uid,
            fullName: finalName,
            name: finalName,
            phone: "",
            maskedPhone: "",
            zaloUid: uid,
            zaloThreadId: uid,
            channel: "ZALO_PERSONAL",
            channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
            avatar: "",
            tags,
            lastInteractionTime: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
            hasExistingThread: true,
            source: "ZALO_HISTORY",
          });
        } else {
          const existing = contactsMap.get(uid);
          if (contactName && existing.fullName.startsWith("Khách Zalo #")) {
            existing.fullName = contactName;
            existing.name = contactName;
          }
          if (msg.timestamp) {
            const msgIso = new Date(msg.timestamp).toISOString();
            if (!existing.lastInteractionTime || msgIso > existing.lastInteractionTime) {
              existing.lastInteractionTime = msgIso;
            }
          }
          if (currentTags.length > 0) {
            for (const t of currentTags) {
              if (!existing.tags.includes(t)) existing.tags.push(t);
            }
          }
        }
      }
    } catch (err) {
      // bỏ qua dòng lỗi json
    }
  }

  return Array.from(contactsMap.values());
}

/**
 * Trích xuất toàn bộ khách hàng đã từng nhắn tin trên tất cả các kênh (Zalo, Messenger, Zalo OA)
 */
export function getAllInboxCustomers() {
  const customerMap = new Map();

  // 1. Nạp tất cả bạn bè & khách Zalo thật
  const zaloFriends = getRealZaloFriends();
  for (const zc of zaloFriends) {
    customerMap.set(`zalo_${zc.id}`, zc);
  }

  // 2. Nạp khách hàng từ omnichannel_messages.json
  const omnichannelCandidates = [
    path.resolve(process.cwd(), "portal", "data", "omnichannel_messages.json"),
    path.resolve(process.cwd(), "data", "omnichannel_messages.json"),
  ];
  for (const ocPath of omnichannelCandidates) {
    if (!fs.existsSync(ocPath)) continue;
    try {
      const raw = fs.readFileSync(ocPath, "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          const ch = String(item.channel || item.platform || "ZALO_PERSONAL").toUpperCase();
          const tid = String(item.threadId || item.senderId || item.id || "");
          if (!tid) continue;
          const key = `${ch}_${tid}`;
          if (!customerMap.has(key)) {
            const name = item.senderName || item.customerName || "Khách Hàng";
            customerMap.set(key, {
              id: tid,
              fullName: name,
              name,
              phone: item.phone || "",
              maskedPhone: maskPhoneMiddle(item.phone || ""),
              zaloUid: ch.includes("ZALO") ? tid : null,
              zaloThreadId: ch.includes("ZALO") ? tid : null,
              facebookId: ch.includes("FACEBOOK") ? tid : null,
              psid: ch.includes("FACEBOOK") ? tid : null,
              channel: ch,
              channelLabel:
                ch === "FACEBOOK"
                  ? "Fanpage FB Dược Phẩm ADDP"
                  : ch === "ZALO_OA"
                  ? "Zalo OA Dược Phẩm ADDP"
                  : "Zalo Cá Nhân (Sơn Tùng)",
              avatar: item.avatar || "",
              tags: Array.isArray(item.tags) ? item.tags : ["Khách Hộp Thư"],
              lastInteractionTime: item.timestamp
                ? new Date(item.timestamp).toISOString()
                : new Date().toISOString(),
              hasExistingThread: true,
              source: "OMNICHANNEL_INBOX",
            });
          }
        }
      }
    } catch {}
  }

  // 3. Nạp khách từ customers.json (nếu có khách tạo từ đơn hàng / lead)
  try {
    const crmCustomers = getAllCustomers();
    for (const cust of crmCustomers) {
      const phoneKey = cust.phone ? `phone_${cust.phone}` : `crm_${cust.id}`;
      if (!customerMap.has(phoneKey)) {
        customerMap.set(phoneKey, {
          id: cust.id,
          fullName: cust.fullName || cust.name || "Khách hàng",
          name: cust.fullName || cust.name || "Khách hàng",
          phone: cust.phone || "",
          maskedPhone: maskPhoneMiddle(cust.phone || ""),
          zaloUid: cust.zaloUid || null,
          zaloThreadId: cust.zaloThreadId || null,
          facebookId: cust.facebookId || cust.psid || null,
          channel: cust.channel || "ZALO_PERSONAL",
          avatar: cust.avatar || "",
          tags: Array.isArray(cust.tags) ? cust.tags : [],
          lastInteractionTime: cust.updatedAt || cust.createdAt || null,
          hasExistingThread: Boolean(cust.zaloUid || cust.facebookId),
          source: "CRM_CUSTOMER",
        });
      }
    }
  } catch {}

  return Array.from(customerMap.values());
}

/**
 * Phân giải đối tượng nhận tin theo các tiêu chí thực tế
 */
export function resolveBroadcastAudience({
  audienceSource = "ZALO_FRIENDS", // "ZALO_FRIENDS" | "ALL_INBOX" | "BY_TAG"
  includeTags = [],
  excludeTags = ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"],
  channel = "ALL",
  operator = "OR",
  targetAccount = "ALL",
} = {}) {
  let baseList = [];

  const normInclude = (Array.isArray(includeTags) ? includeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const normExclude = (Array.isArray(excludeTags) ? excludeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const op = String(operator || "OR").toUpperCase() === "AND" ? "AND" : "OR";

  if (audienceSource === "ZALO_FRIENDS") {
    // 1. Tệp: Tất cả bạn bè & khách Zalo thật
    baseList = getRealZaloFriends();
  } else if (audienceSource === "ALL_INBOX") {
    // 2. Tệp: Toàn bộ khách đã từng inbox Đa Kênh
    baseList = getAllInboxCustomers();
  } else {
    // 3. Tệp: Lọc theo Thẻ Tag
    baseList = getAllInboxCustomers();
  }

  const threadTags = getAllConversationTags();

  // Áp dụng bộ lọc
  const filtered = baseList.filter((cust) => {
    // Gộp thẻ từ bản ghi khách + thẻ từ conversation_tags.json
    const custId = String(cust.zaloUid || cust.id || "");
    const extraTags = Array.isArray(threadTags[custId]) ? threadTags[custId] : [];
    const combinedTags = Array.from(
      new Set([...(Array.isArray(cust.tags) ? cust.tags : []), ...extraTags])
    );
    const tagsLower = combinedTags.map((t) => String(t).trim().toLowerCase());

    // 1. Lọc loại trừ (Exclude Tags)
    if (normExclude.length > 0) {
      const hasExcluded = normExclude.some((ex) =>
        tagsLower.some((ct) => ct === ex || ct.includes(ex))
      );
      if (hasExcluded) return false;
    }

    // 2. Lọc kênh gửi (Channel)
    if (channel && channel !== "ALL") {
      const targetCh = String(channel).toUpperCase();
      const custCh = String(cust.channel || "ZALO_PERSONAL").toUpperCase();
      if (targetCh === "ZALO_PERSONAL" && !custCh.includes("ZALO")) return false;
      if (targetCh === "FACEBOOK" && !custCh.includes("FACEBOOK")) return false;
      if (targetCh === "ZALO_OA" && custCh !== "ZALO_OA") return false;
    }

    // 3. Nếu ở chế độ BY_TAG: Kiểm tra includeTags
    if (audienceSource === "BY_TAG" && normInclude.length > 0) {
      if (op === "AND") {
        const matchesAll = normInclude.every((inTag) =>
          tagsLower.some((ct) => ct === inTag || ct.includes(inTag))
        );
        if (!matchesAll) return false;
      } else {
        const matchesAny = normInclude.some((inTag) =>
          tagsLower.some((ct) => ct === inTag || ct.includes(inTag))
        );
        if (!matchesAny) return false;
      }
    }

    return true;
  });

  // Tính thống kê breakdown
  let zaloCount = 0;
  let messengerCount = 0;
  let zaloOaCount = 0;

  for (const c of filtered) {
    const ch = String(c.channel || "ZALO_PERSONAL").toUpperCase();
    if (ch.includes("ZALO") && ch !== "ZALO_OA") zaloCount += 1;
    else if (ch === "ZALO_OA") zaloOaCount += 1;
    else if (ch.includes("FACEBOOK")) messengerCount += 1;
    else zaloCount += 1;
  }

  // Tạo preview 10 khách
  const previewList = filtered.slice(0, 10).map((c) => ({
    id: c.id,
    fullName: c.fullName || c.name || "Khách Hàng",
    maskedPhone: c.maskedPhone || maskPhoneMiddle(c.phone || "") || (c.zaloUid ? `UID: ${c.zaloUid.slice(-4)}` : "Chưa có SĐT"),
    channel: c.channelLabel || c.channel || "Zalo Cá Nhân",
    tags: Array.isArray(c.tags) ? c.tags : [],
    lastInteractionTime: c.lastInteractionTime || "Vừa xong",
  }));

  return {
    totalCount: filtered.length,
    previewList,
    channelBreakdown: {
      zalo: zaloCount,
      messenger: messengerCount,
      zaloOa: zaloOaCount,
    },
    allMatched: filtered,
  };
}
