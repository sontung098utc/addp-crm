import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

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

    let finalFileName = savedFileName;
    let finalFilePath = path.join(uploadDir, savedFileName);
    let finalMimeType = file.type || "application/octet-stream";
    let finalSize = buffer.length;
    fs.writeFileSync(finalFilePath, buffer);

    const isImage = file.type?.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(cleanExt);
    const isAudio = file.type?.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".webm", ".m4a"].includes(cleanExt);

    // Chuyển đổi ghi âm .webm/.ogg sang .m4a (AAC) nếu máy chủ có ffmpeg để Zalo Mobile/PC phát trực tiếp
    if (isAudio && cleanExt !== ".m4a") {
      const m4aName = `${baseName}_${uniqueSuffix}.m4a`;
      const m4aPath = path.join(uploadDir, m4aName);
      try {
        execFileSync(
          "ffmpeg",
          ["-y", "-i", finalFilePath, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", m4aPath],
          { timeout: 15000, stdio: "ignore" }
        );
        if (fs.existsSync(m4aPath) && fs.statSync(m4aPath).size > 0) {
          try { fs.unlinkSync(finalFilePath); } catch {}
          finalFileName = m4aName;
          finalFilePath = m4aPath;
          finalMimeType = "audio/mp4";
          finalSize = fs.statSync(m4aPath).size;
        }
      } catch {
        // Nếu server không có ffmpeg thì giữ nguyên file gốc
      }
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (host && !host.includes("localhost") && !host.includes("127.0.0.1")
        ? `${proto}://${host}`
        : "https://crm.addp.vn");
    const relativeUrl = `/api/media/file/${finalFileName}`;

    return NextResponse.json({
      ok: true,
      url: relativeUrl,
      publicUrl: `${baseUrl.replace(/\/$/, "")}${relativeUrl}`,
      filePath: finalFilePath,
      fileName: originalName,
      savedFileName: finalFileName,
      mimeType: finalMimeType,
      size: finalSize,
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
