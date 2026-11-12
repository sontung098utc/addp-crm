/**
 * ADDP AI CRM — QA AGENT DATA MASKER & REDACTION ENGINE
 * Đảm bảo không bao giờ in, ghi log hoặc xuất báo cáo chứa bí mật,
 * thông tin cá nhân (PII) hoặc dữ liệu y tế nhạy cảm của khách hàng.
 */

// Regex số điện thoại Việt Nam (10 số)
const VN_PHONE_REGEX = /(?:\+84|84|0)(3|5|7|8|9)[0-9]{8}\b/g;

// Regex Email
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;

/**
 * Che số điện thoại: 0912345678 -> 0912***678
 */
function maskPhone(phone) {
  if (!phone) return "";
  const str = String(phone).trim();
  if (str.length < 7) return "***";
  return str.slice(0, 4) + "***" + str.slice(-3);
}

/**
 * Che email: admin@addp.vn -> a***n@addp.vn
 */
function maskEmail(email) {
  if (!email) return "";
  const parts = String(email).split("@");
  if (parts.length !== 2) return "***@***";
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? name[0] + "***" : name[0] + "***" + name[name.length - 1];
  return `${maskedName}@${domain}`;
}

/**
 * Che chuỗi bí mật (Secret / Token / Key)
 */
function maskSecret(val) {
  if (!val) return "[REDACTED]";
  const str = String(val).trim();
  if (str.length <= 6) return "[REDACTED]";
  return str.slice(0, 3) + "***" + str.slice(-3);
}

/**
 * Quét và che toàn bộ văn bản thô
 */
function maskRawText(text) {
  if (typeof text !== "string") return text;
  let result = text;

  // Che Email
  result = result.replace(EMAIL_REGEX, (m) => maskEmail(m));

  // Che Số điện thoại
  result = result.replace(VN_PHONE_REGEX, (m) => maskPhone(m));

  // Che JWT
  result = result.replace(/(?:eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,})/g, "[JWT_REDACTED]");

  // Che Bearer tokens
  result = result.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, "Bearer [REDACTED_TOKEN]");

  return result;
}

/**
 * Khử khuẩn và che dữ liệu đệ quy trong object / array với bộ nhớ chống vòng lặp (Circular Reference)
 */
function sanitizePayload(data, depth = 0, seen = new WeakSet()) {
  if (depth > 10 || data === null || data === undefined) return data;
  if (typeof data === "string") return maskRawText(data);
  if (typeof data === "number" || typeof data === "boolean") return data;

  if (typeof data === "object") {
    if (seen.has(data)) return "[CIRCULAR_REFERENCE]";
    seen.add(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item, depth + 1, seen));
  }

  if (typeof data === "object") {
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Nếu trường là bí mật xác thực -> Che ngay lập tức
      if (
        lowerKey.includes("secret") ||
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("appkey") ||
        lowerKey.includes("app_secret") ||
        lowerKey.includes("clientsecret") ||
        lowerKey.includes("client_secret") ||
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key") ||
        lowerKey.includes("privatekey") ||
        lowerKey.includes("private_key") ||
        lowerKey.includes("cookie") ||
        lowerKey.includes("authorization")
      ) {
        clean[key] = "[REDACTED_SECRET]";
      } else if (lowerKey.includes("phone") || lowerKey.includes("contactnumber") || lowerKey.includes("sdt")) {
        clean[key] = typeof value === "string" ? maskPhone(value) : sanitizePayload(value, depth + 1, seen);
      } else if (lowerKey.includes("email")) {
        clean[key] = typeof value === "string" ? maskEmail(value) : sanitizePayload(value, depth + 1, seen);
      } else if (
        lowerKey.includes("pathology") ||
        lowerKey.includes("medical") ||
        lowerKey.includes("glucose") ||
        lowerKey.includes("bloodsugar") ||
        lowerKey.includes("symptom")
      ) {
        clean[key] = "[HEALTH_DATA_MASKED]";
      } else {
        clean[key] = sanitizePayload(value, depth + 1, seen);
      }
    }
    return clean;
  }

  return data;
}

module.exports = {
  maskPhone,
  maskEmail,
  maskSecret,
  maskRawText,
  sanitizePayload,
};
