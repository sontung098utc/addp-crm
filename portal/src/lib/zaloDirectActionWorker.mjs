import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Pure HTTP-REST Zalo Direct Action Worker (Thu hồi & Chỉnh sửa tin nhắn)
 * Thực thi api.undo({ msgId, cliMsgId }, threadId, type) để thu hồi tin nhắn hai chiều trên Zalo.
 * Với hành động 'edit': Thu hồi tin cũ trên Zalo rồi gửi lại tin nhắn mới đã chỉnh sửa.
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

function findHistoryFiles(cliDir) {
  const files = [];
  const mainHist = path.join(cliDir, "history.jsonl");
  const groupHist = path.join(cliDir, "crm-group-history.jsonl");
  if (fs.existsSync(mainHist)) files.push(mainHist);
  if (fs.existsSync(groupHist)) files.push(groupHist);
  return files;
}

function lookupCliMsgIdInHistory(cliDir, msgId, threadId) {
  const targetMsgId = String(msgId || "").trim();
  const targetTid = String(threadId || "").trim().replace(/^[gu]_/, "");
  if (!targetMsgId) return "";

  for (const filePath of findHistoryFiles(cliDir)) {
    try {
      const lines = fs.readFileSync(filePath, "utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const rec = JSON.parse(line);
          const recId = String(rec.msgId || "").trim();
          const recTid = String(rec.threadId || "").trim().replace(/^[gu]_/, "");
          if (recId === targetMsgId && (!targetTid || !recTid || recTid === targetTid)) {
            if (rec.cliMsgId) return String(rec.cliMsgId);
          }
        } catch {}
      }
    } catch {}
  }
  return "";
}

function updateHistoryAfterRecall(cliDir, msgId, { editedReplaced = false } = {}) {
  const targetMsgId = String(msgId || "").trim();
  if (!targetMsgId) return;

  for (const filePath of findHistoryFiles(cliDir)) {
    try {
      const lines = fs.readFileSync(filePath, "utf8").split("\n");
      let changed = false;
      const updated = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        try {
          const rec = JSON.parse(trimmed);
          if (String(rec.msgId || "") === targetMsgId) {
            changed = true;
            return JSON.stringify({
              ...rec,
              recalled: true,
              editedReplaced: Boolean(editedReplaced),
              text: "[chat.undo] Tin nhắn đã được thu hồi",
              recalledAt: Date.now(),
            });
          }
        } catch {}
        return line;
      });
      if (changed) {
        fs.writeFileSync(filePath, updated.join("\n"), "utf8");
      }
    } catch {}
  }
}

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT || "";
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const actionType = String(process.env.ZALO_ACTION_TYPE || "recall").trim().toLowerCase();
  const recipient = String(process.env.SEND_RECIPIENT || "").trim().replace(/^[gu]_/, "");
  const msgId = String(process.env.ACTION_MSG_ID || "").trim();
  let cliMsgId = String(process.env.ACTION_CLI_MSG_ID || "").trim();
  const newText = String(process.env.ACTION_NEW_TEXT || "").trim();
  const threadType = Number(process.env.SEND_THREAD_TYPE || 0); // 0: DM, 1: Group

  if (!javisRoot || !homeDir || !recipient || !msgId) {
    console.log(JSON.stringify({ ok: false, error: "Thiếu thông tin tin nhắn hoặc hội thoại để thao tác." }));
    process.exit(0);
  }

  if (actionType === "edit" && !newText) {
    console.log(JSON.stringify({ ok: false, error: "Nội dung tin nhắn chỉnh sửa không được để trống." }));
    process.exit(0);
  }

  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  const credPath = path.join(cliDir, "credentials");
  if (!fs.existsSync(credPath)) {
    console.log(JSON.stringify({ ok: false, error: "Tài khoản Zalo chưa đăng nhập hoặc thiếu credentials." }));
    process.exit(0);
  }

  if (!cliMsgId) {
    cliMsgId = lookupCliMsgIdInHistory(cliDir, msgId, recipient);
  }
  if (!cliMsgId) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "Không tìm thấy mã cliMsgId của tin nhắn này để thu hồi trên Zalo (có thể tin nhắn quá cũ hoặc đồng bộ trước khi lưu cliMsgId).",
      })
    );
    process.exit(0);
  }

  try {
    const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
    const { autoLogin, getApi, getOwnId, isLoggedIn } = await import(clientUrl);

    await withTimeout(autoLogin(true), 12000, "AUTO_LOGIN_TIMEOUT");
    if (!isLoggedIn()) {
      console.log(JSON.stringify({ ok: false, error: "Phiên đăng nhập Zalo đã hết hạn. Vui lòng quét lại mã QR." }));
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");

    // Bước 1: Thu hồi tin nhắn trên Zalo (dùng cho cả 'recall' và 'edit')
    const undoRes = await withTimeout(
      api.undo({ msgId, cliMsgId }, recipient, threadType),
      15000,
      "ZALO_UNDO_TIMEOUT"
    );

    if (actionType === "recall") {
      updateHistoryAfterRecall(cliDir, msgId, { editedReplaced: false });
      console.log(
        JSON.stringify({
          ok: true,
          action: "recall",
          msgId,
          cliMsgId,
          undoRes,
        })
      );
      process.exit(0);
    }

    // Bước 2 (nếu là 'edit'): Đánh dấu tin cũ đã thu hồi & Gửi lại tin mới đã sửa
    updateHistoryAfterRecall(cliDir, msgId, { editedReplaced: true });

    const sendResult = await withTimeout(
      api.sendMessage(newText, recipient, threadType),
      15000,
      "SEND_MESSAGE_TIMEOUT"
    );

    const newMsgId = String(sendResult?.message?.msgId || sendResult?.msgId || `edited_${Date.now()}`);
    const newCliMsgId = String(sendResult?.message?.cliMsgId || sendResult?.cliMsgId || Date.now());

    try {
      const histPath = path.join(cliDir, "history.jsonl");
      const record = {
        msgId: newMsgId,
        cliMsgId: newCliMsgId,
        threadId: String(recipient),
        threadType: threadType === 1 ? "group" : "dm",
        senderId: ownId,
        senderName: "Bạn",
        isSelf: true,
        text: newText,
        edited: true,
        editedFromMsgId: msgId,
        timestamp: Date.now(),
        type: "text",
      };
      fs.appendFileSync(histPath, JSON.stringify(record) + "\n", "utf8");
    } catch {}

    console.log(
      JSON.stringify({
        ok: true,
        action: "edit",
        oldMsgId: msgId,
        newMsgId,
        newCliMsgId,
        text: newText,
        undoRes,
        sendResult,
      })
    );
    process.exit(0);
  } catch (err) {
    const rawMsg = err?.message || String(err);
    const friendlyMsg = rawMsg.includes("timeout")
      ? "Hết thời gian kết nối tới máy chủ Zalo."
      : `Zalo từ chối thu hồi tin nhắn (có thể đã quá thời hạn thu hồi của Zalo): ${rawMsg}`;
    console.log(JSON.stringify({ ok: false, error: friendlyMsg }));
    process.exit(0);
  }
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(0);
});
