import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { guardApiRequest } from "@/lib/rbac.js";
import { listAllChannels } from "@/lib/connectionHub.js";
import {
  findJavisZaloRoot,
  getAllActiveZaloHomes,
  getAllZaloHistoryFiles,
} from "@/lib/zaloRunner.js";
import { normalizePhone, isValidVietnamPhone } from "@/lib/phone.js";
import { getAllConversationTags } from "@/lib/tagStore.js";
import { getChannelBotMode, isBotActiveForThread } from "@/lib/botControlStore.js";
import { getAllCustomers, getCustomerById, findCustomerByPhone } from "@/lib/customerIdentityResolver.js";

function stripVietnamese(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function buildSafeAvatarUrl(rawAvatar, id, name) {
  const safeName = encodeURIComponent(String(name || "").trim() || "Khách Hàng");
  const safeId = encodeURIComponent(String(id || ""));
  if (
    rawAvatar &&
    typeof rawAvatar === "string" &&
    rawAvatar.trim() &&
    (rawAvatar.startsWith("http://") ||
      rawAvatar.startsWith("https://") ||
      rawAvatar.startsWith("//"))
  ) {
    return `/api/media/avatar-proxy?url=${encodeURIComponent(rawAvatar.trim())}&type=zalo_user&id=${safeId}&name=${safeName}`;
  }
  return `/api/media/avatar-proxy?type=zalo_user&id=${safeId}&name=${safeName}`;
}

function runFindUserWorker({ homeDir, javisRoot, phone = "", zaloUid = "" }) {
  return new Promise((resolve) => {
    const workerPath = path.join(process.cwd(), "src", "lib", "zaloFindUserWorker.mjs");
    if (!fs.existsSync(workerPath) || !javisRoot || !homeDir) {
      resolve({ ok: false, error: "WORKER_UNAVAILABLE" });
      return;
    }

    const childEnv = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      JAVIS_ZALO_ROOT: javisRoot,
      SEARCH_PHONE: String(phone || ""),
      SEARCH_ZALO_UID: String(zaloUid || ""),
    };

    execFile(
      process.execPath,
      [workerPath],
      { env: childEnv, timeout: 14000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve({ ok: false, error: err.message });
          return;
        }
        try {
          const lines = String(stdout || "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
          const lastLine = lines[lines.length - 1] || "{}";
          resolve(JSON.parse(lastLine));
        } catch {
          resolve({ ok: false, error: "INVALID_WORKER_OUTPUT" });
        }
      }
    );
  });
}

function readAccountCacheAndLastMessage(homeDir, targetUid = "", targetPhone = "") {
  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  const metaPath = path.join(cliDir, "crm-meta-cache.json");
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {}
  }

  let matchedFriend = null;
  const friends = Array.isArray(meta?.friends) ? meta.friends : [];
  const strangers = Array.isArray(meta?.strangers) ? meta.strangers : [];

  if (targetUid) {
    matchedFriend =
      friends.find((f) => String(f.userId || f.uid || f.id || "") === String(targetUid)) ||
      strangers.find((s) => String(s.userId || s.uid || s.id || "") === String(targetUid)) ||
      null;
  }

  if (!matchedFriend && targetPhone) {
    matchedFriend =
      friends.find((f) => {
        const p = normalizePhone(f.phoneNumber || f.phone || "");
        return p && p === targetPhone;
      }) ||
      strangers.find((s) => {
        const p = normalizePhone(s.phoneNumber || s.phone || "");
        return p && p === targetPhone;
      }) ||
      null;
  }

  const effectiveUid = String(
    matchedFriend?.userId || matchedFriend?.uid || matchedFriend?.id || targetUid || ""
  ).trim();

  let lastMsg = null;
  if (effectiveUid) {
    const histFiles = getAllZaloHistoryFiles(homeDir);
    for (const hf of histFiles) {
      try {
        const raw = fs.readFileSync(hf, "utf8");
        const lines = raw.split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          if (!line || !line.includes(effectiveUid)) continue;
          const m = JSON.parse(line);
          if (String(m.threadId || "") === effectiveUid) {
            if (!lastMsg || Number(m.timestamp || 0) > Number(lastMsg.timestamp || 0)) {
              lastMsg = m;
            }
            break;
          }
        }
      } catch {}
    }
  }

  return { meta, matchedFriend, effectiveUid, lastMsg };
}

/**
 * GET /api/channels/zalo/find-customer?phone=...&zaloUid=...&name=...&staff=...&customerId=...
 * Tìm khách hàng trên các tài khoản Zalo Cá Nhân đúng theo RBAC:
 * - ADMIN: tìm trên TẤT CẢ tài khoản Zalo Cá Nhân đang active (ưu tiên nick khớp NV phụ trách trước).
 * - SALE / CSKH / SALE_LEADER: CHỈ tìm trên tài khoản Zalo được phân quyền (assignedChannels).
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "inbox",
      resourceType: "conversations",
    });
    if (!guard.ok) return guard.response;

    const { liveStaff } = guard;
    const isAdmin = !liveStaff || liveStaff.role === "ADMIN";

    const { searchParams } = new URL(request.url);
    const rawPhone = (searchParams.get("phone") || "").trim();
    const rawZaloUid = (searchParams.get("zaloUid") || "").trim();
    const rawName = (searchParams.get("name") || "").trim();
    const staffHint = (searchParams.get("staff") || "").trim();
    const customerId = (searchParams.get("customerId") || "").trim();
    const preferredAccountId = (searchParams.get("accountId") || "").trim();

    let normPhone = normalizePhone(rawPhone);
    let effectiveZaloUid = rawZaloUid;
    let effectiveName = rawName;
    let customerPreferredAccount = preferredAccountId;

    // Bổ sung thông tin xác thực từ CRM DB nếu caller chỉ truyền customerId hoặc thiếu zaloUid
    if (customerId || (!normPhone && !effectiveZaloUid)) {
      try {
        const foundCrm =
          (customerId ? getCustomerById(customerId) : null) ||
          (normPhone ? findCustomerByPhone(normPhone) : null) ||
          (getAllCustomers() || []).find(
            (c) =>
              (customerId && (String(c.id) === customerId || String(c.code) === customerId)) ||
              (normPhone && normalizePhone(c.phone || "") === normPhone)
          );
        if (foundCrm) {
          if (!normPhone && foundCrm.phone) normPhone = normalizePhone(foundCrm.phone);
          if (!effectiveZaloUid && (foundCrm.zaloUid || foundCrm.zaloThreadId)) {
            effectiveZaloUid = String(foundCrm.zaloUid || foundCrm.zaloThreadId);
          }
          if (!effectiveName && foundCrm.fullName) effectiveName = String(foundCrm.fullName);
          if (!customerPreferredAccount && (foundCrm.preferredZaloAccountId || foundCrm.zaloAccountId)) {
            customerPreferredAccount = String(foundCrm.preferredZaloAccountId || foundCrm.zaloAccountId);
          }
        }
      } catch {}
    }

    if (!normPhone && !effectiveZaloUid) {
      return NextResponse.json({
        ok: true,
        found: false,
        reason: "MISSING_PHONE_OR_UID",
        message: "Khách hàng chưa có số điện thoại hợp lệ hoặc Zalo UID để mở hội thoại.",
        searchedAccounts: [],
      });
    }

    // 1. Lấy danh sách tài khoản Zalo được phép truy cập theo RBAC
    const systemActiveZaloChannels = listAllChannels().filter(
      (c) =>
        (c.platform === "ZALO_PERSONAL" ||
          c.type === "zalo_personal" ||
          c.channel_type === "zalo_personal" ||
          c.type === "zalo") &&
        c.status !== "DISCONNECTED" &&
        c.status !== "deleted" &&
        c.status !== "INACTIVE"
    );

    const hasChannelScope =
      !isAdmin && liveStaff && Array.isArray(liveStaff.assignedChannels);
    const allowedZaloSet = new Set(
      hasChannelScope ? liveStaff.assignedChannels.map((id) => String(id).trim()) : []
    );

    const allowedChannels = hasChannelScope
      ? systemActiveZaloChannels.filter((c) => {
          const ownId = String(c.config?.ownId || c.externalId || "").trim();
          const chId = String(c.id || "").trim();
          return (ownId && allowedZaloSet.has(ownId)) || (chId && allowedZaloSet.has(chId));
        })
      : systemActiveZaloChannels;

    const discoveredHomes = getAllActiveZaloHomes();
    const activeOwnIds = new Set(
      allowedChannels.map((c) => String(c.config?.ownId || c.externalId || "")).filter(Boolean)
    );
    const activeNames = new Set(
      allowedChannels
        .map((c) => String(c.config?.accountName || c.config?.label || c.name || "").toLowerCase())
        .filter(Boolean)
    );

    const scopedAccounts = discoveredHomes.filter((acc) => {
      const own = String(acc.ownId || acc.accountId || "");
      const name = String(acc.displayName || acc.name || "").toLowerCase();
      if (activeOwnIds.size > 0 && activeOwnIds.has(own)) return true;
      for (const an of activeNames) {
        if (an && name && (name.includes(an) || an.includes(name))) return true;
      }
      return false;
    });

    if (scopedAccounts.length === 0) {
      return NextResponse.json({
        ok: true,
        found: false,
        reason: "NO_ACTIVE_ZALO_ACCOUNT",
        message: isAdmin
          ? "Chưa có tài khoản Zalo cá nhân nào đang kết nối trong hệ thống."
          : "Tài khoản nhân viên của bạn chưa được phân quyền nick Zalo cá nhân nào.",
        searchedAccounts: [],
      });
    }

    // Sắp xếp thứ tự tìm kiếm:
    // 1. Ưu tiên số 1: Nick Zalo đã được gán hoặc từng có lịch sử với khách (customerPreferredAccount)
    // 2. Ưu tiên số 2: Nick Zalo khớp tên nhân viên/gợi ý nhân viên phụ trách (staffHint)
    const staffNorm = stripVietnamese(staffHint);
    const prefAccNorm = stripVietnamese(customerPreferredAccount);
    const channelMetaByOwnId = new Map();
    for (const ch of allowedChannels) {
      const oid = String(ch.config?.ownId || ch.externalId || "").trim();
      if (oid) channelMetaByOwnId.set(oid, ch);
    }

    const orderedAccounts = [...scopedAccounts].sort((a, b) => {
      const aOwn = String(a.ownId || a.accountId || "");
      const bOwn = String(b.ownId || b.accountId || "");
      const aName = stripVietnamese(a.displayName || a.name || "");
      const bName = stripVietnamese(b.displayName || b.name || "");

      if (prefAccNorm) {
        const aPref = aOwn === prefAccNorm || aName.includes(prefAccNorm) || prefAccNorm.includes(aName);
        const bPref = bOwn === prefAccNorm || bName.includes(prefAccNorm) || prefAccNorm.includes(bName);
        if (aPref && !bPref) return -1;
        if (!aPref && bPref) return 1;
      }

      if (staffNorm) {
        const aMatch = aName.includes(staffNorm) || staffNorm.includes(aName);
        const bMatch = bName.includes(staffNorm) || staffNorm.includes(bName);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }
      return 0;
    });

    const searchedAccounts = orderedAccounts.map(
      (a) => a.displayName || a.name || a.ownId || a.accountId
    );
    const allThreadTags = getAllConversationTags();
    const validVnPhone = isValidVietnamPhone(normPhone) ? normPhone : "";

    const buildFoundConversation = ({ acc, profile, lastMsg }) => {
      const ownId = String(acc.ownId || acc.accountId || profile?.ownId || "");
      const matchedCh = channelMetaByOwnId.get(ownId);
      const accountName =
        matchedCh?.config?.label ||
        matchedCh?.config?.accountName ||
        matchedCh?.name ||
        acc.displayName ||
        acc.name ||
        `Zalo (${ownId.slice(-4)})`;
      const uid = String(profile.uid);
      const convName =
        profile.displayName || effectiveName || validVnPhone || `Khách Zalo ${uid.slice(-4)}`;
      const channelBotMode = getChannelBotMode(ownId);
      const botMode = isBotActiveForThread(uid, ownId) ? "AI" : "HUMAN";
      const byUidTags = Array.isArray(allThreadTags[uid]) ? allThreadTags[uid] : [];
      const byPhoneTags =
        validVnPhone && Array.isArray(allThreadTags[validVnPhone]) ? allThreadTags[validVnPhone] : [];
      const tags = Array.from(new Set([...byUidTags, ...byPhoneTags].filter(Boolean)));

      return {
        id: uid,
        threadId: uid,
        recipientId: uid,
        zaloUid: uid,
        name: convName,
        phone: validVnPhone || profile.phone || "",
        avatar: buildSafeAvatarUrl(profile.avatar || "", uid, convName),
        channel: "ZALO_PERSONAL",
        threadType: "dm",
        accountId: ownId,
        accountName,
        accountDisplayName: acc.displayName || acc.name || accountName,
        accountLabel: `Zalo: ${accountName}`,
        channelBotMode,
        botMode,
        isAccountLevelHuman: channelBotMode === "HUMAN",
        zaloHome: acc.homeDir,
        lastMessage: lastMsg?.text || lastMsg?.snippet || (lastMsg ? "[Tin nhắn]" : "Sẵn sàng nhắn tin qua Zalo"),
        timestamp: Number(lastMsg?.timestamp || Date.now()),
        lastActive: lastMsg ? "Đã có hội thoại" : "Tìm thấy qua Zalo",
        unreadCount: 0,
        isContactOnly: !lastMsg,
        tags,
      };
    };

    // BƯỚC 1: Tìm trong cache cục bộ & lịch sử chat (nhanh 0ms)
    // Ưu tiên cao nhất: nếu nick nào đã có lịch sử chat (lastMsg) với khách này -> Lấy ngay!
    let historyCandidate = null;
    let cacheOnlyCandidate = null;

    for (const acc of orderedAccounts) {
      const { matchedFriend, effectiveUid, lastMsg } = readAccountCacheAndLastMessage(
        acc.homeDir,
        effectiveZaloUid,
        validVnPhone
      );
      if (effectiveUid && (matchedFriend || lastMsg)) {
        const profile = {
          uid: effectiveUid,
          displayName:
            matchedFriend?.displayName || matchedFriend?.zaloName || effectiveName || validVnPhone,
          avatar: matchedFriend?.avatar || "",
          phone: validVnPhone || matchedFriend?.phoneNumber || "",
          ownId: acc.ownId,
        };
        const conv = buildFoundConversation({ acc, profile, lastMsg });
        if (lastMsg) {
          historyCandidate = conv;
          break; // Tìm thấy nick thực sự đang chat với khách -> Dừng ngay lập tức!
        }
        if (!cacheOnlyCandidate) {
          cacheOnlyCandidate = conv;
        }
      }
    }

    if (historyCandidate) {
      return NextResponse.json({
        ok: true,
        found: true,
        source: "history",
        isAdminSearch: isAdmin,
        searchedAccounts,
        conversation: historyCandidate,
      });
    }

    if (cacheOnlyCandidate) {
      return NextResponse.json({
        ok: true,
        found: true,
        source: "cache",
        isAdminSearch: isAdmin,
        searchedAccounts,
        conversation: cacheOnlyCandidate,
      });
    }

    // BƯỚC 2: Quét song song (Promise.all) qua pure HTTP-REST api.findUser(phone)
    // Không chạy tuần tự để tránh chờ đợi lâu khi có 2+ nick
    const javisRoot = findJavisZaloRoot(orderedAccounts[0]?.homeDir);

    const lookupPromises = orderedAccounts.map(async (acc) => {
      try {
        const res = await runFindUserWorker({
          homeDir: acc.homeDir,
          javisRoot: findJavisZaloRoot(acc.homeDir) || javisRoot,
          phone: validVnPhone,
          zaloUid: effectiveZaloUid,
        });

        if (res?.ok && res?.profile?.uid) {
          const { lastMsg } = readAccountCacheAndLastMessage(acc.homeDir, res.profile.uid, validVnPhone);
          const conv = buildFoundConversation({
            acc,
            profile: { ...res.profile, ownId: res.ownId || acc.ownId },
            lastMsg,
          });
          return { conv, hasHistory: Boolean(lastMsg), acc };
        }
      } catch {}
      return null;
    });

    const results = (await Promise.all(lookupPromises)).filter(Boolean);

    // Ưu tiên kết quả từ nick có lịch sử chat trước, nếu không thì lấy kết quả đầu tiên theo thứ tự orderedAccounts
    const bestMatch = results.find((r) => r.hasHistory) || results[0];

    if (bestMatch?.conv) {
      return NextResponse.json({
        ok: true,
        found: true,
        source: bestMatch.hasHistory ? "findUser_with_history" : "findUser",
        isAdminSearch: isAdmin,
        searchedAccounts,
        conversation: bestMatch.conv,
      });
    }

    return NextResponse.json({
      ok: true,
      found: false,
      reason: "NOT_FOUND_ON_ZALO",
      isAdminSearch: isAdmin,
      searchedAccounts,
      message: `Đã tìm trên ${searchedAccounts.length} nick Zalo (${searchedAccounts.join(", ")}) nhưng không thấy tài khoản cho ${validVnPhone || effectiveZaloUid} (khách có thể chặn tìm kiếm SĐT hoặc chưa dùng Zalo).`,
    });
  } catch (err) {
    console.error("[ZALO_FIND_CUSTOMER_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Lỗi tìm kiếm khách hàng trên Zalo." },
      { status: 500 }
    );
  }
}
