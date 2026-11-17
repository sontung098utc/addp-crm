import fs from "fs";
import path from "path";
import { filterCustomersByTags, maskPhoneMiddle } from "./customerIdentityResolver.js";
import { resolveBroadcastAudience } from "./broadcastAudienceResolver.js";
import {
  sendTextMessage,
  sendZaloMessageDirect,
  getAllActiveZaloHomes,
  resolveZaloHomeForThread,
  hasExistingZaloConnection,
} from "./zaloRunner.js";
import { listAllChannels } from "./connectionHub.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT, isSafePilotMode } from "./pilotConfig.js";
import { sendMetaFacebookMessage } from "./adapters/metaFacebookAdapter.js";
import { sendZaloOaMessage } from "./adapters/zaloOaAdapter.js";
import { sendUnifiedMessage } from "./unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Smart Broadcast Engine & Anti-Ban Queue (WBS-35 - Modules 2 & 3)
 * - Lưu trữ bền vững chiến dịch tại `portal/.data/broadcast_campaigns.json`.
 * - AI Spin Text (`{a|b|c}`) & Cá nhân hóa biến `{fullName}`, `{firstName}`, `{phone}`, `{assignedStaff}`.
 * - Hàng đợi gửi tin an toàn: Giãn cách ngẫu nhiên 45s - 120s/tin, giới hạn định mức server (Điều 4 AGENTS.md).
 * - Đấu nối gửi thực tế qua Zalo Cá nhân (`zca-js`), Fanpage Facebook (Luật 24h + Message Tag), Zalo OA (48h / ZNS).
 */

const HARD_DAILY_LIMIT_PER_ACCOUNT = DEFAULT_DAILY_ZALO_MSG_LIMIT;

function getCampaignsFilePath() {
  const candidates = [
    path.resolve(process.cwd(), ".data", "broadcast_campaigns.json"),
    path.resolve(process.cwd(), "portal", ".data", "broadcast_campaigns.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  const fallback = candidates[0];
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

function loadCampaignsFromDisk() {
  try {
    const filePath = getCampaignsFilePath();
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("[BROADCAST_ENGINE_LOAD_ERR]", err.message);
  }
  return [];
}

function saveCampaignsToDisk(campaigns) {
  try {
    const filePath = getCampaignsFilePath();
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(campaigns, null, 2), "utf8");
    try {
      globalThis.__addpBroadcastLastMtime = fs.statSync(filePath).mtimeMs;
    } catch {}
  } catch (err) {
    console.error("[BROADCAST_ENGINE_SAVE_ERR]", err.message);
  }
}

if (!globalThis.__addpBroadcastCampaigns) {
  globalThis.__addpBroadcastCampaigns = loadCampaignsFromDisk();
  try {
    const fp = getCampaignsFilePath();
    if (fp && fs.existsSync(fp)) {
      globalThis.__addpBroadcastLastMtime = fs.statSync(fp).mtimeMs;
    }
  } catch {}
}
if (!globalThis.__addpActiveRunners) {
  globalThis.__addpActiveRunners = new Map();
}

function getCampaignStore() {
  try {
    const filePath = getCampaignsFilePath();
    if (filePath && fs.existsSync(filePath)) {
      const mtime = fs.statSync(filePath).mtimeMs;
      if (mtime > (globalThis.__addpBroadcastLastMtime || 0)) {
        globalThis.__addpBroadcastCampaigns = loadCampaignsFromDisk();
        globalThis.__addpBroadcastLastMtime = mtime;
      }
    }
  } catch {}
  return globalThis.__addpBroadcastCampaigns;
}

/**
 * Tách tên gọi (FirstName) từ Họ và Tên tiếng Việt (VD: "Nguyễn Thị Lan" -> "Lan")
 */
function extractFirstName(fullName = "") {
  const clean = String(fullName || "").trim();
  if (!clean) return "Anh/Chị";
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1] || clean;
}

/**
 * Suy luận xưng hô theo giới tính (Anh / Chị / Chú / Cô / Anh/Chị)
 * - Ưu tiên tiền tố nhân viên đã đặt trên nick Zalo (VD: "Chị Ánh", "Chú Hùng")
 * - Tiếp theo kiểm tra trường gender (0/'male'/'nam' -> Anh, 1/'female'/'nữ' -> Chị)
 * - Tiếp theo nhận diện tên đệm phổ biến tiếng Việt
 */
export function resolveGenderSalutation(customer = {}) {
  const fullName = String(customer.fullName || customer.name || "").trim();
  const lower = fullName.toLowerCase();

  if (/^(chú|chu)\s+/i.test(lower)) return "Chú";
  if (/^(cô|co)\s+/i.test(lower)) return "Cô";
  if (/^(bác|bac)\s+/i.test(lower)) return "Bác";
  if (/^(ông|ong)\s+/i.test(lower)) return "Ông";
  if (/^(bà|ba)\s+/i.test(lower)) return "Bà";
  if (/^(anh|a\.?)\s+/i.test(lower)) return "Anh";
  if (/^(chị|chi|c\.?)\s+/i.test(lower)) return "Chị";

  const g = customer.gender;
  if (g !== null && g !== undefined && g !== "") {
    const gStr = String(g).trim().toLowerCase();
    if (gStr === "0" || gStr === "male" || gStr === "nam" || gStr === "m") {
      return "Anh";
    }
    if (gStr === "1" || gStr === "female" || gStr === "nữ" || gStr === "nu" || gStr === "f") {
      return "Chị";
    }
  }

  const words = lower.split(/\s+/);
  const lastWord = words[words.length - 1] || "";

  const femaleMiddleOrGiven = new Set([
    "thị", "thi", "ngọc", "ngoc", "bích", "bich", "thu", "xuân", "xuan",
    "hương", "huong", "trang", "lan", "ánh", "anh", "thủy", "thuy", "tiên", "tien",
    "hoa", "hằng", "hang", "phương", "phuong", "thảo", "thao", "nhi", "vy",
    "quỳnh", "quynh", "dung", "hiền", "hien", "nhung", "tuyền", "tuyen",
    "tuyết", "tuyet", "mai", "cúc", "cuc", "trúc", "truc", "đào", "dao",
    "yến", "yen", "oanh", "loan", "diệp", "diep", "hạnh", "hanh", "kiều", "kieu",
    "diễm", "diem", "trinh", "thư", "thu", "uyên", "uyen", "ngân", "ngan",
    "vân", "van", "lệ", "le", "nữ", "nu", "nga", "ngà", "huệ", "hue", "liên", "lien",
  ]);
  const maleMiddleOrGiven = new Set([
    "văn", "van", "hữu", "huu", "đức", "duc", "mạnh", "manh", "quang", "duy",
    "hùng", "hung", "tuấn", "tuan", "dũng", "dung", "cường", "cuong", "thắng", "thang",
    "thành", "thanh", "long", "quân", "quan", "kiên", "kien", "trung", "hiếu", "hieu",
    "sơn", "son", "tùng", "tung", "hoàng", "hoang", "nam", "việt", "viet",
    "khang", "khôi", "khoi", "đạt", "dat", "phát", "phat", "thịnh", "thinh",
    "toàn", "toan", "vũ", "vu", "vinh", "nghĩa", "nghia", "trọng", "trong", "huy", "khánh", "khanh",
  ]);

  if (words.includes("thị") || words.includes("thi") || femaleMiddleOrGiven.has(lastWord)) {
    return "Chị";
  }
  if (
    words.includes("văn") ||
    words.includes("van") ||
    words.includes("hữu") ||
    words.includes("huu") ||
    words.includes("đức") ||
    words.includes("duc") ||
    words.includes("mạnh") ||
    words.includes("manh") ||
    words.includes("quang") ||
    words.includes("duy") ||
    maleMiddleOrGiven.has(lastWord)
  ) {
    return "Anh";
  }

  return "Anh/Chị";
}

function enrichRecipientFromZaloMetaCache(recipient) {
  if (!recipient || (recipient.gender !== null && recipient.gender !== undefined)) {
    return recipient;
  }
  try {
    const uid = String(recipient.zaloUid || recipient.id || "").trim();
    if (!uid) return recipient;
    const homes = recipient.zaloHome
      ? [recipient.zaloHome]
      : getAllActiveZaloHomes().map((h) => h.homeDir);
    if (!globalThis.__ADDP_ZALO_META_GENDER_CACHE__) {
      globalThis.__ADDP_ZALO_META_GENDER_CACHE__ = new Map();
    }
    for (const hDir of homes) {
      if (!hDir) continue;
      let cached = globalThis.__ADDP_ZALO_META_GENDER_CACHE__.get(hDir);
      if (!cached || Date.now() - cached.ts > 60000) {
        const metaPath = path.join(hDir, ".zalo-agent-cli", "crm-meta-cache.json");
        const map = new Map();
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          for (const f of meta?.friends || []) {
            if (f?.userId) map.set(String(f.userId), f);
          }
        }
        cached = { ts: Date.now(), map };
        globalThis.__ADDP_ZALO_META_GENDER_CACHE__.set(hDir, cached);
      }
      const friend = cached.map.get(uid);
      if (friend && friend.gender !== null && friend.gender !== undefined) {
        return {
          ...recipient,
          gender: friend.gender,
          fullName: friend.alias || recipient.fullName,
        };
      }
    }
  } catch {}
  return recipient;
}

/**
 * Module 2.2: Thuật toán AI Spin Text & Cá nhân hóa
 * - Xử lý cú pháp spin text dạng `{chào anh|em chào chị|chào mình|dạ em chào}` hoặc `{chào anh/em chào chị}`
 * - Thay thế biến động: `{fullName}`, `{firstName}`, `{phone}`, `{assignedStaff}`, `{productName}`
 * - Nếu tin nhắn chưa có biến thể `{...|...}`, tự động dùng AI sinh 4-5 phiên bản câu văn đồng nghĩa để tránh lọc spam
 */
export function spinAndPersonalizeText(template = "", customer = {}) {
  let text = String(template || "").trim();
  if (!text) return "";

  const fullName = customer.fullName || customer.name || "Anh/Chị";
  const firstName = extractFirstName(fullName);
  const genderSalutation = resolveGenderSalutation(customer);
  const phone = customer.phone || "";
  const assignedStaff =
    customer.assignedStaff || customer.staffName || "Dược sĩ Thảo";
  const productName = customer.productName || "Sữa hạt Glucare Plus";

  // 1. Thay thế các biến cá nhân hóa trước (để không xung đột với ngoặc nhọn spin text)
  text = text
    .replace(/\{fullName\}/gi, fullName)
    .replace(/\{name\}/gi, fullName)
    .replace(/\{firstName\}/gi, firstName)
    .replace(/\{gender\}/gi, genderSalutation)
    .replace(/\{xungHo\}/gi, genderSalutation)
    .replace(/\{phone\}/gi, phone)
    .replace(/\{assignedStaff\}/gi, assignedStaff)
    .replace(/\{productName\}/gi, productName);

  // 2. Chỉ xử lý Spin Text `{a|b}` nếu người dùng chủ động viết cú pháp Spin trong mẫu
  // Tuyệt đối giữ nguyên 100% nội dung gốc người dùng đã soạn, không tự ý chèn thêm câu chào hay câu kết
  const spinRegex = /\{([^{}]*[|/][^{}]*)\}/g;
  if (spinRegex.test(text)) {
    text = text.replace(/\{([^{}]*[|/][^{}]*)\}/g, (_, group) => {
      const delimiter = group.includes("|") ? "|" : "/";
      const options = group
        .split(delimiter)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length === 0) return "";
      const randomIdx = Math.floor(Math.random() * options.length);
      return options[randomIdx];
    });
  }

  return text.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Sinh mẫu Spin Text tự động bằng AI cho nút "✨ AI Sinh Biến Thể Spin Text" trên UI
 */
export function generateAiSpinTemplate(rawTemplate = "") {
  const clean = String(rawTemplate || "").trim();
  if (!clean) {
    return "{Dạ em Thảo chào|Em chào|Dạ kính chào|Chào mình} {fullName} ạ! {Dược sĩ ADDP|Em Thảo bên Dược phẩm ADDP|Chuyên viên tư vấn {assignedStaff}} xin phép {hỏi thăm sức khỏe|nhắn nhắc lịch chăm sóc} cho mình hôm nay. Anh/chị nhớ {duy trì uống đều đặn|sử dụng đúng liều lượng} theo hướng dẫn để {đường huyết và sức khỏe luôn ổn định|cơ thể khỏe khoắn nhất} nhé ạ! {Chúc mình ngày mới nhiều niềm vui|Cần hỗ trợ gì anh/chị cứ nhắn lại cho em nha}!";
  }

  // Nếu người dùng đã gõ câu thường, chuyển hóa các cụm từ phổ biến sang dạng Spin Text {a|b|c}
  let spun = clean;
  if (!/\{[^{}]*[|/][^{}]*\}/.test(spun)) {
    spun = spun
      .replace(/^(Dạ\s+)?(Em\s+)?Chào\s+/i, "{Dạ em chào|Em Thảo chào|Dạ kính chào|Chào} ")
      .replace(/Dược sĩ ADDP/gi, "{Dược sĩ ADDP|Chuyên viên y khoa {assignedStaff}|Em Thảo bên ADDP}")
      .replace(/sức khỏe/gi, "{sức khỏe|thể trạng|chỉ số sức khỏe}")
      .replace(/uống đều đặn/gi, "{uống đều đặn|duy trì đúng giờ|dùng đúng liệu trình}")
      .replace(/ổn định/gi, "{ổn định|bình ổn tốt|cải thiện tích cực}");

    if (!/\{[^{}]*\|[^{}]*\}/.test(spun)) {
      spun = `{Dạ em Thảo chào|Em chào|Dạ kính chào} {fullName} ạ, ${spun} {Chúc mình luôn nhiều sức khỏe nhé ạ|Cần tư vấn thêm anh/chị nhắn lại cho em nha|Em luôn sẵn sàng đồng hành cùng mình ạ}!`;
    }
  }
  return spun;
}

/**
 * Tính số tin nhắn đã gửi trong ngày hôm nay của 1 tài khoản kênh (phục vụ Hard Limit 150 tin/ngày)
 */
export function getSentCountTodayForChannel(channelId = "ZALO_PERSONAL") {
  const store = getCampaignStore();
  const todayStr = new Date().toISOString().slice(0, 10);
  let count = 0;

  for (const camp of store) {
    if (String(camp.channelId || camp.channel) !== String(channelId)) continue;
    const logs = Array.isArray(camp.logs) ? camp.logs : [];
    for (const log of logs) {
      if (
        log.status === "SUCCESS" &&
        String(log.timestamp || "").startsWith(todayStr)
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function randomDelay(minMs = 45000, maxMs = 120000) {
  const low = Math.min(minMs, maxMs);
  const high = Math.max(minMs, maxMs);
  return Math.floor(low + Math.random() * (high - low + 1));
}

/**
 * Module 3: Đấu nối gửi tin thực tế theo từng nền tảng (Zalo Cá Nhân, Fanpage FB, Zalo OA)
 */
async function dispatchPlatformBroadcastMessage(campaign, customer, renderedText) {
  const channel = String(campaign.channel || "ZALO_PERSONAL").toUpperCase();

  if (isSafePilotMode()) {
    console.log(
      `[PILOT_SAFE_MODE] Giả lập Broadcast gửi tới ${customer.phone || customer.fullName}: "${renderedText.slice(0, 60)}"`
    );
    return {
      ok: true,
      mocked: true,
      note: "[PILOT_SAFE_MODE] Giả lập gửi tin broadcast an toàn thành công (Mock)",
    };
  }

  // Nếu chạy ở chế độ kiểm thử Mock Send (để test luồng chiến dịch mà không bắn tin thật ra ngoài)
  if (campaign.mockMode === true) {
    // Vẫn kiểm tra quy tắc an toàn nền tảng (như Meta 24h) nếu khách có đánh dấu quá 24h
    if (channel === "FACEBOOK" && customer.lastInteractionTime) {
      const elapsedHours =
        (Date.now() - new Date(customer.lastInteractionTime).getTime()) / 3600000;
      if (elapsedHours > 24 && !campaign.useMessageTag) {
        return {
          ok: false,
          skipped: true,
          reason: "Bỏ qua do vi phạm luật Meta 24h",
        };
      }
    }
    return {
      ok: true,
      note: `[Mock Send] Đã gửi thành công qua ${channel}`,
    };
  }

  // 1. Đối với Zalo Cá nhân (Gửi qua hàng đợi giãn cách Anti-Ban 45-120s theo Điều 4 AGENTS.md)
  if (channel === "ZALO_PERSONAL" || channel === "ZALO") {
    const recipient = String(
      customer.zaloUid || customer.zaloThreadId || customer.threadId || customer.phone || ""
    ).trim();
    const recipientPhone = String(customer.phone || "").trim();

    if (!recipient && !recipientPhone) {
      return {
        ok: false,
        skipped: true,
        reason: "Bỏ qua: Khách hàng chưa có SĐT hoặc Zalo ID",
      };
    }

    let targetHome = customer.zaloHome || "";
    const activeHomes = getAllActiveZaloHomes();
    if (!targetHome && campaign.channelId && campaign.channelId !== "ALL") {
      const matchedHome = activeHomes.find(
        (h) =>
          String(h.ownId || "") === String(campaign.channelId) ||
          String(h.accountId || "") === String(campaign.channelId) ||
          String(h.name || "").toLowerCase() === String(campaign.accountName || "").toLowerCase()
      );
      if (matchedHome?.homeDir) targetHome = matchedHome.homeDir;
    }
    // Phân tải Round-Robin qua tất cả các nick Zalo đang hoạt động khi chọn ALL hoặc bật multiAccountLoadBalance cho khách có SĐT
    if (
      !targetHome &&
      activeHomes.length > 1 &&
      (campaign.channelId === "ALL" || campaign.multiAccountLoadBalance) &&
      recipientPhone
    ) {
      const rrIndex = (Number(campaign.sentCount) || 0) % activeHomes.length;
      targetHome = activeHomes[rrIndex]?.homeDir || "";
    }
    if (!targetHome) {
      const resolved = resolveZaloHomeForThread(recipient || recipientPhone, "", campaign.channelId || "");
      targetHome = typeof resolved === "string" ? resolved : resolved?.homeDir || activeHomes[0]?.homeDir || "";
    }

    if (!targetHome) {
      return {
        ok: false,
        error: "Không tìm thấy tài khoản Zalo Cá Nhân đang hoạt động để gửi tin.",
      };
    }

    const res = await sendZaloMessageDirect({
      homeDir: targetHome,
      recipient,
      recipientPhone,
      message: renderedText,
    });

    if (!res?.ok) {
      return {
        ok: false,
        error: res?.error || "Không thể gửi tin nhắn qua Zalo Cá Nhân.",
      };
    }

    return {
      ok: true,
      note: "Đã gửi qua Zalo Cá Nhân (Anti-Ban 45-120s)",
    };
  }

  // 2. Đối với Fanpage Facebook (Meta Graph API)
  if (channel === "FACEBOOK") {
    const psid = customer.facebookId || customer.psid || "";
    if (!psid) {
      return {
        ok: false,
        skipped: true,
        reason: "Bỏ qua: Khách hàng chưa có Facebook PSID",
      };
    }

    const allChannels = listAllChannels();
    const fbCh = allChannels.find(
      (c) =>
        c.platform === "FACEBOOK" &&
        c.config?.pageAccessToken &&
        (!campaign.channelId || String(c.id) === String(campaign.channelId) || String(c.config.pageId) === String(campaign.channelId))
    );

    const token = fbCh?.config?.pageAccessToken || process.env.META_TEST_PAGE_ACCESS_TOKEN || "";
    const pageId = fbCh?.config?.pageId || process.env.META_TEST_PAGE_ID || "";

    const res = await sendMetaFacebookMessage({
      pageId,
      pageAccessToken: token,
      recipientPsid: psid,
      text: renderedText,
      staffId: campaign.operator || "BROADCAST_OPERATOR",
      staffName: "Tự động Broadcast (Meta Graph API)",
      staffConfirmed: true,
      messageTag: campaign.useMessageTag ? (campaign.messageTag || "POST_PURCHASE_UPDATE") : "",
    });

    if (res.ok) {
      return {
        ok: true,
        note: `Đã gửi qua Meta Graph API (MsgID: ${res.messageId})`,
      };
    }
    return { ok: false, error: res.error || "Meta Graph API từ chối gửi tin." };
  }

  // 3. Đối với Zalo OA (Zalo OpenAPI v3)
  if (channel === "ZALO_OA") {
    const userId = customer.zaloOaUserId || customer.oaUserId || customer.phone || "";
    if (!userId) {
      return {
        ok: false,
        skipped: true,
        reason: "Bỏ qua: Khách hàng chưa có Zalo OA User ID",
      };
    }

    const allChannels = listAllChannels();
    const oaCh = allChannels.find(
      (c) =>
        (c.platform === "ZALO_OA" || c.type === "zalo_oa") &&
        (c.config?.accessToken || c.config?.oaId)
    );

    const token = oaCh?.config?.accessToken || process.env.ZALO_OA_TEST_ACCESS_TOKEN || "";
    const oaId = oaCh?.config?.oaId || process.env.ZALO_OA_TEST_ID || "";

    const res = await sendZaloOaMessage({
      oaId,
      accessToken: token,
      recipientUserId: userId,
      text: renderedText,
      staffId: campaign.operator || "BROADCAST_OPERATOR",
      staffName: "Tự động Broadcast (Zalo OpenAPI)",
      staffConfirmed: true,
    });

    if (res.ok) {
      return {
        ok: true,
        note: `Đã gửi qua Zalo OpenAPI (MsgID: ${res.messageId})`,
      };
    }
    return { ok: false, error: res.error || "Zalo OpenAPI từ chối gửi tin." };
  }

  // 4. Đối với TikTok Shop & Shopee
  if (channel === "TIKTOK_SHOP" || channel === "TIKTOK" || channel === "SHOPEE") {
    const recipientId = String(customer.id || customer.phone || "");
    if (!recipientId) {
      return {
        ok: false,
        skipped: true,
        reason: `Bỏ qua: Khách hàng chưa có định danh hội thoại ${channel}`,
      };
    }
    const res = await sendUnifiedMessage({
      channel: channel === "TIKTOK" ? "TIKTOK_SHOP" : channel,
      recipientId,
      shopId: campaign.channelId && campaign.channelId !== "ALL" ? campaign.channelId : undefined,
      message: renderedText,
    });
    if (res?.ok) {
      return {
        ok: true,
        note: `Đã gửi qua ${channel}`,
      };
    }
    return { ok: false, error: res?.error || `Không thể gửi tin nhắn qua ${channel}.` };
  }

  return { ok: false, error: `Kênh không hợp lệ: ${channel}` };
}

/**
 * Module 2.3: Hàng đợi gửi tin nền (Queue Runner)
 * - Chạy nền gửi từng tin với độ trễ ngẫu nhiên 45s - 120s
 * - Giới hạn cứng 150 tin/tài khoản Zalo/ngày
 * - Kiểm tra cờ trạng thái PAUSED / CANCELLED trước mỗi lần gửi và trong suốt thời gian chờ
 */
export async function runCampaignQueue(campaignId) {
  const cid = String(campaignId);
  if (globalThis.__addpActiveRunners.get(cid)) {
    return; // Đang có worker chạy cho chiến dịch này
  }

  globalThis.__addpActiveRunners.set(cid, true);

  try {
    while (true) {
      const store = getCampaignStore();
      const campaign = store.find((c) => String(c.id) === cid);
      if (!campaign) break;

      // Kiểm tra cờ trạng thái trước mỗi lần gửi
      if (campaign.status !== "RUNNING") {
        campaign.nextSendInSec = null;
        saveCampaignsToDisk(store);
        break;
      }

      // Kiểm tra giới hạn tin/ngày (nếu người dùng đặt giới hạn cụ thể lớn hơn tổng số người nhận của chiến dịch)
      const channelKey = campaign.channelId || campaign.channel || "ZALO_PERSONAL";
      const sentToday = getSentCountTodayForChannel(channelKey);
      const configuredLimit = Number(campaign.dailyLimit) || 0;
      const effectiveHardLimit =
        configuredLimit > 0
          ? Math.max(configuredLimit, Number(campaign.totalRecipients) || 0)
          : Math.max(5000, Number(campaign.totalRecipients) || 5000);

      if (sentToday >= effectiveHardLimit) {
        campaign.status = "PAUSED";
        campaign.pauseReason = `Đạt giới hạn ${effectiveHardLimit} tin/ngày`;
        campaign.nextSendInSec = null;
        campaign.updatedAt = new Date().toISOString();
        saveCampaignsToDisk(store);
        break;
      }

      // Tìm lô người nhận tiếp theo đang ở trạng thái PENDING
      // Hỗ trợ gửi song song đa luồng (Parallel Batch) cho Fanpage/Zalo OA hoặc khi gửi Đa Nick Zalo (ALL)
      const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];
      const isOfficialApiChannel =
        campaign.channel === "FACEBOOK" ||
        campaign.channel === "ZALO_OA" ||
        campaign.channel === "TIKTOK_SHOP" ||
        campaign.channel === "SHOPEE";
      const activeZaloCount = Math.max(1, getAllActiveZaloHomes().length);
      const batchConcurrency = campaign.mockMode
        ? 5
        : Number(campaign.concurrency) > 1
        ? Number(campaign.concurrency)
        : isOfficialApiChannel
        ? 4
        : campaign.channelId === "ALL" || campaign.multiAccountLoadBalance
        ? Math.min(activeZaloCount, 8)
        : 1;

      const nextBatch = [];
      const usedAccountsInBatch = new Set();
      for (const r of recipients) {
        if (r.status !== "PENDING") continue;
        if (batchConcurrency === 1) {
          nextBatch.push(r);
          break;
        }
        const accKey = String(r.accountId || r.zaloHome || "");
        if (accKey && usedAccountsInBatch.has(accKey) && !isOfficialApiChannel) {
          continue; // Mỗi nick Zalo chỉ gửi 1 tin trong cùng 1 nhịp song song để bảo vệ nick
        }
        if (accKey) usedAccountsInBatch.add(accKey);
        nextBatch.push(r);
        if (nextBatch.length >= batchConcurrency) break;
      }

      if (nextBatch.length === 0) {
        const fallbackNext = recipients.find((r) => r.status === "PENDING");
        if (fallbackNext) {
          nextBatch.push(fallbackNext);
        }
      }

      if (nextBatch.length === 0) {
        campaign.status = "COMPLETED";
        campaign.nextSendInSec = null;
        campaign.completedAt = new Date().toISOString();
        campaign.updatedAt = new Date().toISOString();
        saveCampaignsToDisk(store);
        break;
      }

      // Thực thi gửi đồng thời các tin trong batch (mỗi nick / mỗi kết nối API chạy song song)
      await Promise.all(
        nextBatch.map(async (rawRecipient) => {
          const nextRecipient = enrichRecipientFromZaloMetaCache(rawRecipient);
          const renderedText = spinAndPersonalizeText(campaign.templateText, nextRecipient);
          let dispatchRes;
          try {
            dispatchRes = await dispatchPlatformBroadcastMessage(
              campaign,
              nextRecipient,
              renderedText
            );
          } catch (dispatchErr) {
            console.error("[BROADCAST_DISPATCH_ERR]", dispatchErr);
            dispatchRes = {
              ok: false,
              error: dispatchErr?.message || "Lỗi gửi tin nhắn không xác định",
            };
          }

          const nowIso = new Date().toISOString();
          if (dispatchRes.ok) {
            nextRecipient.status = "SUCCESS";
            nextRecipient.sentAt = nowIso;
            nextRecipient.renderedText = renderedText;
            campaign.sentCount = (Number(campaign.sentCount) || 0) + 1;
          } else if (dispatchRes.skipped) {
            nextRecipient.status = "SKIPPED";
            nextRecipient.sentAt = nowIso;
            nextRecipient.note = dispatchRes.reason;
            campaign.skippedCount = (Number(campaign.skippedCount) || 0) + 1;
            campaign.failedCount = (Number(campaign.failedCount) || 0) + 1;
          } else {
            nextRecipient.status = "FAILED";
            nextRecipient.sentAt = nowIso;
            nextRecipient.note = dispatchRes.error;
            campaign.failedCount = (Number(campaign.failedCount) || 0) + 1;
          }

          if (!Array.isArray(campaign.logs)) campaign.logs = [];
          campaign.logs.unshift({
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: nowIso,
            customerName: nextRecipient.fullName || "Khách hàng",
            phone: nextRecipient.phone || "",
            maskedPhone: maskPhoneMiddle(nextRecipient.phone),
            channel: nextRecipient.channelLabel || campaign.channel || "ZALO_PERSONAL",
            renderedText,
            status: nextRecipient.status,
            note:
              dispatchRes.note ||
              dispatchRes.reason ||
              dispatchRes.error ||
              "Thành công",
          });

          campaign.lastSentAt = nowIso;
          campaign.updatedAt = nowIso;
        })
      );

      saveCampaignsToDisk(store);

      // Kiểm tra xem còn khách hàng PENDING tiếp theo không
      const hasMorePending = recipients.some((r) => r.status === "PENDING");
      if (!hasMorePending) {
        campaign.status = "COMPLETED";
        campaign.nextSendInSec = null;
        campaign.completedAt = new Date().toISOString();
        saveCampaignsToDisk(store);
        break;
      }

      // Chờ giãn cách thông minh:
      // - Tôn trọng chính xác khoảng giãn cách (speedRange) người dùng cấu hình (từ 1s trở lên)
      // - Nếu gửi tốc độ nhanh trên 1 nick Zalo (< 15s/tin), tự động chèn nhịp nghỉ ngắn 20s sau mỗi 25 tin (Burst & Rest) để chống quét robot
      const speedRange = Array.isArray(campaign.speedRange) ? campaign.speedRange : [15, 30];
      const minSec = Math.max(1, Number(speedRange[0]) || 3);
      const maxSec = Math.max(minSec, Number(speedRange[1]) || minSec + 2);
      const minMs = campaign.mockMode && campaign.mockDelayMs
        ? Number(campaign.mockDelayMs)
        : minSec * 1000;
      const maxMs = campaign.mockMode && campaign.mockDelayMs
        ? Number(campaign.mockDelayMs) + 400
        : maxSec * 1000;

      let totalWaitMs = randomDelay(minMs, maxMs);
      if (
        !isOfficialApiChannel &&
        !campaign.mockMode &&
        minSec < 15 &&
        (Number(campaign.sentCount) || 0) > 0 &&
        (Number(campaign.sentCount) || 0) % 25 === 0
      ) {
        totalWaitMs += randomDelay(18000, 28000);
      }

      if (totalWaitMs >= 2000) {
        let remainingSec = Math.ceil(totalWaitMs / 1000);
        campaign.nextSendInSec = remainingSec;
        saveCampaignsToDisk(store);

        while (remainingSec > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          remainingSec -= 1;
          const latestCamp = getCampaignStore().find((c) => String(c.id) === cid);
          if (!latestCamp || latestCamp.status !== "RUNNING") {
            if (latestCamp) {
              latestCamp.nextSendInSec = null;
              saveCampaignsToDisk(getCampaignStore());
            }
            break;
          }
          latestCamp.nextSendInSec = remainingSec;
        }
      } else {
        campaign.nextSendInSec = 1;
        await new Promise((r) => setTimeout(r, totalWaitMs));
      }
    }
  } finally {
    globalThis.__addpActiveRunners.delete(cid);
  }
}

export function ensureBroadcastSchedulerStarted() {
  if (globalThis.__addpBroadcastSchedulerStarted) return;
  globalThis.__addpBroadcastSchedulerStarted = true;

  const checkScheduledCampaigns = () => {
    try {
      const store = getCampaignStore();
      const nowMs = Date.now();
      let changed = false;

      for (const camp of store) {
        if (camp.status === "SCHEDULED" && camp.scheduledAt) {
          const targetMs = new Date(camp.scheduledAt).getTime();
          if (Number.isFinite(targetMs) && targetMs <= nowMs) {
            camp.status = "RUNNING";
            camp.updatedAt = new Date().toISOString();
            camp.pauseReason = null;
            changed = true;
            runCampaignQueue(camp.id).catch((err) => {
              console.error("[BROADCAST_SCHEDULE_TRIGGER_ERR]", err);
            });
          }
        }
      }

      if (changed) {
        saveCampaignsToDisk(store);
      }
    } catch (err) {
      console.error("[BROADCAST_SCHEDULER_TICK_ERR]", err.message);
    }
  };

  setInterval(checkScheduledCampaigns, 15000);
}

/**
 * Lấy danh sách toàn bộ các chiến dịch kèm phần trăm tiến độ realtime
 */
export function getAllBroadcastCampaigns() {
  ensureBroadcastSchedulerStarted();
  const store = getCampaignStore();
  return store.map((c) => {
    const total = Number(c.totalRecipients) || 0;
    const processed = (Number(c.sentCount) || 0) + (Number(c.failedCount) || 0);
    const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    return {
      ...c,
      progressPercent,
    };
  });
}

export function getBroadcastCampaignById(id) {
  const all = getAllBroadcastCampaigns();
  return all.find((c) => String(c.id) === String(id)) || null;
}

export function isPersistentQueueAvailable() {
  return process.env.MYSQL_PERSISTENT_QUEUE_ENABLED === "true";
}

/**
 * Tạo chiến dịch Broadcast mới (Module 2.1 & 2.4)
 */
export function createBroadcastCampaign(input = {}) {
  const includeTags = Array.isArray(input.tags)
    ? input.tags
    : Array.isArray(input.includeTags)
    ? input.includeTags
    : input.targetTag && input.targetTag !== "Tất cả"
    ? [input.targetTag]
    : [];
  const excludeTags = Array.isArray(input.excludeTags)
    ? input.excludeTags
    : ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"];
  const channel = String(input.channel || input.channelType || "ZALO_PERSONAL").toUpperCase();

  // Tuân thủ Điều 4 AGENTS.md: Zalo cá nhân luôn giãn cách tối thiểu 45-120s và tối đa 70 tin/ngày/nick
  if ((channel === "ZALO_PERSONAL" || channel === "ZALO") && !input.mockMode) {
    const activeHomes = getAllActiveZaloHomes();
    if (activeHomes.length === 0 && !hasExistingZaloConnection()) {
      throw new Error("Chưa có tài khoản Zalo Cá Nhân nào đang kết nối để gửi hàng loạt.");
    }
  }
  const operator = input.operator === "OR" ? "OR" : "AND";
  const audienceSource =
    input.audienceSource || (includeTags.length > 0 ? "BY_TAG" : "ZALO_FRIENDS");

  // Lấy danh sách người nhận từ bộ lọc thẻ hoặc từ customRecipients (khi chạy test / chọn thủ công)
  let recipientsList = [];
  if (Array.isArray(input.customRecipients) && input.customRecipients.length > 0) {
    recipientsList = input.customRecipients;
  } else if (Array.isArray(input.recipients) && input.recipients.length > 0) {
    recipientsList = input.recipients;
  } else {
    const targetAcc =
      input.targetAccount && input.targetAccount !== "ALL"
        ? input.targetAccount
        : input.channelId && input.channelId !== channel && input.channelId !== "ALL"
        ? input.channelId
        : "ALL";
    const audienceResult = resolveBroadcastAudience({
      audienceSource,
      includeTags,
      excludeTags,
      channel,
      operator,
      targetAccount: targetAcc,
      productFilter: input.productFilter || "ALL",
      categoryFilter: input.categoryFilter || "ALL",
      searchQuery: input.searchQuery || "",
    });
    recipientsList = audienceResult.allMatched || [];
    if (Array.isArray(input.selectedRecipientIds) && input.selectedRecipientIds.length > 0) {
      const selectedSet = new Set(input.selectedRecipientIds.map((id) => String(id)));
      recipientsList = recipientsList.filter((r) => selectedSet.has(String(r.id)));
    }
  }

  const mappedRecipients = recipientsList.map((cust) => ({
    id: cust.id,
    fullName: cust.fullName || cust.name || "Khách hàng",
    gender: cust.gender ?? null,
    phone: cust.phone || "",
    maskedPhone: cust.maskedPhone || maskPhoneMiddle(cust.phone),
    tags: Array.isArray(cust.tags) ? cust.tags : [],
    assignedStaff: cust.staffName || cust.assignedStaff || "Dược sĩ Thảo",
    zaloUid: cust.zaloUid || cust.zaloThreadId || null,
    accountId: cust.accountId || "",
    zaloHome: cust.zaloHome || "",
    channelLabel: cust.channelLabel || cust.channel || "",
    facebookId: cust.facebookId || cust.psid || null,
    lastInteractionTime: cust.lastInteractionTime || cust.updatedAt || cust.createdAt || null,
    hasExistingThread: Boolean(cust.hasExistingThread ?? true),
    status: "PENDING",
    sentAt: null,
    renderedText: "",
    note: "Đang chờ trong hàng đợi",
  }));

  if (mappedRecipients.length === 0) {
    throw new Error(
      "Tệp khách hàng nhận tin đang rỗng (0 khách hàng). Vui lòng chọn tệp 'Tất cả bạn bè Zalo' hoặc gắn thẻ cho khách hàng trước khi chạy chiến dịch."
    );
  }

  const speedRange =
    Array.isArray(input.speedRange) && input.speedRange.length === 2
      ? [
          Math.max(1, Number(input.speedRange[0]) || 3),
          Math.max(1, Number(input.speedRange[1]) || 5),
        ]
      : [3, 6];

  const autoStart = input.autoStart !== false;
  const scheduledTs =
    input.scheduleEnabled && input.scheduledAt
      ? new Date(input.scheduledAt).getTime()
      : NaN;
  const isScheduledFuture =
    Number.isFinite(scheduledTs) && scheduledTs > Date.now() + 10000;
  const initialStatus = isScheduledFuture
    ? "SCHEDULED"
    : autoStart
    ? "RUNNING"
    : "DRAFT";

  const nowIso = new Date().toISOString();
  const id = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newCampaign = {
    id,
    name: String(input.name || `Chiến dịch Chăm sóc #${id.slice(-4)}`).trim(),
    tags: includeTags,
    includeTags,
    excludeTags,
    operator,
    channel,
    channelId: input.channelId || channel,
    accountName:
      input.accountName ||
      (channel === "FACEBOOK"
        ? "Fanpage Dược Phẩm ADDP"
        : channel === "ZALO_OA"
        ? "Zalo OA Dược Phẩm ADDP"
        : "Zalo Cá Nhân (Sơn Tùng)"),
    templateText:
      input.templateText ||
      input.template ||
      "{Dạ em Thảo chào|Em chào|Dạ kính chào} {fullName} ạ, Dược sĩ ADDP xin phép hỏi thăm chỉ số đường huyết và sức khỏe của mình tuần này thế nào rồi ạ?",
    audienceSource,
    status: initialStatus,
    scheduledAt: isScheduledFuture ? new Date(scheduledTs).toISOString() : null,
    totalRecipients: mappedRecipients.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    speedRange,
    concurrency: Number(input.concurrency) || (channel === "FACEBOOK" || channel === "ZALO_OA" ? 4 : 1),
    multiAccountLoadBalance: Boolean(input.multiAccountLoadBalance),
    dailyLimit: Math.max(Number(input.dailyLimit) || 5000, mappedRecipients.length),
    useMessageTag: Boolean(input.useMessageTag),
    messageTag: input.messageTag || "POST_PURCHASE_UPDATE",
    useZnsTemplate: Boolean(input.useZnsTemplate),
    znsTemplateId: input.znsTemplateId || "ZNS_CARE_ADDP",
    mockMode: Boolean(input.mockMode),
    mockDelayMs: input.mockDelayMs ? Number(input.mockDelayMs) : null,
    nextSendInSec: null,
    pauseReason: null,
    recipients: mappedRecipients,
    logs: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  ensureBroadcastSchedulerStarted();
  const store = getCampaignStore();
  store.unshift(newCampaign);
  saveCampaignsToDisk(store);

  if (newCampaign.status === "RUNNING" && newCampaign.totalRecipients > 0) {
    runCampaignQueue(newCampaign.id).catch((err) => {
      console.error("[BROADCAST_AUTO_START_ERR]", err);
    });
  }

  return newCampaign;
}

/**
 * Điều khiển chiến dịch: start, pause, resume, cancel (Module 2.4)
 */
export function controlBroadcastCampaign(id, action = "pause", reason = "") {
  const store = getCampaignStore();
  const campaign = store.find((c) => String(c.id) === String(id));
  if (!campaign) return null;

  const act = String(action || "").toLowerCase();
  const nowIso = new Date().toISOString();

  if (act === "pause" || act === "paused") {
    campaign.status = "PAUSED";
    campaign.pauseReason = reason || "Tạm dừng bởi người dùng";
    campaign.nextSendInSec = null;
    campaign.updatedAt = nowIso;
    saveCampaignsToDisk(store);
    return campaign;
  }

  if (act === "cancel" || act === "cancelled") {
    campaign.status = "CANCELLED";
    campaign.pauseReason = reason || "Đã hủy chiến dịch";
    campaign.nextSendInSec = null;
    campaign.updatedAt = nowIso;
    saveCampaignsToDisk(store);
    return campaign;
  }

  if (act === "turbo" || act === "speedup") {
    campaign.speedRange = [2, 4];
    campaign.dailyLimit = Math.max(5000, Number(campaign.totalRecipients) || 5000);
    campaign.updatedAt = nowIso;
    saveCampaignsToDisk(store);
    return campaign;
  }

  if (act === "start" || act === "resume" || act === "running" || act === "processing") {
    campaign.status = "RUNNING";
    campaign.dailyLimit = Math.max(
      Number(campaign.dailyLimit) || 5000,
      Number(campaign.totalRecipients) || 5000
    );
    campaign.pauseReason = null;
    campaign.scheduledAt = null;
    campaign.updatedAt = nowIso;
    saveCampaignsToDisk(store);
    runCampaignQueue(campaign.id).catch((err) => {
      console.error("[BROADCAST_RESUME_ERR]", err);
    });
    return campaign;
  }

  return campaign;
}
