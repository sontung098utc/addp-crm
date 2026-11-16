import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentStaffFromCookieOrHeader } from "@/lib/rbac";
import {
  getCompanyDocumentById,
  updateCompanyDocument,
  deleteCompanyDocument,
} from "@/lib/documentsStore";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const cookieStore = await cookies();
    const staff = getCurrentStaffFromCookieOrHeader(cookieStore, request.headers);
    if (!staff) {
      return NextResponse.json({ ok: false, error: "Chưa đăng nhập." }, { status: 401 });
    }
    if (staff.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Chỉ Quản trị viên (ADMIN) mới được phép chỉnh sửa tài liệu." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const updated = updateCompanyDocument(id, {
      title: body?.title,
      category: body?.category,
      productTag: body?.productTag,
      description: body?.description,
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy tài liệu." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, document: updated });
  } catch (err) {
    console.error("[PUT /api/documents/[id] Error]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const cookieStore = await cookies();
    const staff = getCurrentStaffFromCookieOrHeader(cookieStore, request.headers);
    if (!staff) {
      return NextResponse.json({ ok: false, error: "Chưa đăng nhập." }, { status: 401 });
    }
    if (staff.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Chỉ Quản trị viên (ADMIN) mới được phép xóa tài liệu." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = getCompanyDocumentById(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy tài liệu." }, { status: 404 });
    }

    deleteCompanyDocument(id);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("[DELETE /api/documents/[id] Error]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
