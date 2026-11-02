import { NextResponse } from "next/server";
import { createChannelAccount } from "../../../../../lib/connectionHub.js";

/**
 * ADDP Omnichannel AI CRM — API Quét và Kết Nối Fanpage Facebook 1-Click (WBS-16 & WBS-17)
 * 1. POST { action: "scan", userToken }: Quét toàn bộ Fanpage người dùng đang làm Quản trị viên
 * 2. POST { action: "connect", pages }: Tự động lưu các Page đã chọn vào hệ thống ConnectionHub
 */

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action || "scan";

    // 1. Quét danh sách Fanpage từ User Access Token
    if (action === "scan") {
      const userToken = body.userToken ? String(body.userToken).trim() : "";
      if (!userToken) {
        return NextResponse.json(
          { error: "Vui lòng cung cấp mã truy cập Facebook (User Access Token)." },
          { status: 400 }
        );
      }

      // Gọi Meta Graph API: /me/accounts
      const url = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture{url}&limit=50&access_token=${encodeURIComponent(userToken)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Lỗi từ Facebook: ${data.error.message} (Mã lỗi: ${data.error.code})`,
          },
          { status: 400 }
        );
      }

      const rawPages = Array.isArray(data.data) ? data.data : [];
      const pages = rawPages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || "Fanpage Doanh Nghiệp",
        avatar: p.picture?.data?.url || "",
        accessToken: p.access_token,
      }));

      return NextResponse.json({
        ok: true,
        total: pages.length,
        pages,
      });
    }

    // 2. Kết nối một hoặc nhiều Fanpage đã chọn
    if (action === "connect") {
      const selectedPages = Array.isArray(body.pages) ? body.pages : [];
      if (selectedPages.length === 0) {
        return NextResponse.json({ error: "Chưa chọn Fanpage nào để kết nối." }, { status: 400 });
      }

      const connectedList = [];
      for (const p of selectedPages) {
        const result = createChannelAccount({
          platform: "FACEBOOK",
          name: p.name || `Fanpage ${p.id}`,
          externalId: `fb_${p.id}`,
          config: {
            pageId: p.id,
            pageAccessToken: p.accessToken,
            avatar: p.avatar,
            category: p.category,
            autoHidePhone: true,
          },
        });

        if (result.ok) {
          connectedList.push(result.channel);
        }
      }

      return NextResponse.json({
        ok: true,
        message: `Đã kết nối thành công ${connectedList.length} Fanpage vào CRM!`,
        connected: connectedList,
      });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  } catch (error) {
    console.error("[FB_PAGES_SCAN_ERROR]", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi quét Fanpage Facebook." }, { status: 500 });
  }
}
