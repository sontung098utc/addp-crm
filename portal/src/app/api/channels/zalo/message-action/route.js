import { NextResponse } from "next/server";
import {
  guardApiRequest,
  isChannelScopeRestricted,
  isConversationAllowedForStaff,
} from "@/lib/rbac.js";
import { listAllChannels } from "@/lib/connectionHub.js";
import {
  resolveZaloHomeForThread,
  recallZaloMessageDirect,
  editZaloMessageDirect,
  getAllActiveZaloHomes,
} from "@/lib/zaloRunner.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const guard = await guardApiRequest(request, { allowPublicDemo: false });
    if (!guard.ok) return guard.response;
    const currentUser = guard.user;

    const body = await request.json();
    const action = String(body.action || "").trim().toLowerCase(); // "recall" | "edit"
    const threadId = String(body.threadId || "").trim();
    const msgId = String(body.msgId || "").trim();
    const cliMsgId = String(body.cliMsgId || "").trim();
    const newText = String(body.newText || "").trim();
    const isGroup = Boolean(body.isGroup || threadId.startsWith("g_"));
    const accountId = String(body.accountId || body.ownId || "").trim();
    const channelId = String(body.channelId || accountId || "").trim();

    if (!threadId || !msgId || !["recall", "edit"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thông tin thao tác (action, threadId hoặc msgId)." },
        { status: 400 }
      );
    }

    if (action === "edit" && !newText) {
      return NextResponse.json(
        { ok: false, error: "Nội dung tin nhắn mới không được để trống." },
        { status: 400 }
      );
    }

    // Kiểm tra quyền RBAC đa kênh
    if (isChannelScopeRestricted(currentUser)) {
      const allChannels = listAllChannels();
      const allowed = isConversationAllowedForStaff(
        currentUser,
        {
          id: threadId,
          channelId: channelId || accountId,
          accountId,
          ownId: accountId,
          platform: "ZALO_PERSONAL",
        },
        allChannels
      );
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: "Bạn không có quyền thao tác trên tài khoản Zalo này." },
          { status: 403 }
        );
      }
    }

    // Xác định đúng thư mục tài khoản Zalo chứa hội thoại này
    let targetHome = "";
    if (accountId) {
      const homes = getAllActiveZaloHomes();
      const matched = homes.find(
        (h) => String(h.ownId || "") === accountId || String(h.accountId || "") === accountId
      );
      if (matched?.homeDir) targetHome = matched.homeDir;
    }
    if (!targetHome) {
      targetHome = resolveZaloHomeForThread(threadId, "", accountId);
    }

    if (!targetHome) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy phiên đăng nhập Zalo tương ứng với hội thoại này." },
        { status: 404 }
      );
    }

    const result =
      action === "recall"
        ? await recallZaloMessageDirect({
            homeDir: targetHome,
            threadId,
            msgId,
            cliMsgId,
            isGroup,
          })
        : await editZaloMessageDirect({
            homeDir: targetHome,
            threadId,
            msgId,
            cliMsgId,
            newText,
            isGroup,
          });

    if (!result?.ok) {
      return NextResponse.json(
        { ok: false, error: result?.error || "Thao tác trên Zalo thất bại." },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/channels/zalo/message-action error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi hệ thống khi thao tác tin nhắn." },
      { status: 500 }
    );
  }
}
