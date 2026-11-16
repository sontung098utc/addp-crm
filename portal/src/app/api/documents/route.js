import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import { getCurrentStaffFromCookieOrHeader } from "@/lib/rbac";
import {
  listCompanyDocuments,
  addCompanyDocument,
  getUploadBaseDir,
  DOCUMENT_CATEGORIES,
} from "@/lib/documentsStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const staff = getCurrentStaffFromCookieOrHeader(cookieStore, request.headers);
    if (!staff) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng đăng nhập để xem kho tài liệu." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "ALL";
    const q = searchParams.get("q") || "";

    const documents = listCompanyDocuments({ category, q });
    return NextResponse.json({
      ok: true,
      documents,
      categories: DOCUMENT_CATEGORIES,
      canManage: staff.role === "ADMIN",
    });
  } catch (err) {
    console.error("[GET /api/documents Error]", err);
    return NextResponse.json(
      { ok: false, error: `Lỗi tải danh sách tài liệu: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const staff = getCurrentStaffFromCookieOrHeader(cookieStore, request.headers);
    if (!staff) {
      return NextResponse.json(
        { ok: false, error: "Phiên đăng nhập không hợp lệ." },
        { status: 401 }
      );
    }
    if (staff.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Chỉ Quản trị viên (ADMIN) mới có quyền đăng tải tài liệu & giấy tờ." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const rawTitle = String(formData.get("title") || "").trim();
    const category = String(formData.get("category") || "PRODUCT_PAPER").trim();
    const productTag = String(formData.get("productTag") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: "Vui lòng chọn file tài liệu hoặc giấy tờ để tải lên." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Dung lượng file vượt quá giới hạn tối đa 25MB." },
        { status: 400 }
      );
    }

    const originalName = file.name || "tai_lieu";
    const ext = path.extname(originalName) || "";
    const cleanExt = ext ? ext.toLowerCase() : "";
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const savedFileName = `doc_${baseName}_${uniqueSuffix}${cleanExt}`;

    const uploadDir = getUploadBaseDir();
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const finalFilePath = path.join(uploadDir, savedFileName);
    await fs.promises.writeFile(finalFilePath, buffer);

    const isImage =
      file.type?.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(cleanExt);
    const relativeUrl = `/api/media/file/${savedFileName}`;

    const title = rawTitle || originalName.replace(/\.[^.]+$/, "");

    const created = addCompanyDocument({
      title,
      category,
      productTag,
      description,
      fileName: originalName,
      savedFileName,
      filePath: finalFilePath,
      url: relativeUrl,
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      isImage,
      uploadedBy: staff.name || staff.username || "Admin",
      uploadedById: staff.id || null,
    });

    return NextResponse.json({ ok: true, document: created }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/documents Error]", err);
    return NextResponse.json(
      { ok: false, error: `Lỗi đăng tải tài liệu: ${err.message}` },
      { status: 500 }
    );
  }
}
