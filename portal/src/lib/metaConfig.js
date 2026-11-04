import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config", "meta_app.json");

export function getMetaConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return {
        appId: data.appId || process.env.FB_APP_ID || "2588176118323692",
        appSecret: data.appSecret || process.env.FB_APP_SECRET || "",
        verifyToken: data.verifyToken || process.env.FB_VERIFY_TOKEN || "addp_crm_fb_webhook_secret_2026",
      };
    }
  } catch (err) {
    console.error("[META_CONFIG_READ_ERR]", err);
  }
  return {
    appId: process.env.FB_APP_ID || "2588176118323692",
    appSecret: process.env.FB_APP_SECRET || "",
    verifyToken: process.env.FB_VERIFY_TOKEN || "addp_crm_fb_webhook_secret_2026",
  };
}

export function saveMetaConfig({ appId, appSecret, verifyToken }) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = getMetaConfig();
    const updated = {
      appId: appId ? String(appId).trim() : current.appId,
      appSecret: appSecret ? String(appSecret).trim() : current.appSecret,
      verifyToken: verifyToken ? String(verifyToken).trim() : current.verifyToken,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[META_CONFIG_SAVE_ERR]", err);
    return { ok: false, error: err.message };
  }
}
