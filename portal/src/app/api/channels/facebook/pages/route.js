import { NextResponse } from "next/server";
import { createChannelAccount } from "../../../../../lib/connectionHub.js";

/**
 * ADDP Omnichannel AI CRM — API Quét và Kết Nối Fanpage Facebook 1-Click (WBS-16 & WBS-17)
 * Xử lý thông minh:
 * - Tự động nhận diện nếu người dùng dán Page Access Token (trả về Trang ngay lập tức)
 * - Tự động nhận diện nếu người dùng dán User Access Token (quét /me/accounts)
 * - Nếu thiếu quyền pages_show_list: trả về hướng dẫn chi tiết bằng tiếng Việt
 */

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action || "scan";

    // 1. Quét danh sách Fanpage từ Access Token
    if (action === "scan") {
      const rawToken = body.userToken ? String(body.userToken).trim() : "";
      const cleanToken = rawToken.replace(/^["']|["']$/g, "").trim();

      if (!cleanToken) {
        return NextResponse.json(
          { error: "Vui lòng cung cấp mã truy cập Facebook (Access Token)." },
          { status: 400 }
        );
      }

      // Bước 1: Kiểm tra danh tính của Token qua endpoint /me
      const meUrl = `https://graph.facebook.com/v19.0/me?fields=id,name,category,picture{url}&access_token=${encodeURIComponent(cleanToken)}`;
      const meRes = await fetch(meUrl);
      const meData = await meRes.json();

      if (meData.error) {
        if (meData.error.code === 190) {
          return NextResponse.json(
            {
              ok: false,
              error: "Mã Access Token không hợp lệ hoặc đã hết hạn. Vui lòng bấm 'Generate Access Token' lại trên Graph API Explorer.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: `Lỗi từ Facebook: ${meData.error.message} (Mã: ${meData.error.code})`,
          },
          { status: 400 }
        );
      }

      // TRƯỜNG HỢP A: Token đã là Page Access Token trực tiếp (có trường category)
      if (meData.category) {
        const singlePage = {
          id: meData.id,
          name: meData.name,
          category: meData.category,
          avatar: meData.picture?.data?.url || "",
          accessToken: cleanToken,
        };

        return NextResponse.json({
          ok: true,
          total: 1,
          isPageToken: true,
          message: `Đã nhận diện thành công Fanpage: ${meData.name}!`,
          pages: [singlePage],
        });
      }

      // TRƯỜNG HỢP B: Token là User Access Token -> Quét danh sách các Fanpage (/me/accounts)
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture{url}&limit=100&access_token=${encodeURIComponent(cleanToken)}`;
      const accRes = await fetch(accountsUrl);
      const accData = await accRes.json();

      if (accData.error) {
        // Lỗi #100: Tried accessing nonexisting field (accounts)
        // Nguyên nhân: Token chưa tick chọn quyền `pages_show_list`
        if (accData.error.code === 100 || (accData.error.message && accData.error.message.includes("accounts"))) {
          return NextResponse.json(
            {
              ok: false,
              code: "MISSING_PAGES_PERMISSION",
              error:
                "Token người dùng này chưa được cấp quyền xem Trang ('pages_show_list').\n\nCách xử lý rất đơn giản:\n1. Tại Graph API Explorer, bấm nút 'Add a Permission' -> chọn 'Events Groups Pages' -> tick chọn: pages_show_list, pages_read_engagement.\n2. Bấm nút xanh 'Generate Access Token' lại rồi copy dán vào đây.\n3. HOẶC tại mục 'User or Page', chọn trực tiếp tên Trang của bạn (VD: Glucare PLUS, Dược Phẩm ADDP) để lấy mã Token Trang.",
            },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            ok: false,
            error: `Lỗi từ Facebook: ${accData.error.message} (Mã: ${accData.error.code})`,
          },
          { status: 400 }
        );
      }

      const rawPages = Array.isArray(accData.data) ? accData.data : [];
      if (rawPages.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Không tìm thấy Fanpage nào mà tài khoản này làm Quản trị viên. Hãy kiểm tra bạn đã đăng nhập đúng nick Facebook quản lý Trang chưa.",
          },
          { status: 400 }
        );
      }

      const pages = rawPages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || "Fanpage Doanh Nghiệp",
        avatar: p.picture?.data?.url || "",
        accessToken: p.access_token || cleanToken,
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
