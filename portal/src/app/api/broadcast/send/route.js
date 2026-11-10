import { NextResponse } from "next/server";
import { createBroadcastCampaign } from "@/lib/broadcastEngine.js";
import { filterCustomersByTags } from "@/lib/customerIdentityResolver.js";
import { getAllConversationTags } from "@/lib/tagStore.js";
import fs from "fs";
import path from "path";

/**
 * POST /api/broadcast/send
 * Tạo và kích hoạt chiến dịch gửi tin nhắn hàng loạt kèm Anti-Ban Queue
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      channel = "ZALO_PERSONAL",
      target_account = "ALL",
      filter_tag = "ALL",
      message_template = "",
      delay_seconds = 10,
      recipients: customRecipients = null,
      campaign_name = "",
    } = body || {};

    if (!message_template || !message_template.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nội dung tin nhắn không được để trống" },
        { status: 400 }
      );
    }

    let finalRecipients = [];

    if (Array.isArray(customRecipients) && customRecipients.length > 0) {
      finalRecipients = customRecipients;
    } else {
      // Tự động quét từ tệp khách hàng & danh bạ hội thoại theo tag
      const includeTags =
        filter_tag && filter_tag !== "ALL" && filter_tag !== "Tất cả"
          ? [filter_tag]
          : [];

      const audience = filterCustomersByTags({
        includeTags,
        channel,
        operator: "AND",
      });

      if (audience && Array.isArray(audience.allMatched) && audience.allMatched.length > 0) {
        finalRecipients = audience.allMatched;
      } else {
        // Fallback: Quét từ conversation tags nếu có
        const threadTags = getAllConversationTags();
        const matchedThreadIds = Object.keys(threadTags).filter((tid) => {
          if (!includeTags.length) return true;
          const tags = threadTags[tid] || [];
          return tags.some((t) => includeTags.includes(t));
        });

        finalRecipients = matchedThreadIds.map((tid) => ({
          id: tid,
          fullName: "Khách hàng",
          name: "Khách hàng",
          zaloUid: tid,
          zaloThreadId: tid,
        }));
      }
    }

    if (!finalRecipients.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Không tìm thấy người nhận nào phù hợp với bộ lọc đã chọn.",
        },
        { status: 400 }
      );
    }

    const safeDelayMin = Math.max(5, Number(delay_seconds) || 10);
    const safeDelayMax = safeDelayMin + 5;

    const campaignName =
      campaign_name ||
      `Gửi tin hàng loạt (${filter_tag || "Toàn bộ"}) - ${new Date().toLocaleTimeString("vi-VN")}`;

    const campaign = createBroadcastCampaign({
      name: campaignName,
      channel,
      channelId: target_account,
      accountName: target_account === "ALL" ? "Tự động chọn tài khoản" : target_account,
      templateText: message_template,
      delayMinSec: safeDelayMin,
      delayMaxSec: safeDelayMax,
      tags: filter_tag && filter_tag !== "ALL" ? [filter_tag] : [],
      recipients: finalRecipients,
      status: "RUNNING",
    });

    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      campaign,
      total: campaign.totalRecipients,
      message: `Đã đưa ${campaign.totalRecipients} người nhận vào hàng đợi gửi tin an toàn (Anti-ban: giãn cách ${safeDelayMin}-${safeDelayMax}s).`,
    });
  } catch (error) {
    console.error("[POST /api/broadcast/send ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
