import fs from "fs";
import path from "path";
import { getAllActiveZaloHomes, getActiveZaloHome } from "./zaloRunner.js";
import { getAllConversationTags } from "./tagStore.js";
import { getAllCustomers, maskPhoneMiddle, normalizePhone } from "./customerIdentityResolver.js";
import { getStoredOrders } from "./ordersStore.js";
import { listAllChannels } from "./connectionHub.js";

/**
 * ADDP CRM — Broadcast Real Audience Resolver
 * Trích xuất danh sách người nhận THỰC TẾ 100% theo đúng Tài khoản/Nick được chọn:
 * 1. Danh bạ bạn bè & hội thoại Zalo Cá Nhân thật của từng nick (crm-meta-cache.json + history.jsonl).
 * 2. Khách hàng đa kênh đã từng nhắn tin / mua hàng (Zalo OA, Fanpage FB, TikTok Shop, Shopee).
 * 3. Hỗ trợ lọc kết hợp theo: Tài khoản gửi, Thẻ Tag, Sản phẩm đã mua, Phân loại khách hàng, Tìm kiếm & Chọn thủ công.
 */

function buildCrmLookupMaps() {
  const byPhone = new Map();
  const byZaloUid = new Map();
  const orderProductsByPhone = new Map();

  try {
    const orders = getStoredOrders();
    for (const ord of orders) {
      if (!ord || String(ord.status || "").toUpperCase() === "CANCELLED") continue;
      const p = normalizePhone(ord.phone || "");
      if (!p) continue;
      if (!orderProductsByPhone.has(p)) orderProductsByPhone.set(p, new Set());
      const set = orderProductsByPhone.get(p);
      if (ord.productName && String(ord.productName).trim()) {
        set.add(String(ord.productName).trim());
      }
      for (const it of ord.items || []) {
        const nm = String(it.name || it.productName || "").trim();
        if (nm) set.add(nm);
      }
    }
  } catch {}

  try {
    const customers = getAllCustomers();
    for (const c of customers) {
      const p = normalizePhone(c.phone || "");
      const orderProds = p ? orderProductsByPhone.get(p) : null;
      const mergedProducts = Array.from(
        new Set([
          ...(Array.isArray(c.purchasedProducts) ? c.purchasedProducts.filter(Boolean) : []),
          ...(orderProds ? Array.from(orderProds) : []),
        ])
      );
      const enriched = {
        ...c,
        cleanPhone: p,
        purchasedProducts: mergedProducts,
        category:
          c.purchaseLevel ||
          c.vipLabel ||
          c.carePath ||
          c.status ||
          (mergedProducts.length > 0 ? "KH Cũ" : "KH Mới"),
      };
      if (p) byPhone.set(p, enriched);
      if (c.zaloUid) byZaloUid.set(String(c.zaloUid), enriched);
      if (c.zaloThreadId) byZaloUid.set(String(c.zaloThreadId), enriched);
    }
  } catch {}

  return { byPhone, byZaloUid, orderProductsByPhone };
}

function matchZaloAccountFilter(acc, targetAccount = "ALL") {
  if (!targetAccount || targetAccount === "ALL") return true;
  const q = String(targetAccount).trim().toLowerCase();
  const ownId = String(acc.ownId || "").trim().toLowerCase();
  const accountId = String(acc.accountId || "").trim().toLowerCase();
  const slug = String(acc.slug || "").trim().toLowerCase();
  const name = String(acc.displayName || acc.name || "").trim().toLowerCase();
  const homeDir = String(acc.homeDir || "").trim().toLowerCase();

  return (
    ownId === q ||
    accountId === q ||
    slug === q ||
    homeDir === q ||
    `zalo_${ownId}` === q ||
    `zalo_${accountId}` === q ||
    (q.length >= 3 && (name.includes(q) || q.includes(name)))
  );
}

/**
 * Trích xuất danh sách bạn bè & liên hệ thực tế của tài khoản Zalo Cá Nhân (lọc chính xác theo nick được chọn)
 */
export function getRealZaloFriends(targetAccount = "ALL") {
  const contactsMap = new Map();
  const threadTags = getAllConversationTags();
  const { byPhone, byZaloUid } = buildCrmLookupMaps();

  const activeAccounts = getAllActiveZaloHomes();
  let matchedAccounts = [];

  if (targetAccount && targetAccount !== "ALL") {
    matchedAccounts = activeAccounts.filter((a) => matchZaloAccountFilter(a, targetAccount));
    // Nếu truyền trực tiếp đường dẫn homeDir
    if (matchedAccounts.length === 0 && fs.existsSync(String(targetAccount))) {
      matchedAccounts = [
        {
          homeDir: String(targetAccount),
          ownId: "",
          accountId: String(targetAccount),
          displayName: path.basename(String(targetAccount)),
        },
      ];
    }
  } else if (activeAccounts.length > 0) {
    matchedAccounts = activeAccounts;
  } else {
    const fallback = getActiveZaloHome();
    if (fallback) {
      matchedAccounts = [
        {
          homeDir: fallback,
          ownId: "1781287338457243967",
          accountId: "1781287338457243967",
          displayName: "Sơn Tùng",
        },
      ];
    }
  }

  for (const acc of matchedAccounts) {
    const hDir = acc.homeDir;
    if (!hDir) continue;
    const accDisplayName = acc.displayName || acc.name || "Zalo Cá Nhân";
    const accLabel = `Zalo Cá Nhân (${accDisplayName})`;
    const accOwnId = String(acc.ownId || acc.accountId || "");

    // 1. Quét crm-meta-cache.json của đúng thư mục nick Zalo này
    const cachePath = path.join(hDir, ".zalo-agent-cli", "crm-meta-cache.json");
    if (fs.existsSync(cachePath)) {
      try {
        const raw = fs.readFileSync(cachePath, "utf8");
        const meta = JSON.parse(raw);
        if (Array.isArray(meta?.friends)) {
          for (const f of meta.friends) {
            if (!f?.userId) continue;
            const uid = String(f.userId);
            if (accOwnId && uid === accOwnId) continue;
            const fullName = f.alias || f.aliasName || f.displayName || f.zaloName || "Khách Zalo";
            const cleanPhone = normalizePhone(f.phoneNumber || "");
            const crmCust = byZaloUid.get(uid) || (cleanPhone ? byPhone.get(cleanPhone) : null);

            const tagSet = new Set([
              "Bạn Bè Zalo",
              ...(Array.isArray(threadTags[uid]) ? threadTags[uid] : []),
              ...(cleanPhone && Array.isArray(threadTags[cleanPhone]) ? threadTags[cleanPhone] : []),
              ...(Array.isArray(crmCust?.tags) ? crmCust.tags : []),
            ]);

            const purchasedProducts = Array.isArray(crmCust?.purchasedProducts)
              ? crmCust.purchasedProducts
              : [];
            const category =
              crmCust?.category ||
              (purchasedProducts.length > 0 ? "KH Cũ" : "Bạn Bè Zalo");

            const hasAlias = Boolean(f.alias || f.aliasName);
            const preferredName = hasAlias ? fullName : (crmCust?.fullName || fullName);

            contactsMap.set(`${accOwnId || hDir}_${uid}`, {
              id: uid,
              fullName: preferredName,
              name: preferredName,
              phone: cleanPhone || crmCust?.phone || f.phoneNumber || "",
              maskedPhone:
                maskPhoneMiddle(cleanPhone || crmCust?.phone || f.phoneNumber || "") ||
                `UID: ${uid.slice(-6)}`,
              zaloUid: uid,
              zaloThreadId: uid,
              accountId: accOwnId,
              accountName: accDisplayName,
              zaloHome: hDir,
              channel: "ZALO_PERSONAL",
              channelLabel: accLabel,
              avatar: f.avatar || "",
              tags: Array.from(tagSet),
              purchasedProducts,
              category,
              assignedStaff: crmCust?.assignedStaff || crmCust?.staffName || accDisplayName,
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

    // 2. Quét từ file history.jsonl của đúng nick Zalo này
    const historyFiles = [
      path.join(hDir, ".zalo-agent-cli", "history.jsonl"),
      path.join(hDir, ".zalo-agent-cli", "crm-group-history.jsonl"),
    ];
    if (!targetAccount || targetAccount === "ALL" || accOwnId === "1781287338457243967") {
      historyFiles.push(
        path.resolve(process.cwd(), "portal", "data", "zalo_history_1781287338457243967.jsonl"),
        path.resolve(process.cwd(), "data", "zalo_history_1781287338457243967.jsonl")
      );
    }

    for (const hFile of historyFiles) {
      if (!fs.existsSync(hFile)) continue;
      try {
        const content = fs.readFileSync(hFile, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const msg = JSON.parse(trimmed);
          if (msg.threadType === "group" || msg.isGroup) continue;

          const uid = String(msg.threadId || msg.senderId || "");
          if (!uid || (accOwnId && uid === accOwnId) || uid.length < 6) continue;

          const mapKey = `${accOwnId || hDir}_${uid}`;
          const isSelf = Boolean(msg.isSelf);
          const contactName =
            !isSelf && msg.senderName && !/ADDP|Dược sĩ|Chuyên viên|Khách/i.test(msg.senderName)
              ? msg.senderName
              : null;

          if (!contactsMap.has(mapKey)) {
            const crmCust = byZaloUid.get(uid);
            const cleanPhone = normalizePhone(crmCust?.phone || "");
            const finalName = crmCust?.fullName || contactName || `Khách Zalo #${uid.slice(-4)}`;
            const tagSet = new Set([
              "Đã Từng Nhắn Tin Zalo",
              ...(Array.isArray(threadTags[uid]) ? threadTags[uid] : []),
              ...(cleanPhone && Array.isArray(threadTags[cleanPhone]) ? threadTags[cleanPhone] : []),
              ...(Array.isArray(crmCust?.tags) ? crmCust.tags : []),
            ]);
            const purchasedProducts = Array.isArray(crmCust?.purchasedProducts)
              ? crmCust.purchasedProducts
              : [];
            const category =
              crmCust?.category ||
              (purchasedProducts.length > 0 ? "KH Cũ" : "Đã Từng Nhắn Tin Zalo");

            contactsMap.set(mapKey, {
              id: uid,
              fullName: finalName,
              name: finalName,
              phone: cleanPhone || "",
              maskedPhone: cleanPhone ? maskPhoneMiddle(cleanPhone) : `UID: ${uid.slice(-6)}`,
              zaloUid: uid,
              zaloThreadId: uid,
              accountId: accOwnId,
              accountName: accDisplayName,
              zaloHome: hDir,
              channel: "ZALO_PERSONAL",
              channelLabel: accLabel,
              avatar: "",
              tags: Array.from(tagSet),
              purchasedProducts,
              category,
              assignedStaff: crmCust?.assignedStaff || crmCust?.staffName || accDisplayName,
              lastInteractionTime: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
              hasExistingThread: true,
              source: "ZALO_HISTORY",
            });
          } else {
            const existing = contactsMap.get(mapKey);
            if (contactName && existing.fullName.startsWith("Khách Zalo #")) {
              existing.fullName = contactName;
              existing.name = contactName;
            }
            if (!existing.tags.includes("Đã Từng Nhắn Tin Zalo")) {
              existing.tags.push("Đã Từng Nhắn Tin Zalo");
            }
          }
        }
      } catch {}
    }
  }

  // Deduplicate by uid (in case ALL accounts selected)
  const deduped = new Map();
  for (const item of contactsMap.values()) {
    const key = String(item.zaloUid || item.phone || item.id);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

/**
 * Trích xuất toàn bộ khách hàng đa kênh (Zalo, Messenger, Zalo OA, TikTok Shop, Shopee) theo tài khoản chọn
 */
export function getAllInboxCustomers(targetChannel = "ALL", targetAccount = "ALL") {
  const customerMap = new Map();
  const { byPhone, byZaloUid, orderProductsByPhone } = buildCrmLookupMaps();
  const threadTags = getAllConversationTags();
  const normCh = String(targetChannel || "ALL").toUpperCase();

  // 1. Nạp bạn bè & khách Zalo của đúng nick Zalo được chọn
  if (normCh === "ALL" || normCh === "ZALO_PERSONAL" || normCh === "ZALO") {
    const zaloFriends = getRealZaloFriends(targetAccount);
    for (const zc of zaloFriends) {
      customerMap.set(`zalo_${zc.id}`, zc);
    }
  }

  // 2. Nạp khách hàng từ omnichannel_messages.json (Fanpage FB, Zalo OA, TikTok Shop, Shopee)
  const omnichannelCandidates = [
    path.resolve(process.cwd(), "portal", "data", "omnichannel_messages.json"),
    path.resolve(process.cwd(), "data", "omnichannel_messages.json"),
    path.resolve(process.cwd(), "portal", ".data", "omnichannel_messages.json"),
    path.resolve(process.cwd(), ".data", "omnichannel_messages.json"),
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
          const itemAccId = String(item.pageId || item.shopId || item.accountId || item.oaId || "");
          if (targetAccount && targetAccount !== "ALL") {
            const q = String(targetAccount).toLowerCase();
            if (
              itemAccId &&
              itemAccId.toLowerCase() !== q &&
              !String(item.accountName || item.pageName || "").toLowerCase().includes(q)
            ) {
              continue;
            }
          }
          const key = `${ch}_${tid}`;
          if (!customerMap.has(key)) {
            const cleanPhone = normalizePhone(item.phone || "");
            const crmCust = cleanPhone ? byPhone.get(cleanPhone) : byZaloUid.get(tid);
            const name = crmCust?.fullName || item.senderName || item.customerName || "Khách Hàng";
            const purchasedProducts = Array.isArray(crmCust?.purchasedProducts)
              ? crmCust.purchasedProducts
              : [];
            const tagSet = new Set([
              "Khách Hộp Thư",
              ...(Array.isArray(item.tags) ? item.tags : []),
              ...(Array.isArray(threadTags[tid]) ? threadTags[tid] : []),
              ...(Array.isArray(crmCust?.tags) ? crmCust.tags : []),
            ]);
            customerMap.set(key, {
              id: tid,
              fullName: name,
              name,
              phone: cleanPhone || item.phone || "",
              maskedPhone:
                maskPhoneMiddle(cleanPhone || item.phone || "") || `ID: ${tid.slice(-6)}`,
              zaloUid: ch.includes("ZALO") ? tid : null,
              zaloThreadId: ch.includes("ZALO") ? tid : null,
              facebookId: ch.includes("FACEBOOK") ? tid : null,
              psid: ch.includes("FACEBOOK") ? tid : null,
              accountId: itemAccId,
              channel: ch,
              channelLabel:
                item.accountName ||
                item.pageName ||
                (ch === "FACEBOOK"
                  ? "Fanpage Facebook"
                  : ch === "ZALO_OA"
                  ? "Zalo OA Dược Phẩm ADDP"
                  : ch.includes("TIKTOK")
                  ? "TikTok Shop"
                  : ch === "SHOPEE"
                  ? "Shopee"
                  : "Zalo Cá Nhân"),
              avatar: item.avatar || "",
              tags: Array.from(tagSet),
              purchasedProducts,
              category:
                crmCust?.category ||
                (purchasedProducts.length > 0 ? "KH Cũ" : "Khách Hộp Thư"),
              assignedStaff: crmCust?.assignedStaff || crmCust?.staffName || "Dược sĩ ADDP",
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

  // 3. Nạp khách từ customers.json (lọc theo kênh & tài khoản/nhân viên nếu chọn nick cụ thể)
  try {
    const allChannels = listAllChannels();
    let selectedAccDisplayName = "";
    if (targetAccount && targetAccount !== "ALL") {
      const matchedZalo = getAllActiveZaloHomes().find((a) =>
        matchZaloAccountFilter(a, targetAccount)
      );
      if (matchedZalo) {
        selectedAccDisplayName = String(matchedZalo.displayName || matchedZalo.name || "")
          .replace(/[-_]\s*addp/i, "")
          .trim()
          .toLowerCase();
      } else {
        const matchedCh = allChannels.find(
          (c) =>
            String(c.id) === String(targetAccount) ||
            String(c.externalId) === String(targetAccount) ||
            String(c.config?.ownId || c.config?.pageId || c.config?.shopId) ===
              String(targetAccount)
        );
        if (matchedCh) {
          selectedAccDisplayName = String(matchedCh.name || "")
            .replace(/zalo\s*cá\s*nhân|fanpage|tiktok|shopee|[()]/gi, "")
            .replace(/[-_]\s*addp/i, "")
            .trim()
            .toLowerCase();
        }
      }
    }

    const crmCustomers = getAllCustomers();
    for (const cust of crmCustomers) {
      const cleanPhone = normalizePhone(cust.phone || "");
      const phoneKey = cleanPhone ? `phone_${cleanPhone}` : `crm_${cust.id}`;
      // Nếu đã có trong danh sách bạn bè Zalo rồi thì gộp thêm thông tin CRM vào bản ghi Zalo đó
      if (cust.zaloUid && customerMap.has(`zalo_${cust.zaloUid}`)) continue;

      if (targetAccount && targetAccount !== "ALL") {
        const prefAcc = String(
          cust.preferredZaloAccountId || cust.zaloAccountId || cust.accountId || ""
        ).toLowerCase();
        const staffNameLower = String(cust.assignedStaff || cust.staffName || "").toLowerCase();
        const matchesPrefAcc =
          prefAcc && prefAcc === String(targetAccount).toLowerCase();
        const matchesStaff =
          selectedAccDisplayName &&
          selectedAccDisplayName.length >= 3 &&
          staffNameLower.includes(selectedAccDisplayName);
        if (!matchesPrefAcc && !matchesStaff) {
          continue;
        }
      }

      if (!customerMap.has(phoneKey)) {
        const orderProds = cleanPhone ? orderProductsByPhone.get(cleanPhone) : null;
        const purchasedProducts = Array.from(
          new Set([
            ...(Array.isArray(cust.purchasedProducts) ? cust.purchasedProducts.filter(Boolean) : []),
            ...(orderProds ? Array.from(orderProds) : []),
          ])
        );
        const category =
          cust.purchaseLevel ||
          cust.vipLabel ||
          cust.carePath ||
          cust.status ||
          (purchasedProducts.length > 0 ? "KH Cũ" : "KH Mới");
        const custCh = String(cust.source || cust.channel || "ZALO_PERSONAL").toUpperCase();

        customerMap.set(phoneKey, {
          id: cust.id,
          fullName: cust.fullName || cust.name || "Khách hàng",
          name: cust.fullName || cust.name || "Khách hàng",
          phone: cleanPhone || cust.phone || "",
          maskedPhone: maskPhoneMiddle(cleanPhone || cust.phone || ""),
          zaloUid: cust.zaloUid || null,
          zaloThreadId: cust.zaloThreadId || null,
          facebookId: cust.facebookId || cust.psid || null,
          psid: cust.facebookId || cust.psid || null,
          channel: custCh,
          channelLabel:
            cust.channelLabel ||
            (cust.assignedStaff ? `KH Phụ trách (${cust.assignedStaff})` : "Hồ sơ CRM"),
          avatar: cust.avatar || "",
          tags: Array.isArray(cust.tags) ? cust.tags : [],
          purchasedProducts,
          category,
          assignedStaff: cust.assignedStaff || cust.staffName || "Dược sĩ ADDP",
          lastInteractionTime: cust.updatedAt || cust.createdAt || null,
          hasExistingThread: Boolean(cust.zaloUid || cust.facebookId || cleanPhone),
          source: "CRM_CUSTOMER",
        });
      }
    }
  } catch {}

  return Array.from(customerMap.values());
}

/**
 * Phân giải đối tượng nhận tin theo các tiêu chí thực tế:
 * - Kênh & Tài khoản gửi (targetAccount)
 * - Nguồn tệp (ZALO_FRIENDS | ALL_INBOX | BY_TAG)
 * - Thẻ khách hàng (includeTags, excludeTags)
 * - Sản phẩm đã mua (productFilter)
 * - Phân loại khách hàng (categoryFilter)
 * - Từ khóa tìm kiếm (searchQuery)
 */
export function resolveBroadcastAudience({
  audienceSource = "ZALO_FRIENDS", // "ZALO_FRIENDS" | "ALL_INBOX" | "BY_TAG"
  includeTags = [],
  excludeTags = ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"],
  channel = "ALL",
  operator = "OR",
  targetAccount = "ALL",
  productFilter = "ALL",
  categoryFilter = "ALL",
  searchQuery = "",
} = {}) {
  let baseList = [];
  const targetCh = String(channel || "ALL").toUpperCase();

  const normInclude = (Array.isArray(includeTags) ? includeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const normExclude = (Array.isArray(excludeTags) ? excludeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const op = String(operator || "OR").toUpperCase() === "AND" ? "AND" : "OR";

  if (
    audienceSource === "ZALO_FRIENDS" &&
    (targetCh === "ALL" || targetCh === "ZALO_PERSONAL" || targetCh === "ZALO")
  ) {
    baseList = getRealZaloFriends(targetAccount);
  } else {
    baseList = getAllInboxCustomers(targetCh, targetAccount);
  }

  const threadTags = getAllConversationTags();
  const availableProductsSet = new Set();
  const availableCategoriesSet = new Set();

  // Tập hợp danh mục Sản phẩm & Phân loại có trong tệp của tài khoản này trước khi lọc sâu
  for (const cust of baseList) {
    for (const p of cust.purchasedProducts || []) {
      if (p && String(p).trim()) availableProductsSet.add(String(p).trim());
    }
    if (cust.category && String(cust.category).trim()) {
      availableCategoriesSet.add(String(cust.category).trim());
    }
  }

  const qSearch = String(searchQuery || "").trim().toLowerCase();

  // Áp dụng bộ lọc đa tiêu chí
  const filtered = baseList.filter((cust) => {
    const custId = String(cust.zaloUid || cust.id || "");
    const extraTags = Array.isArray(threadTags[custId]) ? threadTags[custId] : [];
    const combinedTags = Array.from(
      new Set([...(Array.isArray(cust.tags) ? cust.tags : []), ...extraTags])
    );
    cust.tags = combinedTags;
    const tagsLower = combinedTags.map((t) => String(t).trim().toLowerCase());

    // 1. Lọc loại trừ (Exclude Tags)
    if (normExclude.length > 0) {
      const hasExcluded = normExclude.some((ex) =>
        tagsLower.some((ct) => ct === ex || ct.includes(ex))
      );
      if (hasExcluded) return false;
    }

    // 2. Lọc kênh gửi (Channel)
    if (targetCh && targetCh !== "ALL") {
      const custCh = String(cust.channel || "ZALO_PERSONAL").toUpperCase();
      const hasPhone = Boolean(cust.phone && String(cust.phone).length >= 9);
      if (targetCh === "ZALO_PERSONAL" && !custCh.includes("ZALO") && !hasPhone) return false;
      if (targetCh === "FACEBOOK" && !custCh.includes("FACEBOOK") && !cust.facebookId) return false;
      if (targetCh === "ZALO_OA" && custCh !== "ZALO_OA" && !hasPhone) return false;
      if (targetCh === "TIKTOK_SHOP" && !custCh.includes("TIKTOK") && !hasPhone) return false;
      if (targetCh === "SHOPEE" && !custCh.includes("SHOPEE") && !hasPhone) return false;
    }

    // 3. Lọc theo Thẻ Khách Hàng (Include Tags - áp dụng trên mọi nguồn tệp khi người dùng chọn thẻ)
    if (normInclude.length > 0) {
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

    // 4. Lọc theo Sản phẩm đã mua
    if (productFilter && productFilter !== "ALL") {
      const prods = Array.isArray(cust.purchasedProducts) ? cust.purchasedProducts : [];
      const targetProdLower = String(productFilter).trim().toLowerCase();
      if (!prods.some((p) => String(p).trim().toLowerCase() === targetProdLower)) {
        return false;
      }
    }

    // 5. Lọc theo Phân loại khách hàng
    if (categoryFilter && categoryFilter !== "ALL") {
      const targetCatLower = String(categoryFilter).trim().toLowerCase();
      const custCatLower = String(cust.category || "").trim().toLowerCase();
      const inTags = tagsLower.some((t) => t === targetCatLower);
      if (custCatLower !== targetCatLower && !inTags) {
        return false;
      }
    }

    // 6. Lọc theo từ khóa tìm kiếm (Tên / SĐT / UID)
    if (qSearch) {
      const hay = `${cust.fullName || ""} ${cust.phone || ""} ${cust.zaloUid || ""} ${cust.id || ""}`.toLowerCase();
      if (!hay.includes(qSearch)) return false;
    }

    return true;
  });

  // Tính thống kê breakdown
  let zaloCount = 0;
  let messengerCount = 0;
  let zaloOaCount = 0;
  let tiktokCount = 0;
  let shopeeCount = 0;

  for (const c of filtered) {
    const ch = String(c.channel || "ZALO_PERSONAL").toUpperCase();
    if (ch.includes("ZALO") && ch !== "ZALO_OA") zaloCount += 1;
    else if (ch === "ZALO_OA") zaloOaCount += 1;
    else if (ch.includes("FACEBOOK")) messengerCount += 1;
    else if (ch.includes("TIKTOK")) tiktokCount += 1;
    else if (ch.includes("SHOPEE")) shopeeCount += 1;
    else zaloCount += 1;
  }

  // Tạo danh sách hiển thị để người dùng xem & tích chọn thủ công (tối đa 500 khách trên giao diện)
  const previewList = filtered.slice(0, 500).map((c) => ({
    id: String(c.id),
    fullName: c.fullName || c.name || "Khách Hàng",
    phone: c.phone || "",
    maskedPhone:
      c.maskedPhone ||
      maskPhoneMiddle(c.phone || "") ||
      (c.zaloUid ? `UID: ${String(c.zaloUid).slice(-6)}` : "Chưa có SĐT"),
    zaloUid: c.zaloUid || null,
    facebookId: c.facebookId || c.psid || null,
    channel: c.channelLabel || c.channel || "Zalo Cá Nhân",
    tags: Array.isArray(c.tags) ? c.tags : [],
    purchasedProducts: Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [],
    category: c.category || "Khách hàng",
    assignedStaff: c.assignedStaff || "Dược sĩ ADDP",
    lastInteractionTime: c.lastInteractionTime || "Vừa xong",
  }));

  return {
    totalCount: filtered.length,
    previewList,
    availableProducts: Array.from(availableProductsSet).sort((a, b) => a.localeCompare(b, "vi")),
    availableCategories: Array.from(availableCategoriesSet).sort((a, b) => a.localeCompare(b, "vi")),
    channelBreakdown: {
      zalo: zaloCount,
      messenger: messengerCount,
      zaloOa: zaloOaCount,
      tiktok: tiktokCount,
      shopee: shopeeCount,
    },
    allMatched: filtered,
  };
}
