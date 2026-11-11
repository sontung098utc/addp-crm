import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { createChannelAccount } from "../../../../../lib/connectionHub.js";
import { ensureZaloMcpDaemon, ensureAccountHistorySynced } from "../../../../../lib/zaloRunner.js";

/**
 * Cầu nối Quét mã QR Zalo Cá Nhân Chuẩn (WBS-13 & WBS-14)
 * 1. Ưu tiên gọi Javis FastAPI nếu service đang chạy (cổng 7777 hoặc 8000).
 * 2. Nếu Javis chưa chạy, Node.js trực tiếp spawn tiến trình login của javis-zalo / zca-js,
 *    lấy mã QR PNG THẬT từ máy chủ Zalo (base64 data:image/png) và bắt sự kiện đăng nhập thành công.
 * TUYỆT ĐỐI KHÔNG dùng SVG giả lập (sampleQrSvg) gây hiểu nhầm cho người dùng.
 */

const JAVIS_CANDIDATE_URLS = [
  process.env.JAVIS_API_URL,
  "http://127.0.0.1:7777",
  "http://127.0.0.1:8000",
].filter(Boolean);

// Quản lý các phiên đăng nhập cục bộ đang hoạt động
const activeSessions = new Map();

function slugify(text) {
  return (text || "zalo")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "zalo";
}

function getConnectorHomeBase() {
  const candidates = [
    path.resolve(process.cwd(), "server", "connector-home"),
    path.resolve(process.cwd(), "..", "server", "connector-home"),
    path.resolve(process.cwd(), "connector-home"),
    path.resolve(os.tmpdir(), "addp-crm-zalo-homes"),
  ];
  for (const c of candidates) {
    try {
      fs.mkdirSync(c, { recursive: true });
      return c;
    } catch {}
  }
  return path.resolve(os.tmpdir(), "addp-crm-zalo-homes");
}

function getMcpServersPath() {
  const candidates = [
    path.resolve(process.cwd(), "server", "mcp_servers.json"),
    path.resolve(process.cwd(), "..", "server", "mcp_servers.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Thử tạo ở candidate đầu tiên nếu có thư mục cha
  for (const p of candidates) {
    const parent = path.dirname(p);
    if (fs.existsSync(parent)) {
      try {
        fs.writeFileSync(p, JSON.stringify({ version: 2, connections: [] }, null, 2), "utf8");
        return p;
      } catch {}
    }
  }
  return null;
}

function registerZaloConnection({ id, label, homeDir, ownId }) {
  try {
    const mcpPath = getMcpServersPath();
    if (mcpPath && fs.existsSync(mcpPath)) {
      const data = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
      if (!Array.isArray(data.connections)) data.connections = [];

      // Kiểm tra xem đã có connection trùng homeDir chưa
      const existing = data.connections.find((c) => c.config?.home_dir === homeDir);
      if (!existing) {
        data.connections.push({
          id,
          connector_id: "zalo",
          label: label || "Zalo Cá Nhân",
          slug: slugify(label),
          transport: "stdio",
          url: "",
          command: "npx",
          args: [
            "-y",
            "--prefer-offline",
            "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0",
            "mcp",
            "start",
          ],
          headers: {},
          env: {},
          secrets: {},
          config: {
            home_dir: homeDir,
          },
          auth: "qr",
          enabled: true,
          perm: "full",
          deny_tools: [],
          is_default: data.connections.length === 0,
        });
        fs.writeFileSync(mcpPath, JSON.stringify(data, null, 2), "utf8");
      }
    }
  } catch (err) {
    console.error("[REGISTER_ZALO_CONN_ERROR]", err);
  }

  try {
    createChannelAccount({
      platform: "ZALO_PERSONAL",
      name: `Zalo Cá Nhân (${label})`,
      externalId: ownId || id,
      status: "CONNECTED",
      botMode: "HUMAN",
      assignedStaff: { id: "ADMIN", name: "Quản Trị Viên ADDP" },
      config: {
        homeDir,
        label,
        ownId,
      },
    });
    // Khởi động ngay Universal Initial Sync ngầm để tải toàn bộ lịch sử hội thoại (DM + Nhóm) & danh bạ
    setTimeout(() => {
      try {
        ensureAccountHistorySynced(homeDir, ownId || id, { force: true }).catch((syncErr) => {
          console.error("[Zalo QR] Initial sync error:", syncErr?.message);
        });
      } catch {}
    }, 400);
  } catch (err) {
    console.error("[REGISTER_CRM_CHANNEL_ERROR]", err);
  }
}

async function tryJavisGatewayStart(label) {
  for (const baseUrl of JAVIS_CANDIDATE_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${baseUrl}/connect/zalo/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.sid) {
          return { ok: true, data: { ...data, baseUrl, source: "JAVIS_FASTAPI" } };
        }
      }
    } catch {}
  }
  return { ok: false };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const label = (body.label || "ADDP Zalo Cá Nhân").trim();

    // 1. Thử gọi Javis Gateway nếu đang chạy trên cổng 7777 hoặc 8000
    const javisRes = await tryJavisGatewayStart(label);
    if (javisRes.ok) {
      return NextResponse.json(javisRes.data);
    }

    // 2. Chạy trực tiếp Node.js worker để lấy mã QR Zalo THẬT (thời gian thực)
    const sid = `zalo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const baseHome = getConnectorHomeBase();
    const homeDir = path.join(baseHome, `zalo-${slugify(label)}-${sid.slice(-6)}`);
    fs.mkdirSync(homeDir, { recursive: true });

    const localCandidates = [
      path.resolve(process.cwd(), "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
      path.resolve(process.cwd(), "..", "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
    ];
    const localEntry = localCandidates.find((p) => fs.existsSync(p));

    let child = null;
    const env = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      ZALO_JSON_MODE: "1",
    };

    if (localEntry) {
      child = spawn(process.execPath, [localEntry, "login", "--json"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      child = spawn(
        npxCmd,
        ["--prefer-offline", "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0", "login", "--json"],
        {
          env,
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
    }

    const sess = {
      sid,
      state: "starting",
      label,
      qr: null,
      homeDir,
      child,
      createdAt: Date.now(),
      source: "NODE_WORKER",
    };
    activeSessions.set(sid, sess);

    // Xử lý stdout từ javis-zalo
    let stdoutBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          const ev = (obj.event || "").toLowerCase();

          if (ev === "qr") {
            const dataUrl =
              obj.dataUrl || (obj.image ? `data:image/png;base64,${obj.image}` : null);
            if (dataUrl) {
              sess.qr = dataUrl;
              sess.state = "waiting_scan";
            }
          } else if (ev === "scanned") {
            sess.state = "scanned";
          } else if (ev === "login_success" || ev === "success" || obj.ownId) {
            sess.state = "done";
            sess.ownId = obj.ownId || "";
            sess.name = obj.name || obj.displayName || label;
            registerZaloConnection({
              id: sid.slice(-12),
              label: sess.name,
              homeDir,
              ownId: sess.ownId,
            });
          } else if (ev === "login_error" || ev === "error") {
            sess.state = "error";
            sess.error = obj.message || obj.error || "Đăng nhập Zalo thất bại.";
          }
        } catch {}
      }
    });

    child.stderr.on("data", () => {
      // Không ghi đè state trừ khi process exit
    });

    child.on("close", (code) => {
      if (sess.state !== "done") {
        if (code === 0 && sess.qr) {
          sess.state = "done";
          registerZaloConnection({
            id: sid.slice(-12),
            label: sess.label,
            homeDir,
            ownId: sess.ownId || "",
          });
        } else if (sess.state !== "error") {
          sess.state = "error";
          sess.error = "Tiến trình Zalo kết thúc mà chưa xác nhận đăng nhập.";
        }
      }
    });

    // Timeout an toàn 180s
    const watchdog = setTimeout(() => {
      if (sess.state === "starting" || sess.state === "waiting_scan") {
        sess.state = "error";
        sess.error = "Mã QR đã hết hạn (quá 3 phút). Vui lòng bấm 'Lấy Mã Mới'.";
        try {
          child.kill();
        } catch {}
      }
    }, 180000);
    sess.watchdog = watchdog;

    // Chờ tối đa 4.5 giây để lấy luôn mã QR đầu tiên nếu máy tính phản hồi nhanh
    const startTime = Date.now();
    while (Date.now() - startTime < 4500) {
      if (sess.qr || sess.state === "error") break;
      await new Promise((r) => setTimeout(r, 300));
    }

    return NextResponse.json({
      sid,
      state: sess.state,
      qr: sess.qr,
      source: "NODE_WORKER",
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

    // 1. Thử gọi Javis Gateway nếu có baseUrl lưu trong session hoặc thử candidate
    for (const baseUrl of JAVIS_CANDIDATE_URLS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(`${baseUrl}/connect/zalo/status?sid=${encodeURIComponent(sid)}`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.state) {
            if (data.state === "done") {
              registerZaloConnection({
                id: String(sid).slice(-12),
                label: data.name || data.displayName || data.label || "Zalo Cá Nhân",
                homeDir: data.home_dir || data.homeDir || "",
                ownId: data.ownId || data.own_id || "",
              });
            }
            return NextResponse.json(data);
          }
        }
      } catch {}
    }

    // 2. Tra cứu phiên cục bộ
    const sess = activeSessions.get(sid);
    if (!sess) {
      return NextResponse.json({ state: "error", error: "Phiên đăng nhập QR đã hết hạn hoặc không tồn tại." });
    }

    return NextResponse.json({
      sid: sess.sid,
      state: sess.state,
      qr: sess.qr,
      name: sess.name,
      ownId: sess.ownId,
      error: sess.error,
      source: sess.source,
    });
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
      const sess = activeSessions.get(sid);
      if (sess) {
        if (sess.watchdog) clearTimeout(sess.watchdog);
        if (sess.child) {
          try {
            sess.child.kill();
          } catch {}
        }
        activeSessions.delete(sid);
      }

      for (const baseUrl of JAVIS_CANDIDATE_URLS) {
        try {
          await fetch(`${baseUrl}/connect/zalo/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sid }),
          });
        } catch {}
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
