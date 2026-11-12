import fs from "fs";
import path from "path";
import { filterCustomersByTags, maskPhoneMiddle } from "./customerIdentityResolver.js";
import { resolveBroadcastAudience } from "./broadcastAudienceResolver.js";
import { sendTextMessage, hasExistingZaloConnection } from "./zaloRunner.js";
import { listAllChannels } from "./connectionHub.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT, isSafePilotMode } from "./pilotConfig.js";
import { sendMetaFacebookMessage } from "./adapters/metaFacebookAdapter.js";
import { sendZaloOaMessage } from "./adapters/zaloOaAdapter.js";

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
  } catch (err) {
    console.error("[BROADCAST_ENGINE_SAVE_ERR]", err.message);
  }
}

if (!globalThis.__addpBroadcastCampaigns) {
  globalThis.__addpBroadcastCampaigns = loadCampaignsFromDisk();
}
if (!globalThis.__addpActiveRunners) {
  globalThis.__addpActiveRunners = new Map();
}

function getCampaignStore() {
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
  const phone = customer.phone || "";
  const assignedStaff =
    customer.assignedStaff || customer.staffName || "Dược sĩ Thảo";
  const productName = customer.productName || "Sữa hạt Glucare Plus";

  // 1. Thay thế các biến cá nhân hóa trước (để không xung đột với ngoặc nhọn spin text)
  text = text
    .replace(/\{fullName\}/gi, fullName)
    .replace(/\{firstName\}/gi, firstName)
    .replace(/\{phone\}/gi, phone)
    .replace(/\{assignedStaff\}/gi, assignedStaff)
    .replace(/\{productName\}/gi, productName);

  // 2. Kiểm tra xem trong mẫu đã có cú pháp Spin Text `{a|b}` hoặc `{a/b}` hay chưa
  const spinRegex = /\{([^{}]*[|/][^{}]*)\}/g;
  const hasExplicitSpin = spinRegex.test(text);

  if (hasExplicitSpin) {
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
  } else {
    // 3. Nếu chưa có biến thể Spin Text, tự động dùng AI biến thiên 5 phiên bản mở đầu & kết câu đồng nghĩa
    const aiOpeners = [
      `Dạ em Thảo chào ${fullName} ạ, `,
      `Em chào ${fullName} nhé, `,
      `Dạ kính chào ${fullName}, `,
      `Chào ${fullName}, Dược sĩ tại ADDP nhắn mình chút ạ: `,
      `Dạ ${fullName} ơi, `,
    ];
    const aiClosers = [
      " Chúc mình và gia đình luôn dồi dào sức khỏe nhé ạ!",
      " Cần hỗ trợ kiểm tra chỉ số sức khỏe anh/chị cứ nhắn lại cho em nha!",
      " Chúc anh/chị một ngày mới thật nhiều niềm vui và bình an ạ!",
      " Nếu có thắc mắc nào trong quá trình sử dụng mình nhắn em hỗ trợ ngay nhé!",
      " Em cảm ơn anh/chị đã luôn tin tưởng đồng hành cùng Dược phẩm ADDP ạ!",
    ];

    const cleanedBody = text.replace(/^(dạ\s+)?(em\s+)?(kính\s+)?chào\s+[^,!.]+[,!.\s]*/i, "");
    const opener = aiOpeners[Math.floor(Math.random() * aiOpeners.length)];
    const closer = aiClosers[Math.floor(Math.random() * aiClosers.length)];
    text = `${opener}${cleanedBody}${closer}`;
  }

  return text.replace(/\s{2,}/g, " ").trim();
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

  // 1. Đối với Zalo Cá nhân:
  // Kênh Zalo Cá Nhân đang ở chế độ THỬ NGHIỆM (Experimental Connector). Tuyệt đối không bật gửi hàng loạt.
  if (channel === "ZALO_PERSONAL" || channel === "ZALO") {
    return {
      ok: false,
      skipped: true,
      reason: "Bỏ qua: Kênh Zalo Cá Nhân đang ở chế độ THỬ NGHIỆM (Experimental Connector). Nghiêm cấm gửi tin hàng loạt (Broadcast) theo Điều 4 AGENTS.md.",
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

      // Kiểm tra giới hạn cứng 150 tin/tài khoản Zalo/ngày
      const channelKey = campaign.channelId || campaign.channel || "ZALO_PERSONAL";
      const sentToday = getSentCountTodayForChannel(channelKey);
      const hardLimit = Number(campaign.dailyLimit) || HARD_DAILY_LIMIT_PER_ACCOUNT;

      if (sentToday >= hardLimit) {
        campaign.status = "PAUSED";
        campaign.pauseReason = `Đạt giới hạn an toàn ${hardLimit} tin/ngày`;
        campaign.nextSendInSec = null;
        campaign.updatedAt = new Date().toISOString();
        saveCampaignsToDisk(store);
        break;
      }

      // Tìm người nhận tiếp theo đang ở trạng thái PENDING
      const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];
      const nextRecipient = recipients.find((r) => r.status === "PENDING");

      if (!nextRecipient) {
        campaign.status = "COMPLETED";
        campaign.nextSendInSec = null;
        campaign.completedAt = new Date().toISOString();
        campaign.updatedAt = new Date().toISOString();
        saveCampaignsToDisk(store);
        break;
      }

      // Sinh nội dung Spin Text & Cá nhân hóa cho từng khách hàng
      const renderedText = spinAndPersonalizeText(campaign.templateText, nextRecipient);
      const dispatchRes = await dispatchPlatformBroadcastMessage(
        campaign,
        nextRecipient,
        renderedText
      );

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
        channel: campaign.channel || "ZALO_PERSONAL",
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

      // Chờ giãn cách ngẫu nhiên:
      // - Chế độ thật: await new Promise(r => setTimeout(r, randomDelay(45000, 120000)))
      // - Chế độ mock test nhanh: cho phép delay ngắn (ví dụ 800-1500ms) nếu mockDelayMs được truyền
      const speedRange = Array.isArray(campaign.speedRange) ? campaign.speedRange : [45, 120];
      const minMs = campaign.mockMode && campaign.mockDelayMs
        ? Number(campaign.mockDelayMs)
        : Math.max(45, Number(speedRange[0]) || 45) * 1000;
      const maxMs = campaign.mockMode && campaign.mockDelayMs
        ? Number(campaign.mockDelayMs) + 400
        : Math.max(minMs / 1000, Number(speedRange[1]) || 120) * 1000;

      const totalWaitMs = randomDelay(minMs, maxMs);

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

/**
 * Lấy danh sách toàn bộ các chiến dịch kèm phần trăm tiến độ realtime
 */
export function getAllBroadcastCampaigns() {
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

  // Kiểm tra cấm gửi hàng loạt qua Zalo cá nhân (Requirement 2)
  if ((channel === "ZALO_PERSONAL" || channel === "ZALO") && !input.mockMode) {
    throw new Error(
      "Kênh Zalo Cá Nhân đang ở chế độ THỬ NGHIỆM (Experimental Connector). Nghiêm cấm kích hoạt chiến dịch gửi tin hàng loạt qua Zalo cá nhân theo Điều 4 AGENTS.md."
    );
  }

  // Kiểm tra điều kiện tiên quyết cho gửi thật hàng loạt (Requirement 6)
  if (!input.mockMode && !isPersistentQueueAvailable()) {
    throw new Error(
      "Hệ thống Broadcast & Lên lịch gửi tin thật chưa được kích hoạt: Thiếu MySQL 8.0 bền vững và hàng đợi phân tán (Redis/BullMQ) trên staging. Hiện chỉ hỗ trợ gửi 1-1 do nhân viên chủ động xác nhận hoặc chạy chiến dịch ở chế độ Mô phỏng (Mock Mode)."
    );
  }
  const operator = input.operator === "OR" ? "OR" : "AND";
  const audienceSource =
    input.audienceSource || (includeTags.length > 0 ? "BY_TAG" : "ZALO_FRIENDS");

  // Lấy danh sách người nhận từ bộ lọc thẻ hoặc từ customRecipients (khi chạy test)
  let recipientsList = [];
  if (Array.isArray(input.customRecipients) && input.customRecipients.length > 0) {
    recipientsList = input.customRecipients;
  } else if (Array.isArray(input.recipients) && input.recipients.length > 0) {
    recipientsList = input.recipients;
  } else {
    const audienceResult = resolveBroadcastAudience({
      audienceSource,
      includeTags,
      excludeTags,
      channel,
      operator,
      targetAccount: input.channelId || input.accountName,
    });
    recipientsList = audienceResult.allMatched || [];
  }

  const mappedRecipients = recipientsList.map((cust) => ({
    id: cust.id,
    fullName: cust.fullName || cust.name || "Khách hàng",
    phone: cust.phone || "",
    maskedPhone: cust.maskedPhone || maskPhoneMiddle(cust.phone),
    tags: Array.isArray(cust.tags) ? cust.tags : [],
    assignedStaff: cust.staffName || cust.assignedStaff || "Dược sĩ Thảo",
    zaloUid: cust.zaloUid || cust.zaloThreadId || null,
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
      ? [Math.max(45, Number(input.speedRange[0]) || 45), Math.max(45, Number(input.speedRange[1]) || 120)]
      : [45, 120];

  const autoStart = input.autoStart !== false;
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
    status: autoStart ? "RUNNING" : "DRAFT",
    totalRecipients: mappedRecipients.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    speedRange,
    dailyLimit: HARD_DAILY_LIMIT_PER_ACCOUNT,
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

  if (act === "start" || act === "resume" || act === "running" || act === "processing") {
    if (!campaign.mockMode && !isSafePilotMode() && !isPersistentQueueAvailable()) {
      campaign.status = "PAUSED";
      campaign.pauseReason = "Chưa có MySQL 8.0 & Queue bền vững trên staging. Chỉ hỗ trợ gửi thử Mock Mode hoặc 1-1.";
      campaign.updatedAt = nowIso;
      saveCampaignsToDisk(store);
      return campaign;
    }

    campaign.status = "RUNNING";
    campaign.pauseReason = null;
    campaign.updatedAt = nowIso;
    saveCampaignsToDisk(store);
    runCampaignQueue(campaign.id).catch((err) => {
      console.error("[BROADCAST_RESUME_ERR]", err);
    });
    return campaign;
  }

  return campaign;
}
