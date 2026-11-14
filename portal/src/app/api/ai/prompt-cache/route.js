import { NextResponse } from "next/server";
import {
  getCacheStats,
  resetCacheStats,
  calculateTokenSavings,
  buildDeterministicPrompt,
  SENIOR_DOCTOR_STATIC_PREFIX,
  MODEL_CACHE_PRICING,
} from "@/lib/ai/promptCache.js";

/**
 * ADDP Omnichannel AI CRM — API Thống Kê & Giám Sát Prompt Caching
 * GET: Lấy báo cáo tỷ lệ hit/miss, tổng token đã cache và số tiền tiết kiệm (USD & VNĐ)
 * POST: Đặt lại thống kê hoặc tính toán thử nghiệm
 */

export async function GET() {
  try {
    const stats = getCacheStats();
    const promptInspection = buildDeterministicPrompt({
      staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
    });

    return NextResponse.json({
      ok: true,
      stats,
      prefixInfo: {
        staticPrefixTokens: promptInspection.metrics.staticPrefixTokens,
        cacheThreshold: promptInspection.metrics.cacheThreshold,
        isCacheEligible: promptInspection.metrics.isCacheEligible,
        statusMessage: promptInspection.metrics.statusMessage,
      },
      pricingTable: MODEL_CACHE_PRICING,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi khi lấy thống kê prompt caching" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "get";

    if (action === "reset") {
      const freshStats = resetCacheStats();
      return NextResponse.json({
        ok: true,
        message: "Đã đặt lại dữ liệu thống kê Prompt Caching thành công.",
        stats: freshStats,
      });
    }

    if (action === "calculate") {
      const model = body?.model || "gpt-4o-mini";
      const cachedTokens = Number(body?.cachedTokens || 0);
      const savings = calculateTokenSavings({
        model,
        cachedTokens,
      });
      return NextResponse.json({
        ok: true,
        model,
        cachedTokens,
        savings,
      });
    }

    return NextResponse.json({ ok: false, error: `Hành động '${action}' không được hỗ trợ.` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi xử lý yêu cầu" },
      { status: 500 }
    );
  }
}
