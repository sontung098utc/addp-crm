import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { listAllChannels } from "@/lib/connectionHub.js";

const CACHE_DIR = path.join(process.cwd(), ".data", "avatar_cache");
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 ngày

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(url, type, id, pageId) {
  const raw = `${type || "generic"}_${id || ""}_${pageId || ""}_${url || ""}`;
  return crypto.createHash("md5").update(raw).digest("hex");
}

/**
 * Trích xuất 2 chữ cái viết tắt từ tên khách hàng (VD: "Lê Quyên" -> "LQ", "Sơn Tùng" -> "ST")
 */
function getInitials(name = "Khách Hàng") {
  const safe = String(name || "Khách Hàng").trim();
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0].slice(0, 1);
    const last = words[words.length - 1].slice(0, 1);
    return `${first}${last}`.toUpperCase();
  }
  return safe.slice(0, 2).toUpperCase() || "KH";
}

/**
 * Sinh ảnh avatar SVG chất lượng cao dự phòng có 2 chữ cái viết tắt
 */
function generateFallbackSvg(name = "Khách Hàng", gender = "UNKNOWN", type = "zalo") {
  const safeName = String(name || "Khách Hàng").trim();
  const initials = getInitials(safeName);
  
  // Màu sắc gradient theo kênh và tên
  const gradients = [
    { from: "#2563eb", to: "#1d4ed8" }, // Blue
    { from: "#7c3aed", to: "#6d28d9" }, // Purple
    { from: "#0891b2", to: "#0e7490" }, // Cyan
    { from: "#059669", to: "#047857" }, // Emerald
    { from: "#d97706", to: "#b45309" }, // Amber
    { from: "#db2777", to: "#be185d" }, // Pink
  ];
  
  let charCodeSum = 0;
  for (let i = 0; i < safeName.length; i++) {
    charCodeSum += safeName.charCodeAt(i);
  }
  const grad = gradients[charCodeSum % gradients.length];
  
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${grad.from}" />
      <stop offset="100%" stop-color="${grad.to}" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#grad)" />
  <circle cx="64" cy="64" r="54" fill="#ffffff" fill-opacity="0.12" />
  <text x="64" y="74" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">${initials}</text>
</svg>`.trim();
}

/**
 * GET /api/media/avatar-proxy?url=...&type=fb|zalo&id=...&pageId=...&name=...
 * Proxy ảnh avatar trung gian vượt CORS, chống hotlink chặn từ Zalo/Facebook CDN
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url") || "";
    const type = (searchParams.get("type") || "").toLowerCase();
    const id = searchParams.get("id") || "";
    const pageId = searchParams.get("pageId") || "";
    const name = searchParams.get("name") || "";
    const gender = searchParams.get("gender") || "UNKNOWN";

    ensureCacheDir();
    const cacheKey = getCacheKey(rawUrl, type, id, pageId);
    const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.jpg`);

    // 1. Kiểm tra cache disk
    if (fs.existsSync(cacheFilePath)) {
      try {
        const stat = fs.statSync(cacheFilePath);
        if (Date.now() - stat.mtimeMs < CACHE_TTL_MS && stat.size > 100) {
          const buffer = fs.readFileSync(cacheFilePath);
          return new NextResponse(buffer, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
            },
          });
        }
      } catch {}
    }

    let targetUrl = rawUrl;

    // 2. Nếu là Facebook và có PSID -> Gọi Graph API để lấy link ảnh thật
    if (type === "fb" && id) {
      const channels = listAllChannels();
      const fbChannels = channels.filter(
        (c) => c.platform === "FACEBOOK" && c.config?.pageAccessToken
      );
      const matchedFb =
        fbChannels.find((c) => String(c.config?.pageId) === String(pageId)) || fbChannels[0];
      const token = matchedFb?.config?.pageAccessToken;

      if (token) {
        try {
          const graphUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(
            id
          )}/picture?type=normal&redirect=false&access_token=${encodeURIComponent(token)}`;
          const gRes = await fetch(graphUrl, { signal: AbortSignal.timeout(6000) });
          const gData = await gRes.json();
          if (gData?.data?.url) {
            targetUrl = gData.data.url;
          }
        } catch {}
      }

      if (!targetUrl) {
        targetUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(id)}/picture?type=normal`;
      }
    }

    // 3. Tải ảnh từ targetUrl với Header tương thích
    if (targetUrl) {
      let finalFetchUrl = targetUrl;
      if (finalFetchUrl.startsWith("//")) {
        finalFetchUrl = `https:${finalFetchUrl}`;
      }

      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      };

      if (type === "zalo" || finalFetchUrl.includes("zdn.vn") || finalFetchUrl.includes("zalo")) {
        headers["Referer"] = "https://chat.zalo.me/";
      } else if (type === "fb" || finalFetchUrl.includes("facebook") || finalFetchUrl.includes("fbcdn")) {
        headers["Referer"] = "https://www.facebook.com/";
      }

      try {
        const imgRes = await fetch(finalFetchUrl, {
          headers,
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });

        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          if (contentType.startsWith("image/")) {
            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Lưu vào cache
            try {
              fs.writeFileSync(cacheFilePath, buffer);
            } catch {}

            return new NextResponse(buffer, {
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
              },
            });
          }
        }
      } catch (fetchErr) {
        console.error(`[Avatar Proxy Error] URL: ${finalFetchUrl}`, fetchErr.message);
      }
    }

    // 4. Nếu tải thất bại hoặc không có ảnh -> Trả về fallback SVG tuyệt đẹp
    const fallbackSvg = generateFallbackSvg(name, gender, type);
    return new NextResponse(fallbackSvg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[Avatar Proxy Fatal Error]", err);
    const fallbackSvg = generateFallbackSvg("Khách Hàng", "UNKNOWN", "zalo");
    return new NextResponse(fallbackSvg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
}
