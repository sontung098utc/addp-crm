import { NextResponse } from "next/server";
import {
  getSentimentAlerts,
  getSentimentAlertStats,
  acknowledgeSentimentAlert,
  resolveSentimentAlert,
  recordSentimentAlert,
  processMessageForSentimentAlert,
} from "@/lib/ai/sentimentAlertStore.js";
import { analyzeCustomerSentiment } from "@/lib/ai/sentimentDetector.js";

/**
 * ADDP Omnichannel CRM — API Quản lý Cảnh báo Sắc thái (Sentiment Alerts API)
 *
 * GET  /api/ai/sentiment-alerts
 *      Query params: ?status=ACTIVE|ACKNOWLEDGED|RESOLVED|ALL&customerId=...&channelId=...&severity=...&limit=50&offset=0
 *
 * POST /api/ai/sentiment-alerts
 *      Payloads:
 *      1. Xác nhận tiếp nhận: { action: 'acknowledge', alertId: '...', staffId: '...', note: '...' }
 *      2. Giải quyết sự vụ: { action: 'resolve', alertId: '...', staffId: '...', resolutionNote: '...' }
 *      3. Phân tích & Cảnh báo tin nhắn: { action: 'analyze_and_alert', messageText: '...', customerId: '...', ... }
 *      4. Kiểm tra sắc thái đơn thuần: { action: 'analyze_only', messageText: '...' }
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ACTIVE";
    const customerId = searchParams.get("customerId") || "";
    const channelId = searchParams.get("channelId") || "";
    const severity = searchParams.get("severity") || "";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const alerts = getSentimentAlerts({
      status,
      customerId,
      channelId,
      severity,
      limit,
      offset,
    });

    const stats = getSentimentAlertStats();

    return NextResponse.json({
      ok: true,
      alerts,
      stats,
      filters: {
        status,
        customerId,
        channelId,
        severity,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/sentiment-alerts ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể lấy danh sách cảnh báo sắc thái: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      action = "acknowledge",
      alertId = "",
      staffId = "STAFF",
      note = "",
      resolutionNote = "",
      messageText = "",
      customerId = "",
      customerName = "",
      customerPhone = "",
      channelId = "DEFAULT",
      threadId = "",
      autoHandover = true,
    } = body || {};

    // 1. Phân tích sắc thái đơn thuần (không ghi vào DB nếu không muốn)
    if (action === "analyze_only") {
      const sentiment = analyzeCustomerSentiment(messageText);
      return NextResponse.json({
        ok: true,
        action,
        sentiment,
      });
    }

    // 2. Phân tích tin nhắn, tự động cảnh báo & ngắt bot AI nếu cáu gắt
    if (action === "analyze_and_alert" || action === "process_message") {
      const result = processMessageForSentimentAlert({
        messageText,
        customerId,
        customerName,
        customerPhone,
        channelId,
        threadId,
        staffId,
      });

      return NextResponse.json({
        ok: true,
        action,
        sentiment: result.sentiment,
        alert: result.alert,
        handoverTriggered: result.handoverTriggered,
      });
    }

    // 3. Tạo cảnh báo thủ công hoặc trực tiếp
    if (action === "create" || action === "record") {
      const sentiment = analyzeCustomerSentiment(messageText);
      const recordRes = recordSentimentAlert({
        customerId,
        customerName,
        customerPhone,
        channelId,
        threadId,
        messageText,
        sentimentResult: sentiment,
        staffId,
        autoHandover,
      });

      return NextResponse.json({
        ok: true,
        action,
        alert: recordRes.alert,
        handoverTriggered: recordRes.handoverTriggered,
      });
    }

    // 4. Giải quyết sự vụ (Resolve)
    if (action === "resolve") {
      if (!alertId) {
        return NextResponse.json(
          { ok: false, error: "Thiếu alertId để giải quyết sự vụ." },
          { status: 400 }
        );
      }

      const res = resolveSentimentAlert(alertId, staffId, resolutionNote || note);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        action,
        alert: res.alert,
        message: "Đã cập nhật trạng thái đã giải quyết cho cảnh báo.",
      });
    }

    // 5. Xác nhận tiếp nhận cảnh báo (Acknowledge) - Mặc định
    if (action === "acknowledge") {
      if (!alertId) {
        return NextResponse.json(
          { ok: false, error: "Thiếu alertId để xác nhận tiếp nhận." },
          { status: 400 }
        );
      }

      const res = acknowledgeSentimentAlert(alertId, staffId, note);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        action,
        alert: res.alert,
        message: "Đã xác nhận tiếp nhận cảnh báo thành công.",
      });
    }

    return NextResponse.json(
      { ok: false, error: `Action '${action}' không được hỗ trợ.` },
      { status: 400 }
    );
  } catch (error) {
    console.error("[POST /api/ai/sentiment-alerts ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi xử lý yêu cầu cảnh báo sắc thái: " + error.message },
      { status: 500 }
    );
  }
}
