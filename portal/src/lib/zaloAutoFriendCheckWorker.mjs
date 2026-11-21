import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * ADDP CRM — Pure HTTP-REST Zalo Friend List Check Worker
 * Lấy danh sách bạn bè hiện tại (api.getAllFriends) để đối soát khách hàng đã đồng ý kết bạn.
 * KHÔNG mở WebSocket listener để không làm văng session Zalo.
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

async function main() {
  const javisRoot = process.env.JAVIS_ZALO_ROOT || "";
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";

  if (!javisRoot || !homeDir) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "MISSING_ENV",
        detail: "Thiếu cấu hình môi trường hoặc thư mục tài khoản Zalo.",
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
        notLoggedIn: true,
        error: "NO_CREDENTIALS",
        detail: "Tài khoản Zalo chưa đăng nhập hoặc thiếu credentials.",
      })
    );
    process.exit(0);
  }

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

    let activeCliDir = cliDir;
    let loginErrMsg = "";

    if (!isLoggedIn()) {
      const targetOwnId = String(process.env.TARGET_OWN_ID || "").trim();
      let allHomes = [homeDir];
      try {
        const parsed = JSON.parse(process.env.ALL_HOME_DIRS || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          allHomes = Array.from(new Set([homeDir, ...parsed].filter(Boolean)));
        }
      } catch {}

      const credCandidates = [];
      for (const hDir of allHomes) {
        const cCliDir = path.join(hDir, ".zalo-agent-cli");
        const cCredDir = path.join(cCliDir, "credentials");
        const cAccountsFile = path.join(cCliDir, "accounts.json");
        let accList = [];
        try {
          if (fs.existsSync(cAccountsFile)) {
            accList = JSON.parse(fs.readFileSync(cAccountsFile, "utf8")) || [];
          }
        } catch {}
        if (!fs.existsSync(cCredDir)) continue;
        try {
          const files = fs.readdirSync(cCredDir).filter((f) => f.endsWith(".json"));
          for (const f of files) {
            const full = path.join(cCredDir, f);
            const st = fs.statSync(full);
            const isTargetMatch = targetOwnId && f === `cred_${targetOwnId}.json`;
            credCandidates.push({
              filePath: full,
              cliDir: cCliDir,
              accountsList: accList,
              priority: isTargetMatch ? 1 : 0,
              mtimeMs: st.mtimeMs,
            });
          }
        } catch {}
      }

      credCandidates.sort((a, b) => b.priority - a.priority || b.mtimeMs - a.mtimeMs);

      for (const cand of credCandidates) {
        try {
          const creds = JSON.parse(fs.readFileSync(cand.filePath, "utf8"));
          const matchedAcc = cand.accountsList.find(
            (a) =>
              (targetOwnId && String(a.ownId) === targetOwnId) ||
              cand.filePath.includes(`cred_${a.ownId}.json`)
          );
          await withTimeout(
            loginWithCredentials(creds, matchedAcc?.proxy || null),
            15000,
            "DIRECT_LOGIN_TIMEOUT"
          );
          if (isLoggedIn()) {
            activeCliDir = cand.cliDir;
            break;
          }
        } catch (e) {
          loginErrMsg = String(e?.message || e || "");
        }
      }
    }

    if (!isLoggedIn()) {
      console.log(
        JSON.stringify({
          ok: false,
          notLoggedIn: true,
          error: "NOT_LOGGED_IN",
          detail: loginErrMsg || "Phiên đăng nhập Zalo đã hết hạn.",
        })
      );
      process.exit(0);
    }

    const api = getApi();
    const ownId = String(getOwnId() || "");
    const rawFriends = await withTimeout(api.getAllFriends(), 15000, "GET_ALL_FRIENDS_TIMEOUT");
    const friendArr = Array.isArray(rawFriends)
      ? rawFriends
      : Array.isArray(rawFriends?.data)
      ? rawFriends.data
      : [];

    const friends = friendArr
      .map((f) => ({
        userId: String(f.userId || f.uid || f.id || "").trim(),
        displayName: String(f.displayName || f.zaloName || f.name || "").trim(),
        zaloName: String(f.zaloName || "").trim(),
        phoneNumber: String(f.phoneNumber || f.phone || "").trim(),
        avatar: String(f.avatar || "").trim(),
      }))
      .filter((f) => f.userId);

    // Cập nhật luôn mảng friends trong crm-meta-cache.json nếu có
    const metaPath = path.join(activeCliDir, "crm-meta-cache.json");
    try {
      let prev = {};
      if (fs.existsSync(metaPath)) {
        prev = JSON.parse(fs.readFileSync(metaPath, "utf8")) || {};
      }
      const prevMap = new Map(
        (Array.isArray(prev.friends) ? prev.friends : []).map((pf) => [
          String(pf.userId || pf.uid || pf.id || ""),
          pf,
        ])
      );
      const mergedFriends = friends.map((f) => ({
        ...(prevMap.get(f.userId) || {}),
        ...f,
      }));
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            ...prev,
            ownId: ownId || prev.ownId || "",
            friends: mergedFriends,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {}

    console.log(
      JSON.stringify({
        ok: true,
        ownId,
        count: friends.length,
        friends,
      })
    );
    process.exit(0);
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "CHECK_WORKER_ERROR",
        detail: String(err?.message || err || "CHECK_WORKER_ERROR"),
      })
    );
    process.exit(0);
  }
}

main();
