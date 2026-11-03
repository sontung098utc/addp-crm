/**
 * ADDP Omnichannel AI CRM — Smart Broadcast Queue (WBS-35)
 * Tuân thủ nghiêm ngặt Điều 4 - AGENTS.md (Luật Bảo vệ Tài khoản Zalo Cá Nhân & Đa Kênh):
 * 1. Giãn cách ngẫu nhiên 45 – 120 giây giữa 2 tin nhắn trên cùng 1 tài khoản Zalo.
 * 2. Kiểm tra hạn mức dailyMsgTarget (tối đa 70 tin chủ động/ngày/nick để không bị khóa).
 * 3. Cá nhân hóa biến {fullName}, {productName} và AI biến thiên câu chữ chống spam.
 */

// Bộ nhớ động lưu trữ các chiến dịch gửi tin hàng loạt
let dynamicCampaignsStore = [
  {
    id: "camp_001",
    name: "Nhắc Lịch Uống Sữa Đều Đặn Đầu Tháng",
    channelType: "ZALO_PERSONAL",
    accountName: "Sơn Tùng (Zalo Cá Nhân)",
    template: "Chào {fullName}, đầu tháng Dược sĩ ADDP chúc mình và gia đình nhiều sức khỏe! Nhớ duy trì uống 2 ly sữa hạt Glucare Plus mỗi ngày đúng giờ để đường huyết luôn ổn định anh/chị nhé!",
    targetTag: "Tiểu đường",
    totalRecipients: 25,
    sentCount: 18,
    pendingCount: 7,
    failedCount: 0,
    status: "PROCESSING", // 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED'
    minDelaySec: 45,
    maxDelaySec: 120,
    dailyLimit: 70,
    sentToday: 18,
    createdAt: "2026-11-03T08:00:00Z",
    lastSentAt: "2026-11-03T09:15:00Z",
  },
];

/**
 * Biến thiên ngẫu nhiên câu chào để tránh trùng lặp 100% nội dung (Anti-Spam)
 * @param {string} template
 * @param {object} recipient
 * @returns {string}
 */
export function personalizeAndParaphrase(template, recipient = {}) {
  const name = recipient.fullName || recipient.name || "Anh/Chị";
  const product = recipient.productName || "Sữa hạt Glucare Plus";

  const greetings = [
    `Dạ em chào ${name}!`,
    `Em chào ${name} ạ,`,
    `Chào ${name}, Dược sĩ ADDP nhắn gửi tới mình:`,
    `Dạ kính chào ${name}!`,
  ];
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  let content = template
    .replace(/\{fullName\}/g, name)
    .replace(/\{productName\}/g, product);

  // Nếu câu đầu bắt đầu bằng "Chào {fullName}", thay bằng greeting ngẫu nhiên
  if (content.startsWith("Chào ") || content.startsWith("Dạ chào ")) {
    content = content.replace(/^(Chào|Dạ chào)\s+[^,!\n]+[,!\n\s]*/i, "");
    content = `${randomGreeting} ${content}`;
  }

  return content;
}

/**
 * Lấy danh sách toàn bộ chiến dịch Broadcast
 */
export function getAllCampaigns() {
  return dynamicCampaignsStore;
}

/**
 * Tạo chiến dịch gửi tin hàng loạt mới (đưa vào Queue thông minh)
 * @param {object} input
 */
export function createBroadcastCampaign(input) {
  const nextId = `camp_${String(Date.now()).slice(-6)}`;
  const total = Number(input.totalRecipients) || 10;
  const minDelay = Math.max(45, Number(input.minDelaySec) || 45); // Tối thiểu 45s theo Điều 4
  const maxDelay = Math.max(minDelay, Number(input.maxDelaySec) || 120);

  const newCampaign = {
    id: nextId,
    name: input.name || `Chiến dịch gửi tin #${nextId}`,
    channelType: input.channelType || "ZALO_PERSONAL",
    accountName: input.accountName || "Sơn Tùng (Zalo Cá Nhân)",
    template: input.template || "Chào {fullName}, chúc anh/chị một ngày nhiều sức khỏe!",
    targetTag: input.targetTag || "Tất cả",
    totalRecipients: total,
    sentCount: 0,
    pendingCount: total,
    failedCount: 0,
    status: "PROCESSING",
    minDelaySec: minDelay,
    maxDelaySec: maxDelay,
    dailyLimit: 70, // Hạn mức tối đa 70 tin/ngày theo Điều 4
    sentToday: 0,
    createdAt: new Date().toISOString(),
    lastSentAt: null,
  };

  dynamicCampaignsStore.unshift(newCampaign);
  return newCampaign;
}

/**
 * Cập nhật trạng thái chiến dịch (PAUSE, RESUME, CANCEL)
 * @param {string} id
 * @param {string} status
 */
export function updateCampaignStatus(id, status) {
  const campaign = dynamicCampaignsStore.find((c) => c.id === id);
  if (!campaign) return null;
  campaign.status = status;
  return campaign;
}
