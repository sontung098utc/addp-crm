/**
 * ADDP Omnichannel AI CRM — Cron Đồng Bộ KiotViet Độc Lập Qua PM2
 * Chạy định kỳ mỗi 15 phút (cấu hình tại ecosystem.config.js -> addp-crm-kiotviet-cron).
 * Tuân thủ chế độ an toàn QA_DISABLE_AUTO_SYNC=true / PILOT_SAFE_MODE=true (pilotConfig).
 */

function formatVNTimestamp(date = new Date()) {
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().replace("T", " ").slice(0, 19) + " (UTC+7)";
}

function isAutoSyncBlockedByEnv() {
  return (
    process.env.QA_DISABLE_AUTO_SYNC === "true" ||
    process.env.PILOT_DISABLE_AUTO_SYNC === "true" ||
    process.env.PILOT_SAFE_MODE === "true" ||
    process.env.QA_OFFLINE_MODE === "true" ||
    process.env.NODE_ENV === "test"
  );
}

async function runKiotVietSyncCron() {
  const startedAt = formatVNTimestamp(new Date());
  console.log(`[KIOTVIET_CRON] ${startedAt} — Bắt đầu kiểm tra tiến trình đồng bộ KiotViet...`);

  if (isAutoSyncBlockedByEnv()) {
    console.log(
      "[KIOTVIET_CRON_SKIPPED] Đã bỏ qua đồng bộ tự động KiotViet do đang bật QA_DISABLE_AUTO_SYNC=true hoặc PILOT_SAFE_MODE=true."
    );
    return { ok: true, skipped: true };
  }

  const port = process.env.PORT || 3000;
  const baseUrl = process.env.INTERNAL_PORTAL_URL || `http://127.0.0.1:${port}`;
  const syncUrl = `${baseUrl}/api/orders/kiotviet/sync`;

  try {
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ADDP-CRM-KiotViet-Cron/1.0",
      },
      body: JSON.stringify({
        mode: process.env.KIOTVIET_CRON_MODE || "incremental",
        maxPages: Number(process.env.KIOTVIET_CRON_MAX_PAGES || 15),
      }),
      signal: AbortSignal.timeout(120000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error(
        `[KIOTVIET_CRON_WARN] Đồng bộ KiotViet trả về lỗi (${res.status}): ${data.error || "Không rõ nguyên nhân"}`
      );
      return { ok: false, status: res.status, error: data.error };
    }

    console.log(
      `[KIOTVIET_CRON_SUCCESS] ${formatVNTimestamp(new Date())} — Đồng bộ hoàn tất: ` +
        `${data.syncedInvoicesCount || 0} hóa đơn, ${data.syncedOrdersCount || 0} đơn đặt hàng ` +
        `(${data.durationMs || 0}ms).`
    );
    return { ok: true, data };
  } catch (err) {
    console.error(`[KIOTVIET_CRON_ERROR] Không thể kết nối tới ${syncUrl}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

if (require.main === module) {
  runKiotVietSyncCron()
    .then((result) => {
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error("[KIOTVIET_CRON_FATAL]", err);
      process.exit(1);
    });
}

module.exports = { runKiotVietSyncCron, isAutoSyncBlockedByEnv };
