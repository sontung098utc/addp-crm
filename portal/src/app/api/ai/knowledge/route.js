import { NextResponse } from "next/server";
import { searchSecondBrain } from "@/lib/secondBrain";
import {
  listKnowledgeDocs,
  saveKnowledgeDocMeta,
  deleteKnowledgeDocMeta,
} from "@/lib/ai/botProfileStore";
import {
  extractTextFromBuffer,
  indexKnowledgeDocument,
  searchKnowledgeVectors,
  deleteDocumentVectors,
} from "@/lib/ai/vectorStore";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const accountKey = searchParams.get("accountKey") || "";

    const docs = listKnowledgeDocs();
    let vectorMatches = [];
    if (q.trim()) {
      vectorMatches = await searchKnowledgeVectors({ query: q, accountKey, topK: 5 });
    }
    const legacyDocs = q.trim() ? searchSecondBrain(q) : [];

    return NextResponse.json({
      ok: true,
      docs,
      vectorMatches,
      legacyDocs,
      total: docs.length,
    });
  } catch (error) {
    console.error("GET /api/ai/knowledge error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let title = "";
    let category = "PRODUCT";
    let accountKeys = ["ALL"];
    let textContent = "";
    let fileName = "";
    let fileType = "text";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      title = String(formData.get("title") || "").trim();
      category = String(formData.get("category") || "PRODUCT").trim();
      const rawKeys = String(formData.get("accountKeys") || "ALL");
      accountKeys = rawKeys
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const pastedText = String(formData.get("content") || "").trim();

      if (file && typeof file !== "string") {
        fileName = file.name || "document.txt";
        fileType = fileName.split(".").pop()?.toLowerCase() || "txt";
        const buffer = Buffer.from(await file.arrayBuffer());
        textContent = extractTextFromBuffer(buffer, fileName);
        if (!title) title = fileName.replace(/\.[^.]+$/, "");
      } else {
        textContent = pastedText;
      }
    } else {
      const body = await request.json();
      title = String(body.title || "").trim();
      category = String(body.category || "PRODUCT").trim();
      textContent = String(body.content || "").trim();
      fileName = body.fileName || "";
      fileType = body.fileType || "text";
      if (Array.isArray(body.accountKeys) && body.accountKeys.length > 0) {
        accountKeys = body.accountKeys;
      }
    }

    if (!title || !textContent) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập tiêu đề và nội dung hoặc chọn file tài liệu hợp lệ." },
        { status: 400 }
      );
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { chunkCount } = await indexKnowledgeDocument({
      docId,
      title,
      category,
      text: textContent,
      accountKeys,
    });

    const docMeta = saveKnowledgeDocMeta({
      id: docId,
      title,
      category,
      fileName: fileName || `${title}.txt`,
      fileType,
      chunkCount,
      accountKeys,
      preview: textContent.slice(0, 220).replace(/\s+/g, " "),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: `Đã nạp "${title}" vào Kho Tri Thức Vector (${chunkCount} đoạn kiến thức)!`,
      doc: docMeta,
    });
  } catch (error) {
    console.error("POST /api/ai/knowledge error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "Thiếu id tài liệu cần xóa." }, { status: 400 });
    }
    deleteDocumentVectors(id);
    deleteKnowledgeDocMeta(id);
    return NextResponse.json({
      ok: true,
      message: "Đã xóa tài liệu và toàn bộ vector liên quan.",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
