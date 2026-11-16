import fs from "fs";
import path from "path";

/**
 * ADDP CRM — Kho Lưu Trữ Tài Liệu, Giấy Tờ Sản Phẩm & Quy Định Nội Bộ
 * Lưu metadata vào `.data/company_documents.json` và file vật lý trong `public/uploads/documents`
 * (phục vụ qua `/api/media/file/documents/<savedFileName>` hoặc `filePath` cho Zalo/Inbox).
 */

export const DOCUMENT_CATEGORIES = [
  { key: "PRODUCT_PAPER", label: "Giấy tờ sản phẩm (Công bố, Kiểm nghiệm...)" },
  { key: "PRODUCT_BROCHURE", label: "Tài liệu / Ảnh sản phẩm & Bảng giá" },
  { key: "REGULATION", label: "Quy định & Quy trình nội bộ" },
  { key: "OTHER", label: "Tài liệu khác" },
];

export function getDocumentsMetaFilePath() {
  const dataDir =
    process.env.DATA_DIR ||
    (fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
      ? "portal/.data"
      : ".data");
  return path.isAbsolute(dataDir)
    ? path.join(dataDir, "company_documents.json")
    : path.join(process.cwd(), dataDir, "company_documents.json");
}

export function getUploadBaseDir() {
  const candidates = [
    path.join(process.cwd(), "public", "uploads"),
    path.join(process.cwd(), "portal", "public", "uploads"),
    "/home/addp/domains/crm.addp.vn/public_html/portal/public/uploads",
    "/home/addp/domains/crm.addp.vn/public_html/public/uploads",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.dirname(dir))) {
      return dir;
    }
  }
  return candidates[0];
}

function readRawDocuments() {
  const filePath = getDocumentsMetaFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error("[documentsStore] Lỗi đọc danh sách tài liệu:", err.message);
  }
  return [];
}

function writeRawDocuments(docs = []) {
  const filePath = getDocumentsMetaFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), "utf8");
}

export function listCompanyDocuments({ category = "", q = "" } = {}) {
  let docs = readRawDocuments();
  if (category && category !== "ALL") {
    docs = docs.filter((d) => d.category === category);
  }
  const keyword = String(q || "").trim().toLowerCase();
  if (keyword) {
    docs = docs.filter((d) => {
      const hay = `${d.title || ""} ${d.description || ""} ${d.productTag || ""} ${d.fileName || ""}`.toLowerCase();
      return hay.includes(keyword);
    });
  }
  return docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function getCompanyDocumentById(id) {
  const docs = readRawDocuments();
  return docs.find((d) => String(d.id) === String(id)) || null;
}

export function addCompanyDocument(doc) {
  const docs = readRawDocuments();
  const now = new Date().toISOString();
  const item = {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(doc.title || "").trim(),
    category: doc.category || "PRODUCT_PAPER",
    productTag: String(doc.productTag || "").trim(),
    description: String(doc.description || "").trim(),
    fileName: doc.fileName || "",
    savedFileName: doc.savedFileName || "",
    filePath: doc.filePath || "",
    url: doc.url || "",
    mimeType: doc.mimeType || "application/octet-stream",
    size: Number(doc.size) || 0,
    isImage: Boolean(doc.isImage),
    uploadedBy: doc.uploadedBy || "Admin",
    uploadedById: doc.uploadedById || null,
    createdAt: now,
    updatedAt: now,
  };
  docs.unshift(item);
  writeRawDocuments(docs);
  return item;
}

export function updateCompanyDocument(id, updates = {}) {
  const docs = readRawDocuments();
  const idx = docs.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return null;

  const current = docs[idx];
  const next = {
    ...current,
    ...(updates.title !== undefined ? { title: String(updates.title).trim() } : {}),
    ...(updates.category !== undefined ? { category: updates.category } : {}),
    ...(updates.productTag !== undefined ? { productTag: String(updates.productTag).trim() } : {}),
    ...(updates.description !== undefined ? { description: String(updates.description).trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  docs[idx] = next;
  writeRawDocuments(docs);
  return next;
}

export function deleteCompanyDocument(id) {
  const docs = readRawDocuments();
  const idx = docs.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return null;
  const [removed] = docs.splice(idx, 1);
  writeRawDocuments(docs);

  if (removed?.filePath && fs.existsSync(removed.filePath)) {
    try {
      fs.unlinkSync(removed.filePath);
    } catch {}
  }
  return removed;
}
