import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Pure HTTP-REST Zalo Direct Send Worker
 * Gửi tin nhắn trực tiếp qua HTTP REST (zca-js sendMessage / findUser) với tốc độ cao (<300ms).
 * TUYỆT ĐỐI KHÔNG mở WebSocket listener (tránh làm gián đoạn MCP Daemon hoặc văng session Zalo).
 * Tự động phân giải Số Điện Thoại -> Zalo UID nếu người nhận được truyền vào dưới dạng SĐT.
 */

async function withTimeout(promise, ms, label = "timeout") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizePhoneDigits(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("84") && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT || "";
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  let recipient = String(process.env.SEND_RECIPIENT || "").trim();
  const recipientPhone = String(process.env.SEND_RECIPIENT_PHONE || "").trim();
  const messageText = String(process.env.SEND_MESSAGE || "").trim();
  const voiceUrl = String(process.env.SEND_VOICE_URL || "").trim();
  const threadType = Number(process.env.SEND_THREAD_TYPE || 0); // 0: DM, 1: Group

  if (!javisRoot || !homeDir) {
    console.log(JSON.stringify({ ok: false, error: "MISSING_ENV_CONFIG" }));
    process.exit(0);
  }

  if (!recipient && !recipientPhone) {
    console.log(JSON.stringify({ ok: false, error: "Vui lòng nhập ID người nhận hoặc Số điện thoại." }));
    process.exit(0);
  }

  if (!messageText) {
    console.log(JSON.stringify({ ok: false, error: "Nội dung tin nhắn không được để trống." }));
    process.exit(0);
  }

  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  const credPath = path.join(cliDir, "credentials");
  if (!fs.existsSync(credPath)) {
    console.log(JSON.stringify({ ok: false, error: "Tài khoản Zalo chưa có file credentials. Vui lòng đăng nhập lại." }));
    process.exit(0);
  }

  try {
    const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
    const { autoLogin, getApi, getOwnId, isLoggedIn } = await import(clientUrl);

    await withTimeout(autoLogin(true), 12000, "AUTO_LOGIN_TIMEOUT");
    if (!isLoggedIn()) {
      console.log(JSON.stringify({ ok: false, error: "Phiên đăng nhập Zalo đã hết hạn hoặc chưa đăng nhập. Vui lòng quét lại mã QR." }));
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");

    let targetUid = recipient;

    // Nếu gửi tin nhắn cá nhân (DM) và recipient có định dạng số điện thoại hoặc có recipientPhone
    if (threadType === 0) {
      const isPhoneLike = /^(\+?84|0)?\d{9,10}$/.test(recipient.replace(/[\s.-]/g, ""));
      const effectivePhone = isPhoneLike ? recipient : recipientPhone;
      const cleanVnPhone = normalizePhoneDigits(effectivePhone);

      // 1. Thử dò trong cache bạn bè cục bộ (crm-meta-cache.json) nhanh 0ms
      const metaPath = path.join(cliDir, "crm-meta-cache.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          const friends = Array.isArray(meta?.friends) ? meta.friends : [];
          const strangers = Array.isArray(meta?.strangers) ? meta.strangers : [];
          const allContacts = [...friends, ...strangers];

          if (cleanVnPhone) {
            const matched = allContacts.find((c) => {
              const p = normalizePhoneDigits(c.phoneNumber || c.phone || "");
              return p && p === cleanVnPhone;
            });
            if (matched && (matched.userId || matched.uid)) {
              targetUid = String(matched.userId || matched.uid);
            }
          }
        } catch {}
      }

      // 2. Nếu targetUid vẫn là dạng SĐT (chưa thành numeric UID 15+ số), gọi api.findUser để lấy UID thật
      if (/^(\+?84|0)?\d{9,10}$/.test(targetUid.replace(/[\s.-]/g, "")) && cleanVnPhone) {
        const p84 = cleanVnPhone.startsWith("0") ? `84${cleanVnPhone.slice(1)}` : cleanVnPhone;
        const candidates = Array.from(new Set([cleanVnPhone, p84]));
        for (const cand of candidates) {
          try {
            const userRes = await withTimeout(api.findUser(cand), 8000, "FIND_USER_TIMEOUT");
            const foundUid = String(userRes?.uid || userRes?.userId || "");
            if (foundUid && foundUid !== "0") {
              targetUid = foundUid;
              break;
            }
          } catch {}
        }
      }
    }

    // Gửi tin nhắn qua Zalo API chính thức (Voice bubble nếu có voiceUrl, ngược lại gửi Text)
    let sendResult;
    if (voiceUrl) {
      sendResult = await withTimeout(
        api.sendVoice({ voiceUrl, ttl: 0 }, targetUid, threadType),
        20000,
        "SEND_VOICE_TIMEOUT"
      );
    } else {
      sendResult = await withTimeout(
        api.sendMessage(messageText, targetUid, threadType),
        15000,
        "SEND_MESSAGE_TIMEOUT"
      );
    }

    const msgId = String(sendResult?.message?.msgId || sendResult?.msgId || `sent_${Date.now()}`);

    // Ghi ngay vào file history.jsonl để tin nhắn xuất hiện tức thì trong lịch sử chat
    try {
      const histPath = path.join(cliDir, "history.jsonl");
      const record = {
        msgId,
        threadId: String(targetUid),
        threadType: threadType === 1 ? "group" : "dm",
        senderId: ownId,
        senderName: "Bạn",
        isSelf: true,
        text: voiceUrl ? "[Ghi âm giọng nói]" : messageText,
        ...(voiceUrl ? { url: voiceUrl } : {}),
        timestamp: Date.now(),
        type: voiceUrl ? "chat.voice" : "text",
      };
      fs.appendFileSync(histPath, JSON.stringify(record) + "\n", "utf8");
    } catch {}

    console.log(
      JSON.stringify({
        ok: true,
        status: "sent",
        msgId,
        recipient: targetUid,
        data: sendResult,
      })
    );
    process.exit(0);
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "failed",
        error: err?.message || String(err),
      })
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.log(
    JSON.stringify({
      ok: false,
      status: "failed",
      error: err?.message || String(err),
    })
  );
  process.exit(0);
});
