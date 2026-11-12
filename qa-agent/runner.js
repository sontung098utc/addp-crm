/**
 * ADDP AI CRM — QA AGENT MAIN RUNNER & ORCHESTRATOR
 */

const { getQaConfig } = require("./config");
const { isEndpointAllowed } = require("./allowlist");
const { computeSummary, saveReport, getGitCommitSha } = require("./reporter");
const { sanitizePayload, maskRawText } = require("./masker");

const { runHealthScenarios } = require("./scenarios/health");
const { runAuthScenarios } = require("./scenarios/auth");
const { runUiReadonlyScenarios } = require("./scenarios/uiReadonly");
const { runIntegrationsReadonlyScenarios } = require("./scenarios/integrationsReadonly");
const { runSecuritySafeScenarios } = require("./scenarios/securitySafe");
const { runAuditClaimsScenarios } = require("./scenarios/auditClaims");

/**
 * Tạo Fetcher client có rào chắn kiểm soát an toàn và rate limit
 */
function createSafeFetcher(config) {
  let lastCallTime = 0;
  const timeoutMs = Number(config.timeoutMs) || 6000;
  const delayBetweenRequestsMs = Number(config.delayBetweenRequestsMs) || 0;

  const request = async (endpointPath, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const cleanPath = String(endpointPath || "").split("?")[0].trim();

    // 1. Kiểm tra Allowlist TRƯỚC KHI gửi request
    const check = isEndpointAllowed(method, cleanPath, config.target);
    if (!check.allowed) {
      return {
        status: 403,
        error: `[BLOCKED_BY_QA_GUARD] ${check.reason}`,
        isBlocked: true,
        durationMs: 0,
      };
    }

    // 2. Xây dựng và kiểm tra Scheme, Host, Port trước mỗi request (Chống SSRF / Host Hijack)
    let parsedTargetUrl;
    let targetUrl;
    try {
      targetUrl = new URL(endpointPath, config.baseUrl).toString();
      parsedTargetUrl = new URL(targetUrl);
    } catch {
      return {
        status: 400,
        error: `[INVALID_TARGET_URL] URL ghép từ "${endpointPath}" và "${config.baseUrl}" không hợp lệ.`,
        durationMs: 0,
        isBlocked: true,
      };
    }

    const baseOrigin = new URL(config.baseUrl).origin;
    if (parsedTargetUrl.origin !== baseOrigin) {
      return {
        status: 403,
        error: `[SAFETY_VIOLATION] Origin "${parsedTargetUrl.origin}" không khớp với Base URL "${baseOrigin}".`,
        durationMs: 0,
        isBlocked: true,
      };
    }

    // 3. Kiểm soát độ trễ giữa các request (Rate Limiting)
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (delayBetweenRequestsMs > 0 && elapsed < delayBetweenRequestsMs) {
      await new Promise((r) => setTimeout(r, delayBetweenRequestsMs - elapsed));
    }
    lastCallTime = Date.now();

    const startTime = Date.now();

    try {
      const headers = {
        "User-Agent": "ADDP-CRM-QA-Agent/1.0 (Strict-Read-Only)",
        ...(options.headers || {}),
      };

      if (config.testSessionToken && !headers["Cookie"] && !headers["cookie"]) {
        headers["Cookie"] = `addp_crm_session=${config.testSessionToken}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(targetUrl, {
        method,
        headers,
        signal: controller.signal,
        redirect: "manual", // Không tự động follow redirect để kiểm tra mã 302/307
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // Kiểm tra chuyển hướng an toàn (Safe Redirect Check)
      const redirectLocation = res.headers.get("location") || null;
      let isCrossHostRedirect = false;
      if (redirectLocation) {
        try {
          const locUrl = new URL(redirectLocation, baseOrigin);
          if (locUrl.origin !== baseOrigin) {
            isCrossHostRedirect = true;
          }
        } catch {}
      }

      // Nếu là kịch bản kiểm tra xác thực (isAuthProbe) -> Không lưu response body vào log/file
      if (options.isAuthProbe) {
        return {
          status: res.status,
          headers: sanitizePayload(Object.fromEntries(res.headers.entries())),
          json: null,
          rawBody: "[AUTH_CHECK_BODY_OMITTED]",
          redirectLocation,
          isCrossHostRedirect,
          crossHostRedirectBlocked: isCrossHostRedirect,
          durationMs,
          isBlocked: false,
        };
      }

      let json = null;
      let rawBody = "";
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        json = await res.json().catch(() => null);
      } else {
        rawBody = await res.text().catch(() => "");
      }

      return {
        status: res.status,
        headers: sanitizePayload(Object.fromEntries(res.headers.entries())),
        json: sanitizePayload(json),
        rawBody: sanitizePayload(rawBody.slice(0, 500)), // Giới hạn và làm sạch
        redirectLocation,
        isCrossHostRedirect,
        crossHostRedirectBlocked: isCrossHostRedirect,
        durationMs,
        isBlocked: false,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        status: 0,
        error: err.name === "AbortError" ? "Timeout" : err.message,
        durationMs,
        isBlocked: false,
      };
    }
  };

  return { request };
}

/**
 * Chạy toàn bộ các nhóm kịch bản kiểm thử
 */
async function runQaAgent(overrideConfig = {}) {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  // 1. Tải và xác thực cấu hình an toàn
  const config = getQaConfig(overrideConfig);
  const commitSha = getGitCommitSha();
  const fetcher = createSafeFetcher(config);

  console.log(`\n==============================================================================`);
  console.log(`🚀 ADDP AI CRM — QA AGENT (BỘ KIỂM TOÁN CHỨC NĂNG & AN TOÀN ĐỘC LẬP)`);
  console.log(`==============================================================================`);
  console.log(`📍 Môi trường mục tiêu : ${config.target.toUpperCase()} (${maskRawText(config.baseUrl)})`);
  console.log(`📦 Nhóm kịch bản       : ${config.group}`);
  console.log(`🔒 Chế độ thực thi     : READ-ONLY (Không biến đổi dữ liệu, Không gửi tin thật)`);
  console.log(`⏱️ Timeout mỗi request : ${config.timeoutMs}ms`);
  console.log(`🔖 Phiên bản Git Commit: ${commitSha}`);
  console.log(`==============================================================================\n`);

  const allResults = [];
  const group = config.group;

  // Chạy các kịch bản theo nhóm
  if (group === "health" || group === "all-readonly") {
    console.log(`[1/6] 🔍 Đang kiểm tra nhóm: HEALTH & CONNECTIVITY...`);
    const res = await runHealthScenarios({ config, fetcher });
    allResults.push(...res);
  }

  if (group === "auth" || group === "all-readonly") {
    console.log(`[2/6] 🔐 Đang kiểm tra nhóm: AUTHENTICATION & ACCESS CONTROL...`);
    const res = await runAuthScenarios({ config, fetcher });
    allResults.push(...res);
  }

  if (group === "ui-readonly" || group === "all-readonly") {
    console.log(`[3/6] 🖥️ Đang kiểm tra nhóm: UI READONLY RENDERING...`);
    const res = await runUiReadonlyScenarios({ config, fetcher });
    allResults.push(...res);
  }

  if (group === "integrations-readonly" || group === "all-readonly") {
    console.log(`[4/6] 🔌 Đang kiểm tra nhóm: INTEGRATIONS CONFIG & MUTATION GUARD...`);
    const res = await runIntegrationsReadonlyScenarios({ config, fetcher });
    allResults.push(...res);
  }

  if (group === "security-safe" || group === "all-readonly") {
    console.log(`[5/6] 🛡️ Đang kiểm tra nhóm: PASSIVE SECURITY & RBAC BARRIER...`);
    const res = await runSecuritySafeScenarios({ config, fetcher });
    allResults.push(...res);
  }

  if (group === "audit-claims" || group === "all-readonly") {
    console.log(`[6/6] 📋 Đang kiểm tra nhóm: AUDIT HANDOVER CLAIMS AGAINST CODEBASE...`);
    const res = await runAuditClaimsScenarios();
    allResults.push(...res);
  }

  const durationMs = Date.now() - startTime;
  const summary = computeSummary(allResults);

  // 2. Tạo và xuất báo cáo Markdown / JSON
  const reportPayload = {
    config: {
      target: config.target,
      baseUrl: config.baseUrl,
      group: config.group,
      reportDir: config.reportDir,
    },
    startedAt,
    durationMs,
    commitSha,
    summary,
    results: allResults,
  };

  const savedFiles = saveReport(reportPayload);

  // 3. In kết quả tóm tắt ra màn hình console
  console.log(`\n==============================================================================`);
  console.log(`📊 BẢNG TỔNG KẾT KẾT QUẢ KIỂM THỬ QA AGENT`);
  console.log(`==============================================================================`);
  console.log(`  TỔNG SỐ BÀI KIỂM TRA : ${summary.TOTAL}`);
  console.log(`  ✅ ĐẠT (PASS)        : ${summary.PASS}`);
  console.log(`  ❌ LỖI (FAIL)        : ${summary.FAIL}`);
  console.log(`  🛡️ BỊ CHẶN (BLOCKED) : ${summary.BLOCKED}`);
  console.log(`  ⚠️ CHƯA RÕ (INCONCL) : ${summary.INCONCLUSIVE}`);
  console.log(`  ⚪ BỎ QUA (NOT RUN)  : ${summary.NOT_RUN}`);
  console.log(`  📈 TỶ LỆ PASS        : ${summary.passRate}`);
  console.log(`------------------------------------------------------------------------------`);
  console.log(`📄 Báo cáo Markdown    : ${savedFiles.markdownFile}`);
  console.log(`📄 Báo cáo JSON        : ${savedFiles.jsonFile}`);
  console.log(`==============================================================================\n`);

  return {
    summary,
    results: allResults,
    savedFiles,
    hasFailures: summary.FAIL > 0,
  };
}

module.exports = {
  createSafeFetcher,
  runQaAgent,
};
