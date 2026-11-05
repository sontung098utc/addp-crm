// ============================================================================
// ADDP CRM - PRODUCTION SERVER ENTRY POINT (DirectAdmin / Passenger / PM2)
// Hỗ trợ chạy trực tiếp trên DirectAdmin Setup Node.js App & PM2
// ============================================================================

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = false;
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3005;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

console.log(`[ADDP CRM] Đang khởi động hệ thống tại cổng ${port}...`);

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("[ADDP CRM] Lỗi xử lý yêu cầu:", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  })
    .once("error", (err) => {
      console.error("[ADDP CRM] Lỗi máy chủ:", err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`[ADDP CRM] Đã sẵn sàng phục vụ tại http://${hostname}:${port} (https://crm.addp.vn)`);
    });
});
