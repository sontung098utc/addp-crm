import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Zalo Direct HTTP Sync Worker
 * Đồng bộ tức thì Danh bạ (Friends), Nhóm (Groups + Avatar), Hội thoại Ghim (Pinned)
 * và Lịch sử tin nhắn Nhóm mới nhất qua HTTP REST (không dùng WebSocket, không gây lỗi 3000).
 */

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const forceFull = process.env.FORCE_FULL_SYNC === "1";

  if (!javisRoot || !homeDir) {
    console.error("Missing JAVIS_ZALO_ROOT or HOME");
    process.exit(1);
  }

  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  fs.mkdirSync(cliDir, { recursive: true });

  const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
  const normUrl = pathToFileURL(path.join(javisRoot, "src", "mcp", "message-normalize.js")).href;

  const { autoLogin, getApi, getOwnId, isLoggedIn } = await import(clientUrl);
  const { toHistoryMessage } = await import(normUrl);

  await autoLogin(true);
  if (!isLoggedIn()) {
    console.log(JSON.stringify({ ok: false, error: "Not logged in" }));
    process.exit(0);
  }

  const api = getApi();
  const ownId = String(getOwnId() || "");

  const metaCachePath = path.join(cliDir, "crm-meta-cache.json");
  let prevCache = null;
  if (fs.existsSync(metaCachePath)) {
    try {
      prevCache = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
    } catch {}
  }
  const prevGroupVersions = prevCache?.groupVersions || {};

  // 0. Đọc tên tài khoản Zalo từ accounts.json hoặc prevCache
  let ownAccountName = prevCache?.accountName || "";
  const accountsPath = path.join(cliDir, "accounts.json");
  if (fs.existsSync(accountsPath)) {
    try {
      const accList = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
      if (Array.isArray(accList) && accList.length > 0) {
        const active = accList.find((a) => a.active) || accList[0];
        if (active?.name || active?.displayName) {
          ownAccountName = String(active.name || active.displayName);
        }
      }
    } catch {}
  }

  // 1. Tải song song Friends, Groups, Pinned Conversations, Account Info qua HTTP REST
  const [friendsRes, groupsRes, pinRes, selfInfoRes] = await Promise.allSettled([
    api.getAllFriends(),
    api.getAllGroups(),
    typeof api.getPinConversations === "function" ? api.getPinConversations() : Promise.resolve([]),
    typeof api.fetchAccountInfo === "function"
      ? api.fetchAccountInfo()
      : ownId && typeof api.getUserInfo === "function"
      ? api.getUserInfo(ownId)
      : Promise.resolve(null),
  ]);

  if (selfInfoRes.status === "fulfilled" && selfInfoRes.value) {
    const val = selfInfoRes.value;
    const profile =
      val?.profile ||
      (ownId && val?.changed_profiles?.[ownId]) ||
      Object.values(val?.changed_profiles || {})[0] ||
      val;
    const fetchedName = profile?.displayName || profile?.zaloName || profile?.name || "";
    if (fetchedName && (!ownAccountName || /^addp zalo/i.test(ownAccountName))) {
      ownAccountName = String(fetchedName);
    }
  }

  if (!ownAccountName) {
    ownAccountName = ownId === "1781287338457243967" ? "Sơn Tùng" : "Chuyên viên Zalo";
  }

  const friends = [];
  const userNamesMap = new Map();
  if (ownId) {
    userNamesMap.set(ownId, ownAccountName);
  }

  if (friendsRes.status === "fulfilled" && friendsRes.value) {
    const rawFriends = Array.isArray(friendsRes.value)
      ? friendsRes.value
      : Object.values(friendsRes.value?.changed_profiles || {});
    for (const f of rawFriends) {
      if (!f || !f.userId) continue;
      const uid = String(f.userId);
      const name = f.displayName || f.zaloName || "Khách Zalo";
      userNamesMap.set(uid, name);
      friends.push({
        userId: uid,
        displayName: f.displayName || "",
        zaloName: f.zaloName || "",
        avatar: f.avatar || "",
        phoneNumber: f.phoneNumber || "",
      });
    }
  } else if (Array.isArray(prevCache?.friends)) {
    for (const f of prevCache.friends) {
      friends.push(f);
      if (f.userId) userNamesMap.set(String(f.userId), f.displayName || f.zaloName || "Khách Zalo");
    }
  }

  // 2. Xử lý danh sách hội thoại ghim (Pinned Conversations)
  const pinnedIds = [];
  if (pinRes.status === "fulfilled" && pinRes.value) {
    const val = pinRes.value;
    const rawPins = Array.isArray(val)
      ? val
      : Array.isArray(val?.conversations)
      ? val.conversations
      : Array.isArray(val?.data)
      ? val.data
      : [];
    for (const p of rawPins) {
      const id = typeof p === "string" || typeof p === "number" ? String(p) : String(p?.id || p?.threadId || "");
      if (id) pinnedIds.push(id);
    }
  } else if (Array.isArray(prevCache?.pinnedIds)) {
    pinnedIds.push(...prevCache.pinnedIds);
  }

  // 3. Tải thông tin chi tiết các nhóm (Tên nhóm, Số thành viên, Avatar nhóm, Thành viên)
  const gridVerMap =
    groupsRes.status === "fulfilled" && groupsRes.value?.gridVerMap ? groupsRes.value.gridVerMap : {};
  const groupIds = Object.keys(gridVerMap);
  const groups = [];

  const batchSize = 50;
  for (let i = 0; i < groupIds.length; i += batchSize) {
    const batch = groupIds.slice(i, i + batchSize);
    try {
      const gInfo = await api.getGroupInfo(batch);
      const map = gInfo?.gridInfoMap || {};
      for (const [gid, g] of Object.entries(map)) {
        if (Array.isArray(g.currentMems)) {
          for (const m of g.currentMems) {
            if (m?.id && (m.dName || m.zaloName)) {
              userNamesMap.set(String(m.id), m.dName || m.zaloName);
            }
          }
        }
        groups.push({
          threadId: String(gid),
          name: g.name || `Nhóm Zalo (${String(gid).slice(-4)})`,
          memberCount: g.totalMember || (Array.isArray(g.memberIds) ? g.memberIds.length : 0),
          avatar: g.avt || g.fullAvt || "",
          version: String(gridVerMap[gid] || g.version || ""),
        });
      }
    } catch {}
  }

  // 4. Đồng bộ tin nhắn mới nhất của các nhóm qua HTTP GET (getGroupChatHistory)
  const groupHistoryPath = path.join(cliDir, "crm-group-history.jsonl");
  const mainHistoryPath = path.join(cliDir, "history.jsonl");
  const seenMsgIds = new Set();
  const threadsWithHistory = new Set();

  for (const hp of [mainHistoryPath, groupHistoryPath]) {
    if (fs.existsSync(hp)) {
      try {
        const lines = fs.readFileSync(hp, "utf8").split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed?.msgId) seenMsgIds.add(String(parsed.msgId));
            if (parsed?.threadId) threadsWithHistory.add(String(parsed.threadId));
          } catch {}
        }
      } catch {}
    }
  }

  // Chỉ gọi getGroupChatHistory cho những nhóm có version mới, chưa có lịch sử, hoặc khi forceFull
  const groupsToSync = groups.filter((g) => {
    if (forceFull) return true;
    if (!threadsWithHistory.has(g.threadId)) return true;
    if (!prevGroupVersions[g.threadId] || prevGroupVersions[g.threadId] !== g.version) return true;
    return false;
  });

  const newGroupMessages = [];
  const historyBatchSize = 12;
  for (let i = 0; i < groupsToSync.length; i += historyBatchSize) {
    const gBatch = groupsToSync.slice(i, i + historyBatchSize);
    await Promise.allSettled(
      gBatch.map(async (g) => {
        try {
          const hist = await api.getGroupChatHistory(g.threadId, 20);
          const msgs = Array.isArray(hist?.groupMsgs) ? hist.groupMsgs : [];
          for (const rawMsg of msgs) {
            const hm = toHistoryMessage(rawMsg);
            if (!hm || !hm.msgId) continue;
            const msgIdStr = String(hm.msgId);
            if (seenMsgIds.has(msgIdStr)) continue;
            seenMsgIds.add(msgIdStr);

            let rawTs = Number(hm.timestamp) || Date.now();
            const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;

            const senderId = String(hm.senderId || rawMsg?.data?.uidFrom || "");
            const isSelf = Boolean(hm.isSelf || senderId === "0" || (ownId && senderId === ownId));
            const senderName =
              hm.senderName ||
              rawMsg?.data?.dName ||
              userNamesMap.get(senderId) ||
              (isSelf ? ownAccountName : "Thành viên");

            newGroupMessages.push({
              ...hm,
              msgId: msgIdStr,
              threadId: String(g.threadId),
              threadType: "group",
              senderId: isSelf && ownId ? ownId : senderId,
              senderName,
              isSelf,
              timestamp: ts,
            });
          }
        } catch {}
      })
    );
  }

  if (newGroupMessages.length > 0) {
    newGroupMessages.sort((a, b) => a.timestamp - b.timestamp);
    const linesToAppend = newGroupMessages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.appendFileSync(groupHistoryPath, linesToAppend, "utf8");
  }

  const newGroupVersions = {};
  for (const g of groups) {
    newGroupVersions[g.threadId] = g.version;
  }

  // Lưu cache metadata hoàn chỉnh
  const metaPayload = {
    ownId,
    accountName: ownAccountName,
    friends,
    groups,
    pinnedIds,
    groupVersions: newGroupVersions,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(metaCachePath, JSON.stringify(metaPayload), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      ownId,
      friendsCount: friends.length,
      groupsCount: groups.length,
      syncedGroupsCount: groupsToSync.length,
      pinnedCount: pinnedIds.length,
      newGroupMessagesCount: newGroupMessages.length,
    })
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[ZALO_DIRECT_SYNC_ERR]", err.message);
  process.exit(1);
});
