import { NextResponse } from "next/server";

/**
 * Cầu nối Quét mã QR Zalo Cá Nhân (WBS-13 & WBS-14)
 * Proxy trực tiếp tới Javis OS FastAPI (/connect/zalo/start & /connect/zalo/status)
 */

const JAVIS_API_URL = process.env.JAVIS_API_URL || "http://127.0.0.1:8000";

// Fallback session store nếu Javis FastAPI chưa mở cổng 8000
const localQrSessions = new Map();

export async function POST(request) {
  try {
    const body = await request.json();
    const label = body.label || "Zalo Cá Nhân";

    // 1. Thử gọi tới Javis FastAPI engine
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${JAVIS_API_URL}/connect/zalo/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ ...data, source: "JAVIS_FASTAPI" });
      }
    } catch {
      // Fallback cục bộ
    }

    // 2. Chế độ dự phòng: Sinh session QR chuẩn SVG/DataURL để test giao diện
    const sid = `zalo_sess_${Date.now()}`;
    // SVG QR Code chuẩn hiển thị được ngay lập tức
    const sampleQrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="220" height="220">
      <rect width="100" height="100" fill="#ffffff" rx="10"/>
      <rect x="10" y="10" width="25" height="25" fill="#0068FF"/>
      <rect x="15" y="15" width="15" height="15" fill="#ffffff"/>
      <rect x="18" y="18" width="9" height="9" fill="#0068FF"/>
      <rect x="65" y="10" width="25" height="25" fill="#0068FF"/>
      <rect x="70" y="15" width="15" height="15" fill="#ffffff"/>
      <rect x="73" y="18" width="9" height="9" fill="#0068FF"/>
      <rect x="10" y="65" width="25" height="25" fill="#0068FF"/>
      <rect x="15" y="70" width="15" height="15" fill="#ffffff"/>
      <rect x="18" y="73" width="9" height="9" fill="#0068FF"/>
      <rect x="42" y="15" width="16" height="6" fill="#0f172a"/>
      <rect x="42" y="28" width="16" height="8" fill="#0f172a"/>
      <rect x="42" y="42" width="16" height="16" fill="#0068FF"/>
      <rect x="65" y="42" width="10" height="10" fill="#0f172a"/>
      <rect x="80" y="42" width="10" height="20" fill="#0f172a"/>
      <rect x="42" y="65" width="10" height="25" fill="#0f172a"/>
      <rect x="58" y="72" width="15" height="18" fill="#0f172a"/>
      <rect x="78" y="68" width="12" height="12" fill="#0f172a"/>
      <rect x="78" y="83" width="12" height="7" fill="#0068FF"/>
    </svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(sampleQrSvg)}`;

    const sessionObj = {
      sid,
      state: "waiting_scan",
      label,
      qr: dataUrl,
      createdAt: Date.now(),
      source: "PORTAL_LOCAL",
    };
    localQrSessions.set(sid, sessionObj);

    return NextResponse.json({
      sid,
      state: "waiting_scan",
      qr: dataUrl,
      source: "PORTAL_LOCAL",
    });
  } catch (error) {
    console.error("[ZALO_QR_START_ERROR]", error);
    return NextResponse.json({ error: "Không thể khởi tạo phiên quét QR Zalo." }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sid = searchParams.get("sid");
    if (!sid) {
      return NextResponse.json({ error: "Thiếu mã session 'sid'." }, { status: 400 });
    }

    // 1. Thử gọi Javis FastAPI
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${JAVIS_API_URL}/connect/zalo/status?sid=${encodeURIComponent(sid)}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fallback
    }

    // 2. Chế độ dự phòng cục bộ
    const sess = localQrSessions.get(sid);
    if (!sess) {
      return NextResponse.json({ state: "error", error: "Phiên đăng nhập QR đã hết hạn." });
    }

    return NextResponse.json(sess);
  } catch (error) {
    console.error("[ZALO_QR_STATUS_ERROR]", error);
    return NextResponse.json({ error: "Lỗi kiểm tra trạng thái QR Zalo." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sid = searchParams.get("sid");
    if (sid) {
      localQrSessions.delete(sid);
      try {
        await fetch(`${JAVIS_API_URL}/connect/zalo/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid }),
        });
      } catch {}
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
