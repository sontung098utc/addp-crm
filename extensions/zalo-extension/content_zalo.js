// ADDP CRM — Zalo Extension Content Script for chat.zalo.me (WBS-14)
// Tuân thủ Điều 4 AGENTS.md: Giãn cách ngẫu nhiên 45-120s, tối đa 70 tin/ngày

let isRunning = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomAntiBanDelay() {
  // Giãn cách ngẫu nhiên 45s - 120s (Điều 4 AGENTS.md)
  return Math.floor(Math.random() * (120000 - 45000 + 1)) + 45000;
}

function setReactInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function sendZaloMessageToPhone(phone, message) {
  try {
    let searchInput = document.getElementById("contact-search-input") ||
      document.querySelector('input[placeholder*="Tìm kiếm"]');
    if (!searchInput) throw new Error("Không tìm thấy ô tìm kiếm Zalo.");

    setReactInputValue(searchInput, "");
    await delay(400);
    setReactInputValue(searchInput, phone);
    await delay(2500); // Đợi kết quả tìm kiếm số điện thoại

    const searchResult = document.querySelector(".search-result-global .user-item, .contact-list-item");
    if (!searchResult) {
      const strangerBtn = document.querySelector(".search-result-global .search-stranger, .global-search-result-item");
      if (strangerBtn) {
        strangerBtn.click();
      } else {
        throw new Error(`Không tìm thấy số điện thoại ${phone} trên Zalo.`);
      }
    } else {
      searchResult.click();
    }

    await delay(1800);

    const chatInput = document.getElementById("richInput");
    if (!chatInput) throw new Error("Không tìm thấy khung soạn tin nhắn.");

    chatInput.focus();
    chatInput.innerHTML = message.replace(/\n/g, "<br>");
    chatInput.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(1000);

    // Kích hoạt phím Enter gửi tin
    chatInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );
    await delay(1500);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_ZALO_CAMPAIGN" && !isRunning) {
    isRunning = true;
    const targets = request.targets || [];
    const campaignId = request.campaignId;

    (async () => {
      let sentCount = 0;
      for (let i = 0; i < targets.length; i++) {
        if (!isRunning) break;
        const item = targets[i];

        chrome.runtime.sendMessage({
          action: "ZALO_CAMPAIGN_STATUS_UPDATE",
          payload: {
            campaignId,
            current: i + 1,
            total: targets.length,
            status: "SENDING",
            phone: item.phone,
          },
        });

        const res = await sendZaloMessageToPhone(item.phone, item.message);
        if (res.success) sentCount++;

        // Anti-ban delay giữa 2 khách hàng liên tiếp nếu chưa phải người cuối
        if (i < targets.length - 1) {
          const pauseMs = getRandomAntiBanDelay();
          await delay(pauseMs);
        }
      }

      isRunning = false;
      chrome.runtime.sendMessage({
        action: "ZALO_CAMPAIGN_STATUS_UPDATE",
        payload: {
          campaignId,
          total: targets.length,
          sentCount,
          status: "COMPLETED",
        },
      });
    })();

    sendResponse({ success: true, message: "Chiến dịch gửi tin Zalo đã bắt đầu." });
    return true;
  }
});
