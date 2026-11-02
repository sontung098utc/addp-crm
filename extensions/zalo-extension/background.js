// ADDP CRM — Zalo Extension Background Service Worker (WBS-14)
// Tuân thủ Điều 4 AGENTS.md (Giãn cách gửi tin, Anti-ban)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (
    request.action === "START_ZALO_CAMPAIGN" ||
    request.action === "START_ZALO_ACCEPT_FRIENDS" ||
    request.action === "SYNC_ZALO_CONVERSATION"
  ) {
    chrome.tabs.query({ url: "*://chat.zalo.me/*" }, (tabs) => {
      if (tabs.length > 0) {
        const zaloTab = tabs[0];
        chrome.tabs.sendMessage(zaloTab.id, request, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[ADDP_CRM_ZALO_EXT] Lỗi gửi sang tab Zalo:", chrome.runtime.lastError);
            sendResponse({
              success: false,
              error: "Tab Zalo Web đang ở trạng thái ngủ hoặc chưa tải xong. Vui lòng mở lại tab chat.zalo.me.",
            });
          } else {
            sendResponse({ success: true, message: "Đã chuyển lệnh sang Zalo Web thành công." });
          }
        });
      } else {
        chrome.tabs.create({ url: "https://chat.zalo.me/" }, (newTab) => {
          sendResponse({
            success: false,
            error: "Chưa mở tab chat.zalo.me. Tiện ích đã tự động mở tab mới, vui lòng quét mã và thử lại.",
          });
        });
      }
    });
    return true;
  }

  // Chuyển kết quả và trạng thái gửi tin ngược về CRM Portal
  if (
    request.action === "ZALO_CAMPAIGN_STATUS_UPDATE" ||
    request.action === "ZALO_MESSAGE_RECEIVED"
  ) {
    const targetPatterns = ["*://crm.addp.vn/*", "*://localhost/*", "*://127.0.0.1/*"];
    targetPatterns.forEach((pattern) => {
      chrome.tabs.query({ url: pattern }, (tabs) => {
        tabs.forEach((t) => chrome.tabs.sendMessage(t.id, request));
      });
    });
  }
});
