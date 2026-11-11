import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Zalo Deep History & Metadata Sync Worker
 * Đồng bộ tối đa toàn bộ dữ liệu thật của tài khoản Zalo Cá Nhân:
 * 1. Danh bạ bạn bè (kèm lastActionTime, SĐT, Avatar), Nhóm (Avatar, Thành viên), Hội thoại Ghim / Lưu trữ / Chưa đọc.
 * 2. Deep WebSocket Cloud Backfill (cmd 510 DM & cmd 511 Group, tối đa 150 trang/loại) khi RUN_WS_BACKFILL=1.
 * 3. HTTP REST Group Chat History (50 tin gần nhất/nhóm) theo từng batch an toàn, ghi tăng dần vào JSONL.
 */

const MAX_WS_PAGES = 150;
const WS_PAGE_TIMEOUT_MS = 12000;
const GROUP_HISTORY_COUNT = 50;
const GROUP_BATCH_SIZE = 6;
const GROUP_CALL_TIMEOUT_MS = 8500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTs(raw, fallback = 0) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num > 2e12 ? Math.floor(num / 1000) : num < 1e11 ? num * 1000 : num;
}

function writeProgress(progressPath, data) {
  try {
    const tmp = `${progressPath}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ ...data, pid: process.pid, updatedAt: Date.now() }, null, 2),
      "utf8"
    );
    fs.renameSync(tmp, progressPath);
  } catch {}
}

function normalizeRawZaloMessage(rawMsg, toHistoryMessage, ownId, ownAccountName, userNamesMap, seenMsgIds) {
  const hm = toHistoryMessage(rawMsg, 0);
  if (!hm || !hm.msgId) return null;

  const msgIdStr = String(hm.msgId);
  if (seenMsgIds.has(msgIdStr)) return null;

  const ts = normalizeTs(hm.timestamp, 0);
  const rawSenderId = String(hm.senderId || rawMsg?.data?.uidFrom || "");
  const isSelf = Boolean(hm.isSelf || rawSenderId === "0" || (ownId && rawSenderId === ownId));
  const effectiveSenderId = isSelf && ownId ? ownId : rawSenderId;
  const senderName =
    hm.senderName ||
    rawMsg?.data?.dName ||
    userNamesMap.get(effectiveSenderId) ||
    (isSelf ? ownAccountName : hm.threadType === "group" ? "Thành viên" : "Khách Zalo");

  seenMsgIds.add(msgIdStr);
  return {
    ...hm,
    msgId: msgIdStr,
    threadId: String(hm.threadId || ""),
    threadType: hm.threadType || (rawMsg?.type === 1 ? "group" : "dm"),
    senderId: effectiveSenderId,
    senderName,
    isSelf,
    isBackfill: true,
    timestamp: ts,
  };
}

function appendJsonl(filePath, items) {
  if (!items || items.length === 0) return;
  const lines = items.map((m) => JSON.stringify(m)).join("\n") + "\n";
  fs.appendFileSync(filePath, lines, "utf8");
}

async function runWebSocketBackfill({
  api,
  toHistoryMessage,
  mainHistoryPath,
  seenMsgIds,
  ownId,
  ownAccountName,
  userNamesMap,
  progress,
  progressPath,
}) {
  let dmBackfilled = 0;
  let groupBackfilled = 0;
  let closedEarly = false;

  if (!api?.listener) {
    return { dmBackfilled, groupBackfilled, wsError: "Listener unavailable" };
  }

  let cipherResolve = null;
  let hasCipherOrReady = false;
  const readyPromise = new Promise((resolve) => {
    cipherResolve = resolve;
  });

  const liveOfflineQueue = [];
  const onMessage = (rawMsg) => {
    const normalized = normalizeRawZaloMessage(
      rawMsg,
      toHistoryMessage,
      ownId,
      ownAccountName,
      userNamesMap,
      seenMsgIds
    );
    if (normalized && normalized.threadId) {
      liveOfflineQueue.push(normalized);
    }
  };
  const onCipherKey = () => {
    hasCipherOrReady = true;
    cipherResolve?.(true);
  };
  const onConnected = () => {
    setTimeout(() => {
      if (!hasCipherOrReady) {
        hasCipherOrReady = true;
        cipherResolve?.(true);
      }
    }, 1200);
  };
  const onClosed = (code) => {
    closedEarly = true;
    if (code === 3000) {
      progress.errors.push("Phát hiện phiên Web Zalo khác đang mở (code 3000) trong lúc kéo lịch sử.");
    }
    cipherResolve?.(false);
  };
  const onError = () => {};

  api.listener.on("message", onMessage);
  api.listener.on("cipher_key", onCipherKey);
  api.listener.on("connected", onConnected);
  api.listener.on("closed", onClosed);
  api.listener.on("error", onError);

  try {
    api.listener.start({ retryOnClose: false });

    const ready = await Promise.race([
      readyPromise,
      sleep(7000).then(() => !closedEarly),
    ]);

    if (!ready || closedEarly) {
      return { dmBackfilled, groupBackfilled, wsError: "WebSocket chưa sẵn sàng hoặc bị đóng sớm" };
    }

    async function pullThreadType(threadType, label) {
      let cursor = null;
      let total = 0;
      let pages = 0;

      for (let page = 0; page < MAX_WS_PAGES; page++) {
        if (closedEarly) break;

        let batch = null;
        for (let attempt = 0; attempt < 2 && batch === null && !closedEarly; attempt++) {
          batch = await new Promise((resolve) => {
            let done = false;
            const cleanup = () => {
              clearTimeout(timer);
              api.listener.removeListener("old_messages", onOld);
              api.listener.removeListener("closed", onCloseWait);
            };
            const onOld = (messages, type) => {
              if (type !== threadType || done) return;
              done = true;
              cleanup();
              resolve(Array.isArray(messages) ? messages : []);
            };
            const onCloseWait = () => {
              if (done) return;
              done = true;
              cleanup();
              resolve(null);
            };
            const timer = setTimeout(() => {
              if (done) return;
              done = true;
              cleanup();
              resolve(null);
            }, WS_PAGE_TIMEOUT_MS);

            api.listener.on("old_messages", onOld);
            api.listener.once("closed", onCloseWait);
            try {
              api.listener.requestOldMessages(threadType, cursor);
            } catch {
              if (!done) {
                done = true;
                cleanup();
                resolve(null);
              }
            }
          });
          if (batch === null && attempt === 0 && !closedEarly) {
            await sleep(400);
          }
        }

        if (!batch || batch.length === 0) break;
        pages++;

        const normalizedBatch = [];
        for (const raw of batch) {
          const item = normalizeRawZaloMessage(
            raw,
            toHistoryMessage,
            ownId,
            ownAccountName,
            userNamesMap,
            seenMsgIds
          );
          if (item && item.threadId) {
            normalizedBatch.push(item);
          }
        }

        if (normalizedBatch.length > 0) {
          normalizedBatch.sort((a, b) => a.timestamp - b.timestamp);
          appendJsonl(mainHistoryPath, normalizedBatch);
          total += normalizedBatch.length;
        }

        progress.phase = `ws_${label}`;
        if (threadType === 0) {
          progress.dmBackfilled = total;
          progress.dmPages = pages;
        } else {
          progress.groupBackfilled = total;
          progress.groupPages = pages;
        }
        writeProgress(progressPath, progress);

        const last = batch[batch.length - 1];
        const nextId = last?.data?.actionId || last?.data?.msgId;
        if (!nextId || String(nextId) === String(cursor)) break;
        cursor = nextId;

        await sleep(120);
      }

      return total;
    }

    progress.phase = "ws_dm";
    writeProgress(progressPath, progress);
    dmBackfilled = await pullThreadType(0, "dm");

    if (!closedEarly) {
      progress.phase = "ws_group";
      writeProgress(progressPath, progress);
      groupBackfilled = await pullThreadType(1, "group");
    }

    // Đợi thêm 600ms xem có tin nhắn push nào chưa flush
    await sleep(600);
    if (liveOfflineQueue.length > 0) {
      liveOfflineQueue.sort((a, b) => a.timestamp - b.timestamp);
      appendJsonl(mainHistoryPath, liveOfflineQueue);
      for (const m of liveOfflineQueue) {
        if (m.threadType === "group") groupBackfilled++;
        else dmBackfilled++;
      }
    }

    return { dmBackfilled, groupBackfilled };
  } finally {
    api.listener.removeListener("message", onMessage);
    api.listener.removeListener("cipher_key", onCipherKey);
    api.listener.removeListener("connected", onConnected);
    api.listener.removeListener("closed", onClosed);
    api.listener.removeListener("error", onError);
    try {
      api.listener.stop();
    } catch {}
  }
}

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT;
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const forceFull = process.env.FORCE_FULL_SYNC === "1";
  const runWsBackfill = process.env.RUN_WS_BACKFILL === "1";

  if (!javisRoot || !homeDir) {
    console.error("Missing JAVIS_ZALO_ROOT or HOME");
    process.exit(1);
  }

  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  fs.mkdirSync(cliDir, { recursive: true });
  const progressPath = path.join(cliDir, ".crm-sync-progress.json");

  const progress = {
    status: "syncing",
    phase: "login",
    startedAt: Date.now(),
    friendsCount: 0,
    groupsCount: 0,
    dmBackfilled: 0,
    groupBackfilled: 0,
    groupRestFetched: 0,
    errors: [],
  };
  writeProgress(progressPath, progress);

  try {
    const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
    const normUrl = pathToFileURL(path.join(javisRoot, "src", "mcp", "message-normalize.js")).href;

    const { autoLogin, getApi, getOwnId, isLoggedIn, setSelfListen } = await import(clientUrl);
    const { toHistoryMessage } = await import(normUrl);

    if (typeof setSelfListen === "function") {
      setSelfListen(true);
    }

    await autoLogin(true);
    if (!isLoggedIn()) {
      progress.status = "error";
      progress.phase = "login_failed";
      progress.errors.push("Tài khoản Zalo chưa đăng nhập hoặc cookie đã hết hạn.");
      writeProgress(progressPath, progress);
      console.log(JSON.stringify({ ok: false, error: "Not logged in" }));
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");
    progress.phase = "metadata";
    writeProgress(progressPath, progress);

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

    // 1. Tải song song Friends (kèm lastActionTime), Groups, Pinned, Archived, Unread, Account Info
    const [friendsRes, groupsRes, pinRes, selfInfoRes, archivedRes, unreadRes] = await Promise.allSettled([
      api.getAllFriends(),
      api.getAllGroups(),
      typeof api.getPinConversations === "function" ? api.getPinConversations() : Promise.resolve([]),
      typeof api.fetchAccountInfo === "function"
        ? api.fetchAccountInfo()
        : ownId && typeof api.getUserInfo === "function"
        ? api.getUserInfo(ownId)
        : Promise.resolve(null),
      typeof api.getArchivedChatList === "function" ? api.getArchivedChatList() : Promise.resolve(null),
      typeof api.getUnreadMark === "function" ? api.getUnreadMark() : Promise.resolve(null),
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
        const rawLastAction = Number(f.lastActionTime) || 0;
        const lastActionTime =
          rawLastAction > 0 ? normalizeTs(rawLastAction, 0) : 0;
        userNamesMap.set(uid, name);
        friends.push({
          userId: uid,
          displayName: f.displayName || "",
          zaloName: f.zaloName || "",
          avatar: f.avatar || "",
          phoneNumber: f.phoneNumber || "",
          lastActionTime,
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

    const archivedIds = [];
    if (archivedRes.status === "fulfilled" && archivedRes.value) {
      const list = archivedRes.value?.list || archivedRes.value?.data || [];
      if (Array.isArray(list)) {
        for (const item of list) {
          const id = String(item?.id || item?.threadId || item || "");
          if (id) archivedIds.push(id);
        }
      }
    }

    const unreadThreadIds = [];
    if (unreadRes.status === "fulfilled" && unreadRes.value) {
      const data = unreadRes.value?.data || unreadRes.value;
      const convoIds = data?.convsGroup || data?.convsUser || [];
      if (Array.isArray(convoIds)) {
        for (const item of convoIds) {
          const id = String(item?.id || item?.threadId || item || "");
          if (id) unreadThreadIds.push(id);
        }
      }
      if (Array.isArray(data?.convsUser)) {
        for (const item of data.convsUser) {
          const id = String(item?.id || item?.threadId || item || "");
          if (id && !unreadThreadIds.includes(id)) unreadThreadIds.push(id);
        }
      }
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
      } catch (err) {
        if (progress.errors.length < 10) {
          progress.errors.push(`getGroupInfo batch: ${err?.message || "unknown"}`);
        }
      }
    }

    progress.friendsCount = friends.length;
    progress.groupsCount = groups.length;
    writeProgress(progressPath, progress);

    // Lưu cache metadata ngay lập tức (không chờ step 4/5 xong mới có danh bạ & tên)
    const initialMetaPayload = {
      ownId,
      accountName: ownAccountName,
      friends,
      groups,
      pinnedIds,
      archivedIds,
      unreadThreadIds,
      groupVersions: prevGroupVersions,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(metaCachePath, JSON.stringify(initialMetaPayload), "utf8");

    // 4. Đọc các msgId đã có để khử trùng lặp trước khi nạp WS backfill & Group REST history
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

    // 5. Deep WebSocket Cloud Backfill (cmd 510 DM + cmd 511 Group) khi được yêu cầu (đặc biệt khi đăng nhập mới!)
    let wsResult = { dmBackfilled: 0, groupBackfilled: 0 };
    if (runWsBackfill) {
      wsResult = await runWebSocketBackfill({
        api,
        toHistoryMessage,
        mainHistoryPath,
        seenMsgIds,
        ownId,
        ownAccountName,
        userNamesMap,
        progress,
        progressPath,
      });
      if (wsResult.wsError && progress.errors.length < 10) {
        progress.errors.push(`WS Backfill: ${wsResult.wsError}`);
      }
    }

    // 6. Đồng bộ tin nhắn gần nhất của TẤT CẢ các nhóm qua HTTP GET (getGroupChatHistory, 50 tin/nhóm)
    progress.phase = "group_history";
    writeProgress(progressPath, progress);

    const groupsToSync = groups.filter((g) => {
      if (forceFull) return true;
      if (!threadsWithHistory.has(g.threadId)) return true;
      if (!prevGroupVersions[g.threadId] || prevGroupVersions[g.threadId] !== g.version) return true;
      return false;
    });

    let totalNewGroupMessages = 0;
    const succeededGroupIds = new Set();

    for (let i = 0; i < groupsToSync.length; i += GROUP_BATCH_SIZE) {
      const gBatch = groupsToSync.slice(i, i + GROUP_BATCH_SIZE);
      const batchNewMessages = [];

      await Promise.allSettled(
        gBatch.map(async (g) => {
          try {
            const hist = await Promise.race([
              api.getGroupChatHistory(g.threadId, GROUP_HISTORY_COUNT),
              sleep(GROUP_CALL_TIMEOUT_MS).then(() => {
                throw new Error("timeout");
              }),
            ]);
            succeededGroupIds.add(g.threadId);
            const msgs = Array.isArray(hist?.groupMsgs) ? hist.groupMsgs : [];
            for (const rawMsg of msgs) {
              const item = normalizeRawZaloMessage(
                rawMsg,
                toHistoryMessage,
                ownId,
                ownAccountName,
                userNamesMap,
                seenMsgIds
              );
              if (item) {
                item.threadId = String(g.threadId);
                item.threadType = "group";
                batchNewMessages.push(item);
              }
            }
          } catch (err) {
            if (progress.errors.length < 10) {
              progress.errors.push(`Group ${g.threadId}: ${err?.message || "fetch error"}`);
            }
          }
        })
      );

      if (batchNewMessages.length > 0) {
        batchNewMessages.sort((a, b) => a.timestamp - b.timestamp);
        appendJsonl(groupHistoryPath, batchNewMessages);
        totalNewGroupMessages += batchNewMessages.length;
      }

      progress.groupRestFetched = totalNewGroupMessages;
      progress.groupsProcessed = Math.min(i + GROUP_BATCH_SIZE, groupsToSync.length);
      progress.groupsTotal = groupsToSync.length;
      writeProgress(progressPath, progress);

      if (i + GROUP_BATCH_SIZE < groupsToSync.length) {
        await sleep(180);
      }
    }

    const newGroupVersions = { ...prevGroupVersions };
    for (const g of groups) {
      if (succeededGroupIds.has(g.threadId)) {
        newGroupVersions[g.threadId] = g.version;
      }
    }

    fs.writeFileSync(
      metaCachePath,
      JSON.stringify({
        ...initialMetaPayload,
        groupVersions: newGroupVersions,
        updatedAt: Date.now(),
      }),
      "utf8"
    );

    progress.status = "done";
    progress.phase = "done";
    progress.completedAt = Date.now();
    progress.dmBackfilled = wsResult.dmBackfilled || 0;
    progress.groupBackfilled = wsResult.groupBackfilled || 0;
    progress.groupRestFetched = totalNewGroupMessages;
    writeProgress(progressPath, progress);

    console.log(
      JSON.stringify({
        ok: true,
        ownId,
        friendsCount: friends.length,
        groupsCount: groups.length,
        syncedGroupsCount: succeededGroupIds.size,
        pinnedCount: pinnedIds.length,
        dmBackfilledCount: wsResult.dmBackfilled || 0,
        groupBackfilledCount: wsResult.groupBackfilled || 0,
        newGroupMessagesCount: totalNewGroupMessages,
      })
    );
    process.exit(0);
  } catch (err) {
    progress.status = "error";
    progress.phase = "exception";
    if (progress.errors.length < 10) {
      progress.errors.push(err?.message || String(err));
    }
    writeProgress(progressPath, progress);
    console.error("[ZALO_DIRECT_SYNC_ERR]", err?.message || err);
    process.exit(1);
  }
}

main();
