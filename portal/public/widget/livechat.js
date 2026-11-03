(function () {
  if (window.__ADDP_LIVECHAT_INITIALIZED__) return;
  window.__ADDP_LIVECHAT_INITIALIZED__ = true;

  // Cấu hình endpoint CRM (tự động nhận từ data-crm hoặc origin)
  const currentScript = document.currentScript;
  const crmHost =
    (currentScript && currentScript.getAttribute("data-crm")) ||
    window.location.origin;

  // Tạo UI Container
  const container = document.createElement("div");
  container.id = "addp-livechat-root";
  document.body.appendChild(container);

  // CSS Nhúng trực tiếp (không xung đột với CSS của Magento)
  const style = document.createElement("style");
  style.textContent = `
    #addp-livechat-root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      z-index: 999999;
      position: fixed;
      bottom: 24px;
      right: 24px;
    }
    .addp-chat-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }
    .addp-chat-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 30px rgba(37, 99, 235, 0.5);
    }
    .addp-chat-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #10b981;
      color: white;
      font-size: 10px;
      font-weight: bold;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }
    .addp-chat-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 360px;
      height: 520px;
      max-height: calc(100vh - 120px);
      background: #0f172a;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      border: 1px solid #1e293b;
      display: none;
      flex-direction: column;
      overflow: hidden;
      animation: addpFadeIn 0.25s ease-out;
    }
    .addp-chat-window.open {
      display: flex;
    }
    @keyframes addpFadeIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .addp-header {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border-bottom: 1px solid #334155;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: white;
    }
    .addp-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .addp-header p {
      margin: 2px 0 0 0;
      font-size: 11px;
      color: #94a3b8;
    }
    .addp-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #090d16;
    }
    .addp-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.45;
      word-break: break-word;
    }
    .addp-msg.bot {
      background: #1e293b;
      color: #f1f5f9;
      border-bottom-left-radius: 4px;
      align-self: flex-start;
      border: 1px solid #334155;
    }
    .addp-msg.user {
      background: #2563eb;
      color: white;
      border-bottom-right-radius: 4px;
      align-self: flex-end;
    }
    .addp-footer {
      border-top: 1px solid #1e293b;
      padding: 12px;
      background: #0f172a;
      display: flex;
      gap: 8px;
    }
    .addp-footer input {
      flex: 1;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 13px;
      color: white;
      outline: none;
    }
    .addp-footer input:focus {
      border-color: #3b82f6;
    }
    .addp-footer button {
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 0 16px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .addp-footer button:hover {
      background: #1d4ed8;
    }
  `;
  document.head.appendChild(style);

  let isOpen = false;
  let customerInfo = {
    name: "",
    phone: "",
  };

  // Render HTML Structure
  container.innerHTML = `
    <div class="addp-chat-window" id="addp-window">
      <div class="addp-header">
        <div>
          <h4><span>🩺 Dược Sĩ ADDP Trực Tuyến</span> <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span></h4>
          <p>Tư vấn chuyên sâu Glucare Plus & Dinh dưỡng</p>
        </div>
        <button id="addp-close-btn" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
      </div>

      <div class="addp-body" id="addp-messages">
        <div class="addp-msg bot">
          👋 Chào bạn, tôi là Dược sĩ trực tuyến của ADDP. Tôi có thể hỗ trợ thông tin gì về sữa hạt <strong>Glucare Plus</strong> hoặc kiểm soát đường huyết cho bạn hôm nay ạ?
        </div>
      </div>

      <div class="addp-footer">
        <input type="text" id="addp-input" placeholder="Nhập câu hỏi hoặc số điện thoại..." />
        <button id="addp-send-btn">Gửi</button>
      </div>
    </div>

    <div class="addp-chat-bubble" id="addp-bubble" title="Chat với Dược sĩ ADDP">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="addp-chat-badge">1</div>
    </div>
  `;

  const bubble = document.getElementById("addp-bubble");
  const win = document.getElementById("addp-window");
  const closeBtn = document.getElementById("addp-close-btn");
  const sendBtn = document.getElementById("addp-send-btn");
  const input = document.getElementById("addp-input");
  const messagesBox = document.getElementById("addp-messages");

  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      win.classList.add("open");
      input.focus();
    } else {
      win.classList.remove("open");
    }
  }

  bubble.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click", toggleChat);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // Append user message
    const userMsg = document.createElement("div");
    userMsg.className = "addp-msg user";
    userMsg.textContent = text;
    messagesBox.appendChild(userMsg);
    input.value = "";
    messagesBox.scrollTop = messagesBox.scrollHeight;

    // Check if user entered phone number
    const phoneMatch = text.match(/(0\d{9}|\+84\d{9})/);
    if (phoneMatch && !customerInfo.phone) {
      customerInfo.phone = phoneMatch[0];
    }

    // Add typing indicator
    const typing = document.createElement("div");
    typing.className = "addp-msg bot";
    typing.textContent = "Dược sĩ ADDP đang trả lời...";
    messagesBox.appendChild(typing);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    try {
      const res = await fetch(`${crmHost}/api/channels/webchat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          phone: customerInfo.phone,
          name: customerInfo.name,
          url: window.location.href,
        }),
      });

      const data = await res.json();
      typing.remove();

      const botMsg = document.createElement("div");
      botMsg.className = "addp-msg bot";
      botMsg.innerHTML = data.reply || "Dược sĩ ADDP đã ghi nhận câu hỏi của bạn và sẽ phản hồi ngay qua SĐT!";
      messagesBox.appendChild(botMsg);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    } catch (e) {
      typing.remove();
      const botMsg = document.createElement("div");
      botMsg.className = "addp-msg bot";
      botMsg.textContent = "Cảm ơn bạn! Để được Dược sĩ tư vấn chi tiết nhất, bạn vui lòng để lại Số điện thoại nhé.";
      messagesBox.appendChild(botMsg);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
})();
