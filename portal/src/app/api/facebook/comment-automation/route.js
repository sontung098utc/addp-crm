import { NextResponse } from "next/server";
import {
  getCommentAutoRules,
  saveCommentAutoRules,
  normalizeCommentRule,
  getCommentAutoLogs,
  getConnectedFacebookPages,
  fetchFanpagePosts,
  processFacebookCommentEvent,
  scanPostCommentsAndAutoReply,
} from "@/lib/fbCommentAutoEngine.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "";
    const pageId = searchParams.get("pageId") || "";

    if (action === "posts" && pageId) {
      const limit = Number(searchParams.get("limit") || 20);
      const result = await fetchFanpagePosts(pageId, limit);
      return NextResponse.json(result);
    }

    const pages = getConnectedFacebookPages().map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
    }));
    const rules = getCommentAutoRules();
    const logs = getCommentAutoLogs();

    return NextResponse.json({
      ok: true,
      pages,
      rules,
      logs,
    });
  } catch (error) {
    console.error("[FB_COMMENT_AUTO_GET_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể tải cấu hình bình luận Fanpage." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "create");

    // 1. Mô phỏng kiểm tra quy tắc với bình luận mẫu
    if (action === "simulate") {
      const result = await processFacebookCommentEvent({
        pageId: body.pageId || "",
        postId: body.postId || "",
        commentId: "dry_run_comment",
        senderId: "dry_run_user",
        senderName: body.senderName || "Nguyễn Thị Lan",
        message: body.message || "",
        dryRun: true,
      });
      return NextResponse.json(result);
    }

    // 2. Quét bù bình luận trên 1 bài viết
    if (action === "scan_post") {
      const result = await scanPostCommentsAndAutoReply(
        body.pageId,
        body.postId,
        Number(body.limit || 25)
      );
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    // 3. Tạo quy tắc mới
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập tên kịch bản bình luận." },
        { status: 400 }
      );
    }
    if (body.keywordMode === "KEYWORDS" && (!body.keywords || String(body.keywords).trim() === "")) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập ít nhất 1 từ khóa kích hoạt." },
        { status: 400 }
      );
    }
    if (
      body.postScope === "SPECIFIC_POSTS" &&
      (!body.targetPostIds || (Array.isArray(body.targetPostIds) && body.targetPostIds.length === 0))
    ) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng chọn hoặc nhập ít nhất 1 bài viết Fanpage." },
        { status: 400 }
      );
    }
    if (!body.replyCommentEnabled && !body.privateMessageEnabled) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng bật ít nhất 1 hành động (Trả lời bình luận hoặc Nhắn tin riêng)." },
        { status: 400 }
      );
    }

    const rules = getCommentAutoRules();
    const newRule = normalizeCommentRule({
      ...body,
      id: `fb_cmt_rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    rules.unshift(newRule);
    saveCommentAutoRules(rules);

    return NextResponse.json({
      ok: true,
      rule: newRule,
      message: "Đã tạo kịch bản tự động bình luận Fanpage thành công!",
    });
  } catch (error) {
    console.error("[FB_COMMENT_AUTO_POST_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi máy chủ khi lưu kịch bản bình luận." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu ID kịch bản." }, { status: 400 });
    }

    const rules = getCommentAutoRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy kịch bản." }, { status: 404 });
    }

    const updated = normalizeCommentRule({
      ...rules[idx],
      ...body,
      id: rules[idx].id,
      createdAt: rules[idx].createdAt,
      hitCount: rules[idx].hitCount,
      replySuccessCount: rules[idx].replySuccessCount,
      pmSuccessCount: rules[idx].pmSuccessCount,
      updatedAt: new Date().toISOString(),
    });

    rules[idx] = updated;
    saveCommentAutoRules(rules);

    return NextResponse.json({ ok: true, rule: updated });
  } catch (error) {
    console.error("[FB_COMMENT_AUTO_PUT_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể cập nhật kịch bản bình luận." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu ID kịch bản." }, { status: 400 });
    }

    const rules = getCommentAutoRules();
    const next = rules.filter((r) => r.id !== id);
    if (next.length === rules.length) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy kịch bản." }, { status: 404 });
    }

    saveCommentAutoRules(next);
    return NextResponse.json({ ok: true, message: "Đã xóa kịch bản thành công." });
  } catch (error) {
    console.error("[FB_COMMENT_AUTO_DEL_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể xóa kịch bản bình luận." },
      { status: 500 }
    );
  }
}
