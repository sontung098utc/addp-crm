import { NextResponse } from "next/server";
import { listAllChannels } from "@/lib/connectionHub.js";
import { addUnifiedMessage, fetchLiveFacebookConversations } from "@/lib/unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — API Đồng Bộ Lịch Sử Toàn Bộ Tin Nhắn Fanpage Facebook
 * POST/GET /api/facebook/sync-history?days=30
 */
export async function POST(request) {
  return handleSync(request);
}

export async function GET(request) {
  return handleSync(request);
}

async function handleSync(request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxDays = Number(searchParams.get("days")) || 30;
    const sinceTimestamp = Date.now() - maxDays * 24 * 3600 * 1000;

    const channels = listAllChannels();
    const fbChannels = channels.filter(
      (c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken
    );

    if (fbChannels.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Chưa có Fanpage Facebook nào được kết nối với Token hợp lệ.",
      });
    }

    const syncReport = [];
    let totalMessagesSynced = 0;

    for (const fbCh of fbChannels) {
      const pageId = String(fbCh.config.pageId).trim();
      const pageName = fbCh.name || `Fanpage ${pageId.slice(-4)}`;
      const token = String(fbCh.config.pageAccessToken).trim();

      let pageMsgCount = 0;
      let convCount = 0;

      try {
        let nextUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(
          pageId
        )}/conversations?fields=id,updated_time,participants,messages{id,message,from,to,created_time,attachments}&limit=25&access_token=${encodeURIComponent(
          token
        )}`;

        let pageIteration = 0;
        const maxPages = 4; // Quét tối đa 100 hội thoại mỗi page để đảm bảo hiệu năng

        while (nextUrl && pageIteration < maxPages) {
          pageIteration++;
          const res = await fetch(nextUrl, { signal: AbortSignal.timeout(12000) });
          const data = await res.json();

          if (Array.isArray(data?.data)) {
            for (const conv of data.data) {
              convCount++;
              const updatedTs = conv.updated_time ? new Date(conv.updated_time).getTime() : 0;
              if (updatedTs < sinceTimestamp && updatedTs > 0) {
                continue;
              }

              const parts = Array.isArray(conv.participants?.data) ? conv.participants.data : [];
              const customer = parts.find((p) => String(p.id) !== pageId) || parts[0] || {};
              const custId = customer.id ? String(customer.id) : "";
              const custName = customer.name || "Khách hàng Fanpage";

              const rawMsgs = Array.isArray(conv.messages?.data) ? conv.messages.data : [];
              for (const m of rawMsgs) {
                const isMe = String(m.from?.id) === pageId;
                const ts = m.created_time ? new Date(m.created_time).getTime() : Date.now();
                const attUrl =
                  m.attachments?.data?.[0]?.image_data?.url ||
                  m.attachments?.data?.[0]?.video_data?.url ||
                  null;

                await addUnifiedMessage({
                  channel: "FACEBOOK",
                  channelId: pageId,
                  channelName: pageName,
                  threadId: String(conv.id),
                  senderId: isMe ? "me" : custId || String(m.from?.id || ""),
                  senderName: isMe ? pageName : custName,
                  text: m.message || (attUrl ? "[Hình ảnh]" : "[Tệp đính kèm]"),
                  type: attUrl ? "image" : "text",
                  mediaUrl: attUrl,
                  isMe,
                  timestamp: ts,
                  metadata: {
                    psid: custId,
                    pageId,
                    source: "history_sync",
                  },
                });
                pageMsgCount++;
                totalMessagesSynced++;
              }
            }
          }

          nextUrl = data?.paging?.next || null;
        }

        syncReport.push({
          pageId,
          pageName,
          status: "SUCCESS",
          conversationsFound: convCount,
          messagesSynced: pageMsgCount,
        });
      } catch (pageErr) {
        syncReport.push({
          pageId,
          pageName,
          status: "ERROR",
          error: pageErr.message,
        });
      }
    }

    // Làm mới cache hội thoại
    await fetchLiveFacebookConversations(true).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `Đã đồng bộ thành công ${totalMessagesSynced} tin nhắn từ ${fbChannels.length} Fanpage Facebook.`,
      totalMessagesSynced,
      report: syncReport,
    });
  } catch (error) {
    console.error("[FB SYNC HISTORY ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Lỗi đồng bộ lịch sử Facebook" },
      { status: 500 }
    );
  }
}
