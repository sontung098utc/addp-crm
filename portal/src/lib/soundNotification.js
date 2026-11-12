/**
 * ADDP CRM — Hệ thống Âm Thanh & Thông Báo Tin Nhắn Thời Gian Thực (Chuẩn Zalo Web/PC)
 * Sử dụng Web Audio API tổng hợp âm sắc Chime 2 nốt ngân vang (Ting... Ting)
 * Không phụ thuộc file mp3 ngoài, 100% không bao giờ lỗi mạng hay 404.
 */

let audioCtx = null;
let isAudioUnlocked = false;

export function initAudioContext() {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().then(() => {
        isAudioUnlocked = true;
      }).catch(() => {});
    } else if (audioCtx && audioCtx.state === "running") {
      isAudioUnlocked = true;
    }
  } catch (err) {
    console.warn("[initAudioContext]", err);
  }
  return audioCtx;
}

/**
 * Mở khóa quyền phát âm thanh trình duyệt ngay khi người dùng có tương tác đầu tiên
 */
export function setupAudioUnlockListener() {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    initAudioContext();
    if (audioCtx && audioCtx.state === "running") {
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    }
  };

  window.addEventListener("click", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);

  return () => {
    window.removeEventListener("click", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };
}

/**
 * Phát âm thanh thông báo tin nhắn đến (Chime 2 nốt A5 -> E6 ngân vang giống Zalo)
 */
export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    // Kiểm tra cấu hình tắt chuông trong localStorage nếu có
    const soundMuted = localStorage.getItem("addp_inbox_sound_muted") === "true";
    if (soundMuted) return;

    const ctx = initAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().then(() => playChime(ctx)).catch(() => {});
    } else {
      playChime(ctx);
    }
  } catch (err) {
    console.warn("[playNotificationSound]", err);
  }
}

function playChime(ctx) {
  try {
    const now = ctx.currentTime;

    // Nốt 1: Tần số 880Hz (A5) - âm chuông trong trẻo ban đầu
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Nốt 2: Tần số 1318.5Hz (E6) - quãng năm ngân vang sau 85ms đặc trưng Zalo
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318.5, now + 0.085);
    gain2.gain.setValueAtTime(0.26, now + 0.085);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.085);
    osc2.stop(now + 0.38);
  } catch (err) {
    console.warn("[playChime]", err);
  }
}

/**
 * Yêu cầu quyền thông báo trình duyệt (Browser Push Notification)
 */
export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/**
 * Hiển thị Notification trên màn hình Desktop khi trình duyệt ở chế độ nền
 */
export function showBrowserNotification(title, body, icon = "/icon.png") {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title || "ADDP CRM — Tin nhắn mới", {
        body: body || "Khách hàng vừa gửi tin nhắn mới",
        icon: icon || "/icon.png",
        silent: true, // Vì Web Audio đã phát chuông rồi
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (err) {
      console.warn("[showBrowserNotification]", err);
    }
  }
}
