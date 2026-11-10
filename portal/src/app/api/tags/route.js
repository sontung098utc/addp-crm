import { NextResponse } from "next/server";
import { getTags, addTag, deleteTag } from "@/lib/tagStore.js";

export async function GET() {
  try {
    const tags = getTags();
    return NextResponse.json({ ok: true, tags });
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
    return NextResponse.json({ ok: true, tag: newTag, tags: getTags() });
  } catch (error) {
    console.error("[POST /api/tags error]:", error);
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
    return NextResponse.json({ ok: true, tags: updated });
  } catch (error) {
    console.error("[DELETE /api/tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
