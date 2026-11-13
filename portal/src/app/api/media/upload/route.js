import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel CRM — API Upload Media (Hình ảnh, Tài liệu, Ghi âm giọng nói)
 * Hỗ trợ lưu trữ file đính kèm phục vụ gửi tin nhắn đa kênh (Zalo, Facebook, TikTok)
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: "Vui lòng chọn file để tải lên." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Giới hạn dung lượng tối đa 25MB
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Dung lượng file vượt quá giới hạn 25MB." },
        { status: 400 }
      );
    }

    const originalName = file.name || "upload_file";
    const ext = path.extname(originalName) || "";
    const cleanExt = ext ? ext.toLowerCase() : "";
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const savedFileName = `${baseName}_${uniqueSuffix}${cleanExt}`;

    // Tìm thư mục public/uploads phù hợp (xét cả môi trường dev cục bộ lẫn production Linux)
    const candidates = [
      path.join(process.cwd(), "public", "uploads"),
      path.join(process.cwd(), "portal", "public", "uploads"),
      "/home/addp/domains/crm.addp.vn/public_html/portal/public/uploads",
      "/home/addp/domains/crm.addp.vn/public_html/public/uploads",
    ];

    let uploadDir = candidates[0];
    for (const dir of candidates) {
      const parent = path.dirname(dir);
      if (fs.existsSync(parent)) {
        uploadDir = dir;
        break;
      }
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, savedFileName);
    fs.writeFileSync(filePath, buffer);

    const isImage = file.type?.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(cleanExt);
    const isAudio = file.type?.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".webm", ".m4a"].includes(cleanExt);

    return NextResponse.json({
      ok: true,
      url: `/uploads/${savedFileName}`,
      filePath,
      fileName: originalName,
      savedFileName,
      mimeType: file.type || "application/octet-stream",
      size: buffer.length,
      isImage,
      isAudio,
    });
  } catch (err) {
    console.error("[Upload API Error]", err);
    return NextResponse.json(
      { ok: false, error: `Lỗi tải lên file: ${err.message}` },
      { status: 500 }
    );
  }
}
