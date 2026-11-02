"use client";

import { useEffect, useState, useRef } from "react";

export default function ZaloQrModal({ isOpen, onClose, onLoggedIn }) {
  const [loading, setLoading] = useState(true);
  const [accountLabel, setAccountLabel] = useState("ADDP Zalo Cá Nhân");
  const [session, setSession] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [countdown, setCountdown] = useState(180);
  const [scanStatus, setScanStatus] = useState("waiting_scan");
  const [errorMessage, setErrorMessage] = useState("");
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  const startQrSession = async (customLabel) => {
    setLoading(true);
    setErrorMessage("");
    setScanStatus("waiting_scan");
    setQrImage("");
    setCountdown(180);
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);

    const labelToUse = customLabel || accountLabel || "ADDP Zalo Cá Nhân";

    try {
      const res = await fetch("/api/channels/zalo/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelToUse }),
      });
      const data = await res.json();
      if (res.ok && data.sid) {
        setSession(data);
        if (data.qr) {
          setQrImage(data.qr);
        }
        setLoading(false);
      } else {
        setErrorMessage(data.error || "Không thể khởi tạo phiên quét QR.");
        setLoading(false);
      }
    } catch {
      setErrorMessage("Lỗi kết nối máy chủ khi tạo mã QR.");
      setLoading(false);
    }
  };

  // Chỉ kích hoạt startQrSession 1 lần khi modal mở lên
  useEffect(() => {
    if (isOpen) {
      startQrSession();
    } else {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
      setSession(null);
      setQrImage("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Bộ đếm ngược thời gian hết hạn (180s)
  useEffect(() => {
    if (!isOpen || !session?.sid) return;
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setScanStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isOpen, session]);

  // Vòng lặp kiểm tra trạng thái QR từ Server mỗi 1.5 giây
  useEffect(() => {
    if (!isOpen || !session?.sid || scanStatus === "expired" || scanStatus === "done") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/channels/zalo/qr?sid=${encodeURIComponent(session.sid)}`);
        const data = await res.json();

        // Nhận được ảnh QR thật từ máy chủ Zalo
        if (data.qr && data.qr.length > 50) {
          setQrImage(data.qr);
        }

        if (data.state === "scanned") {
          setScanStatus("scanned");
        } else if (data.state === "done" || data.state === "success") {
          setScanStatus("done");
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setTimeout(() => {
            onLoggedIn?.(data);
            onClose();
          }, 1500);
        } else if (data.state === "error") {
          setErrorMessage(data.error || "Phiên quét QR bị lỗi hoặc hết hạn.");
          clearInterval(pollRef.current);
        }
      } catch {}
    }, 1500);

    return () => clearInterval(pollRef.current);
  }, [isOpen, session, scanStatus, onLoggedIn, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-bold text-xs">
              Z
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Đăng Nhập Zalo Cá Nhân (Multi-QR)</h3>
              <p className="text-[11px] text-slate-400">
                Mỗi tài khoản được cấp 1 thư mục phiên độc lập trên Server (Anti-Ban)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition text-sm p-1"
          >
            ✕
          </button>
        </div>

        {/* Account Label Input */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Tên gọi nhận diện nick Zalo (VD: Dược sĩ Thu Hà, CSKH Trực Đêm...)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              placeholder="VD: Zalo Sơn Tùng"
            />
            <button
              type="button"
              onClick={() => startQrSession(accountLabel)}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-3 py-1.5 font-semibold transition"
            >
              Lấy Mã Mới
            </button>
          </div>
        </div>

        {/* QR Display Area */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[260px]">
          {loading || !qrImage ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-3 text-xs text-slate-400">
              <div className="h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <div className="font-medium text-slate-300">Đang tạo mã QR Zalo từ Server...</div>
              <div className="text-[11px] text-slate-500">Tiến trình javis-zalo đang kết nối tới Zalo Auth</div>
            </div>
          ) : errorMessage ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-2 text-rose-400 text-xs">
              <div>⚠️ {errorMessage}</div>
              <button
                type="button"
                onClick={() => startQrSession()}
                className="rounded-xl bg-slate-800 text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-700"
              >
                Thử Lại Mã Mới
              </button>
            </div>
          ) : scanStatus === "expired" ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
              <div>⏳ Mã QR đã hết hạn (quá 3 phút)</div>
              <button
                type="button"
                onClick={() => startQrSession()}
                className="rounded-xl bg-blue-600 text-white px-4 py-2 text-xs font-semibold hover:bg-blue-500"
              >
                Lấy Mã QR Mới
              </button>
            </div>
          ) : scanStatus === "done" ? (
            <div className="h-48 flex flex-col items-center justify-center space-y-2 text-emerald-400 text-xs">
              <div className="text-3xl">✅</div>
              <div className="font-bold text-sm">Đăng nhập thành công!</div>
              <div className="text-slate-400 text-[11px]">
                Đang lưu phiên kết nối và chuyển hướng...
              </div>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden p-2 bg-white shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImage}
                  alt="Mã QR Đăng Nhập Zalo Thật"
                  className="w-48 h-48 object-contain"
                />
                {scanStatus === "scanned" && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-emerald-400 text-xs font-bold p-3">
                    <span className="text-2xl mb-1">📱</span>
                    Đã quét thành công!
                    <span className="text-slate-300 font-normal text-[10px] mt-1 text-center">
                      Vui lòng bấm &ldquo;Đăng nhập&rdquo; trên điện thoại để xác nhận
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-300 font-medium">
                  {scanStatus === "scanned"
                    ? "Đang chờ xác nhận trên điện thoại..."
                    : `Hết hạn sau: ${countdown}s`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Step Instructions */}
        <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5 space-y-2 text-[11px]">
          <div className="font-bold text-slate-200">Hướng dẫn quét mã:</div>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Mở ứng dụng <strong className="text-white">Zalo</strong> trên điện thoại</li>
            <li>Chọn biểu tượng <strong className="text-white">Quét mã QR</strong> ở góc trên bên phải</li>
            <li>Hướng camera vào mã QR ở trên và bấm <strong className="text-white">Xác nhận Đăng nhập</strong></li>
          </ol>
        </div>

        {/* Anti-Ban Footer */}
        <div className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
          🛡️ <strong>Luật Anti-Ban (Điều 4 AGENTS.md):</strong> Hệ thống tự động giới hạn tối đa 70 tin/ngày/nick và giãn cách ngẫu nhiên 45–120s khi gửi tin chăm sóc khách hàng.
        </div>
      </div>
    </div>
  );
}
