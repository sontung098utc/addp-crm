import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MIME_MAP = {
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
};

function findUploadedFile(safeName) {
  const candidates = [
    path.join(process.cwd(), "public", "uploads", safeName),
    path.join(process.cwd(), "portal", "public", "uploads", safeName),
    path.join("/home/addp/domains/crm.addp.vn/public_html/portal/public/uploads", safeName),
    path.join("/home/addp/domains/crm.addp.vn/public_html/public/uploads", safeName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  return null;
}

export async function GET(request, context) {
  try {
    const params = await context.params;
    const rawName = String(params?.filename || "");
    const safeName = path.basename(rawName);
    if (!safeName || safeName === "." || safeName === "..") {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const filePath = findUploadedFile(safeName);
    if (!filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const ext = path.extname(safeName).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1;
        if (start >= totalSize || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${totalSize}` },
          });
        }
        const chunkSize = end - start + 1;
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(chunkSize);
        fs.readSync(fd, buffer, 0, chunkSize, start);
        fs.closeSync(fd);

        return new NextResponse(buffer, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[Media File Serve Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
