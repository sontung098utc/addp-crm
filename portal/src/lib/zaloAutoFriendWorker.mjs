import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Pure HTTP-REST Zalo Auto Friend Worker
 * Tìm kiếm người dùng Zalo theo SĐT (api.findUser) và gửi lời mời kết bạn (api.sendFriendRequest)
 * qua HTTP REST (zca-js). TUYỆT ĐỐI KHÔNG mở WebSocket listener để không làm văng session Zalo.
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

function extractErrorCode(msg) {
  const match = String(msg || "").match(/\((\-?\d+)\)/);
  return match ? Number(match[1]) : null;
}

function normalizePhoneDigits(phone = "") {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0084")) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("84") && digits.length >= 10) {
    digits = "0" + digits.slice(2);
  } else if (digits.length === 9 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }
  return digits;
}

function normalizeProfile(raw, fallbackPhone = "") {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(
    raw.uid || raw.userId || raw.id || raw.globalId || raw?.data?.uid || ""
  ).trim();
  if (!uid || uid === "0") return null;
  const displayName = String(
    raw.display_name ||
      raw.displayName ||
      raw.zalo_name ||
      raw.zaloName ||
      raw.name ||
      ""
  ).trim();
  const avatar = String(raw.avatar || raw.avatar_120 || raw.avatar_240 || "").trim();
  return {
    uid,
    displayName: displayName || fallbackPhone || uid,
    avatar,
  };
}

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT || "";
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const rawPhone = String(process.env.TARGET_PHONE || "").trim();
  const friendMsg = String(process.env.FRIEND_MESSAGE || "").trim().slice(0, 150);

  if (!javisRoot || !homeDir || !rawPhone) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "ERROR",
        error: "MISSING_ENV",
        detail: "Thiếu cấu hình môi trường hoặc số điện thoại đích.",
      })
    );
    process.exit(0);
  }

  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  const credPath = path.join(cliDir, "credentials");
  if (!fs.existsSync(credPath)) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "ERROR",
        notLoggedIn: true,
        error: "NO_CREDENTIALS",
        detail: "Tài khoản Zalo chưa đăng nhập hoặc thiếu credentials.",
      })
    );
    process.exit(0);
  }

  const vn0 = normalizePhoneDigits(rawPhone);
  const vn84 = vn0.startsWith("0") ? `84${vn0.slice(1)}` : vn0;
  const candidates = Array.from(new Set([vn84, vn0].filter(Boolean)));

  try {
    const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
    const {
      autoLogin,
      loginWithCredentials,
      getApi,
      getOwnId,
      isLoggedIn,
    } = await import(clientUrl);

    await withTimeout(autoLogin(true), 12000, "AUTO_LOGIN_TIMEOUT").catch(() => {});

    let loginErrMsg = "";
    if (!isLoggedIn()) {
      // Fallback đọc trực tiếp file cred_<ownId>.json trong credentials/ phòng trường hợp accounts.json thiếu active: true
      const targetOwnId = String(process.env.TARGET_OWN_ID || "").trim();
      const accountsFile = path.join(cliDir, "accounts.json");
      let accountsList = [];
      try {
        if (fs.existsSync(accountsFile)) {
          accountsList = JSON.parse(fs.readFileSync(accountsFile, "utf8")) || [];
        }
      } catch {}

      let credFileCandidates = [];
      if (targetOwnId) {
        credFileCandidates.push(path.join(credPath, `cred_${targetOwnId}.json`));
      }
      try {
        const files = fs.readdirSync(credPath).filter((f) => f.endsWith(".json"));
        for (const f of files) {
          const full = path.join(credPath, f);
          if (!credFileCandidates.includes(full)) credFileCandidates.push(full);
        }
      } catch {}

      for (const cf of credFileCandidates) {
        if (!fs.existsSync(cf)) continue;
        try {
          const creds = JSON.parse(fs.readFileSync(cf, "utf8"));
          const matchedAcc = accountsList.find(
            (a) =>
              (targetOwnId && String(a.ownId) === targetOwnId) ||
              cf.includes(`cred_${a.ownId}.json`)
          );
          await withTimeout(
            loginWithCredentials(creds, matchedAcc?.proxy || null),
            15000,
            "DIRECT_LOGIN_TIMEOUT"
          );
          if (isLoggedIn()) break;
        } catch (e) {
          loginErrMsg = String(e?.message || e || "");
        }
      }
    }

    if (!isLoggedIn()) {
      console.log(
        JSON.stringify({
          ok: false,
          status: "ERROR",
          notLoggedIn: true,
          error: "NOT_LOGGED_IN",
          detail: loginErrMsg
            ? `Không đăng nhập được phiên Zalo (${loginErrMsg}). Vui lòng kiểm tra hoặc quét lại mã QR.`
            : "Phiên đăng nhập Zalo đã hết hạn. Vui lòng quét lại mã QR.",
        })
      );
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");

    // Bước 1: Kiểm tra nhanh trong danh bạ đã cache (crm-meta-cache.json) xem đã là bạn bè chưa
    const metaPath = path.join(cliDir, "crm-meta-cache.json");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const friends = Array.isArray(meta?.friends) ? meta.friends : [];
        const matchedFriend = friends.find((f) => {
          const p = normalizePhoneDigits(f.phoneNumber || f.phone || "");
          return p && p === vn0;
        });
        if (matchedFriend) {
          const uid = String(matchedFriend.userId || matchedFriend.uid || matchedFriend.id || "");
          const displayName = String(
            matchedFriend.displayName || matchedFriend.zaloName || matchedFriend.name || vn0
          );
          if (uid) {
            console.log(
              JSON.stringify({
                ok: true,
                status: "ALREADY_FRIEND",
                ownId,
                uid,
                displayName,
                avatar: matchedFriend.avatar || "",
                detail: "Đã là bạn bè trong danh bạ Zalo.",
              })
            );
            process.exit(0);
          }
        }
      } catch {}
    }

    // Bước 2: Tìm tài khoản Zalo theo SĐT qua api.findUser
    let profile = null;
    let findErr = "";
    for (const cand of candidates) {
      try {
        const data = await withTimeout(api.findUser(cand), 10000, "FIND_USER_TIMEOUT");
        profile = normalizeProfile(data, vn0);
        if (profile) break;
      } catch (err) {
        findErr = String(err?.message || err || "");
      }
    }

    if (!profile) {
      console.log(
        JSON.stringify({
          ok: true,
          status: "NOT_FOUND",
          ownId,
          uid: "",
          displayName: "",
          detail: findErr
            ? `Không tìm thấy Zalo (${findErr})`
            : "SĐT chưa đăng ký Zalo hoặc người dùng đã tắt tìm kiếm qua SĐT.",
        })
      );
      process.exit(0);
    }

    if (ownId && profile.uid === ownId) {
      console.log(
        JSON.stringify({
          ok: true,
          status: "ALREADY_FRIEND",
          ownId,
          uid: profile.uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
          detail: "Đây là số điện thoại của chính nick Zalo đang gửi.",
        })
      );
      process.exit(0);
    }

    // Bước 3: Gửi lời mời kết bạn qua api.sendFriendRequest(msg, userId)
    try {
      await withTimeout(
        api.sendFriendRequest(friendMsg, profile.uid),
        12000,
        "SEND_FRIEND_REQUEST_TIMEOUT"
      );
      console.log(
        JSON.stringify({
          ok: true,
          status: "SENT",
          ownId,
          uid: profile.uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
          detail: "Đã gửi lời mời kết bạn thành công.",
        })
      );
      process.exit(0);
    } catch (err) {
      const msg = String(err?.message || err || "");
      const code = err?.code ?? extractErrorCode(msg);

      if (code === 225) {
        console.log(
          JSON.stringify({
            ok: true,
            status: "ALREADY_FRIEND",
            ownId,
            uid: profile.uid,
            displayName: profile.displayName,
            avatar: profile.avatar,
            errorCode: 225,
            detail: "Đã là bạn bè trên Zalo.",
          })
        );
        process.exit(0);
      }

      if (code === 222) {
        console.log(
          JSON.stringify({
            ok: true,
            status: "ALREADY_FRIEND",
            ownId,
            uid: profile.uid,
            displayName: profile.displayName,
            avatar: profile.avatar,
            errorCode: 222,
            detail: "Người này đã gửi lời mời kết bạn cho bạn trước đó.",
          })
        );
        process.exit(0);
      }

      if (code === 215) {
        console.log(
          JSON.stringify({
            ok: false,
            status: "ERROR",
            ownId,
            uid: profile.uid,
            displayName: profile.displayName,
            errorCode: 215,
            detail: "Không thể gửi lời mời (người dùng đã chặn hoặc không nhận lời mời từ người lạ).",
          })
        );
        process.exit(0);
      }

      console.log(
        JSON.stringify({
          ok: false,
          status: "ERROR",
          ownId,
          uid: profile.uid,
          displayName: profile.displayName,
          errorCode: code,
          detail: msg || "Không thể gửi lời mời kết bạn.",
        })
      );
      process.exit(0);
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        status: "ERROR",
        detail: String(err?.message || err || "WORKER_ERROR"),
      })
    );
    process.exit(0);
  }
}

main();
