import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Pure HTTP-REST Zalo User Lookup Worker
 * Tìm kiếm thông tin tài khoản Zalo theo Số Điện Thoại hoặc Zalo UID qua HTTP REST (zca-js findUser / getUserInfo).
 * TUYỆT ĐỐI KHÔNG mở WebSocket listener (tránh làm văng session chính của hệ thống / người dùng).
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

function normalizeProfile(raw, fallbackUid = "", fallbackPhone = "") {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(
    raw.uid || raw.userId || raw.id || raw.globalId || fallbackUid || ""
  ).trim();
  const displayName = String(
    raw.display_name || raw.displayName || raw.zalo_name || raw.zaloName || raw.name || ""
  ).trim();
  const zaloName = String(raw.zalo_name || raw.zaloName || displayName || "").trim();
  const avatar = String(raw.avatar || raw.avatar_120 || raw.avatar_240 || "").trim();
  if (!uid) return null;
  return {
    uid,
    displayName: displayName || zaloName || fallbackPhone || uid,
    zaloName,
    avatar,
    phone: fallbackPhone || "",
    gender: raw.gender ?? null,
    status: raw.status || "",
  };
}

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT || "";
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const rawPhone = String(process.env.SEARCH_PHONE || "").trim();
  const rawUid = String(process.env.SEARCH_ZALO_UID || "").trim();

  if (!javisRoot || !homeDir) {
    console.log(JSON.stringify({ ok: false, error: "MISSING_ENV" }));
    process.exit(0);
  }

  const credPath = path.join(homeDir, ".zalo-agent-cli", "credentials");
  if (!fs.existsSync(credPath)) {
    console.log(JSON.stringify({ ok: false, notLoggedIn: true, error: "NO_CREDENTIALS" }));
    process.exit(0);
  }

  try {
    const clientUrl = pathToFileURL(path.join(javisRoot, "src", "core", "zalo-client.js")).href;
    const { autoLogin, getApi, getOwnId, isLoggedIn } = await import(clientUrl);

    await withTimeout(autoLogin(true), 9000, "AUTO_LOGIN_TIMEOUT");
    if (!isLoggedIn()) {
      console.log(JSON.stringify({ ok: false, notLoggedIn: true, error: "NOT_LOGGED_IN" }));
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");

    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, "");
      const vn0 = digits.startsWith("84") && digits.length >= 10 ? `0${digits.slice(2)}` : digits;
      const vn84 = vn0.startsWith("0") ? `84${vn0.slice(1)}` : digits;
      const candidates = Array.from(new Set([vn84, vn0].filter(Boolean)));

      let lastErr = "";
      for (const candidate of candidates) {
        try {
          const data = await withTimeout(api.findUser(candidate), 8000, "FIND_USER_TIMEOUT");
          const profile = normalizeProfile(data, "", vn0);
          if (profile) {
            console.log(JSON.stringify({ ok: true, ownId, profile }));
            process.exit(0);
          }
        } catch (err) {
          lastErr = String(err?.message || err || "");
        }
      }

      console.log(
        JSON.stringify({
          ok: true,
          ownId,
          profile: null,
          detail: lastErr || "NOT_FOUND",
        })
      );
      process.exit(0);
    }

    if (rawUid) {
      try {
        const infoRes = await withTimeout(api.getUserInfo(rawUid), 8000, "GET_USER_INFO_TIMEOUT");
        const changed = infoRes?.changed_profiles || infoRes?.unchanged_profiles || {};
        const rawObj = changed[rawUid] || Object.values(changed)[0] || infoRes;
        const profile = normalizeProfile(rawObj, rawUid, "");
        console.log(JSON.stringify({ ok: true, ownId, profile }));
        process.exit(0);
      } catch (err) {
        console.log(
          JSON.stringify({
            ok: true,
            ownId,
            profile: null,
            detail: String(err?.message || err || "GET_USER_INFO_FAILED"),
          })
        );
        process.exit(0);
      }
    }

    console.log(JSON.stringify({ ok: false, error: "MISSING_QUERY" }));
    process.exit(0);
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        error: String(err?.message || err || "WORKER_ERROR"),
      })
    );
    process.exit(0);
  }
}

main();
