import { NextResponse } from "next/server";
import { getTags, addTag, updateTag, deleteTag, getTagUsageCount } from "@/lib/tagStore.js";

export async function GET() {
  try {
    const tags = getTags();
    const counts = getTagUsageCount();
    return NextResponse.json({ ok: true, tags, counts });
  } catch (error) {
    console.error("[GET /api/tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, color, bg } = body || {};
    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { ok: false, error: "Tên thẻ tag không được để trống" },
        { status: 400 }
      );
    }

    const newTag = addTag({ name: String(name).trim(), color, bg });
    return NextResponse.json({
      ok: true,
      tag: newTag,
      tags: getTags(),
      counts: getTagUsageCount(),
    });
  } catch (error) {
    console.error("[POST /api/tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, name, color, bg } = body || {};
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Thiếu ID thẻ tag cần cập nhật" },
        { status: 400 }
      );
    }

    const updated = updateTag({ id, name, color, bg });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy thẻ tag tương ứng" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      tag: updated,
      tags: getTags(),
      counts: getTagUsageCount(),
    });
  } catch (error) {
    console.error("[PUT /api/tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu ID thẻ tag cần xóa" }, { status: 400 });
    }

    const updated = deleteTag(id);
    return NextResponse.json({
      ok: true,
      tags: updated,
      counts: getTagUsageCount(),
    });
  } catch (error) {
    console.error("[DELETE /api/tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
