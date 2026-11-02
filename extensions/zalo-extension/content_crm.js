// ADDP CRM — Zalo Extension Content Script for crm.addp.vn (WBS-14)

// Nhận lệnh từ giao diện CRM Web và chuyển tiếp sang extension background
window.addEventListener("ZALO_EXTENSION_TRIGGER", (e) => {
  if (e.detail && e.detail.action) {
    chrome.runtime.sendMessage(e.detail, (response) => {
      window.dispatchEvent(
        new CustomEvent("ZALO_EXTENSION_RESPONSE", {
          detail: response,
        })
      );
    });
  }
});

// Lắng nghe cập nhật tiến độ chiến dịch từ background gửi về CRM Web
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "ZALO_CAMPAIGN_STATUS_UPDATE" || request.action === "ZALO_MESSAGE_RECEIVED") {
    window.dispatchEvent(
      new CustomEvent(request.action, {
        detail: request.payload || request,
      })
    );
  }
});

// Đánh dấu cho CRM Web biết Extension đã được cài đặt và kích hoạt
const marker = document.createElement("meta");
marker.name = "addp-zalo-extension-installed";
marker.content = "2.0.0";
document.head.appendChild(marker);
window.ADDP_ZALO_EXTENSION_AVAILABLE = true;
