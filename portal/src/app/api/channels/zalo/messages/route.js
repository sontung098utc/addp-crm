import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Lịch Sử Tin Nhắn Zalo Thật (WBS-22)
 * Trích xuất luồng tin nhắn 2 chiều (Message Thread Stream) từ phiên Zalo thật.
 */

function getActiveZaloHome() {
  try {
    const candidates = [
      path.resolve(process.cwd(), "server", "mcp_servers.json"),
      path.resolve(process.cwd(), "..", "server", "mcp_servers.json"),
      "C:\\addp-crm\\server\\mcp_servers.json",
    ];
    const mcpPath = candidates.find((p) => fs.existsSync(p));
    if (!mcpPath) return "C:\\addp-crm\\server\\connector-home\\zalo-addp-zalo-ca-nhan-b0cdc0";

    const mcpData = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    const validHomes = [];
    for (const conn of mcpData.connections || []) {
      if (conn.connector_id === "zalo" && conn.config?.home_dir) {
        const credPath = path.join(conn.config.home_dir, ".zalo-agent-cli", "credentials");
        if (fs.existsSync(credPath)) {
          const stat = fs.statSync(credPath);
          validHomes.push({ dir: conn.config.home_dir, mtime: stat.mtimeMs });
        }
      }
    }
    if (validHomes.length > 0) {
      validHomes.sort((a, b) => b.mtime - a.mtime);
      return validHomes[0].dir;
    }
  } catch {}
  return "C:\\addp-crm\\server\\connector-home\\zalo-addp-zalo-ca-nhan-b0cdc0";
}

// Lấy ownId của nick chủ hiện tại
function getOwnerId(homeDir) {
  try {
    const accPath = path.join(homeDir, ".zalo-agent-cli", "accounts.json");
    if (fs.existsSync(accPath)) {
      const list = JSON.parse(fs.readFileSync(accPath, "utf8"));
      const active = Array.isArray(list) ? list.find((a) => a.active) || list[0] : null;
      return active?.ownId || "1781287338457243967";
    }
  } catch {}
  return "1781287338457243967";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return NextResponse.json({ error: "Thiếu tham số threadId." }, { status: 400 });
    }

    const targetHome = getActiveZaloHome();
    const ownerId = getOwnerId(targetHome);

    const env = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
    };

    return new Promise((resolve) => {
      execFile(
        "npx.cmd",
        [
          "--prefer-offline",
          "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0",
          "msg",
          "history",
          threadId,
          "--json",
        ],
        { env, shell: true, timeout: 15000 },
        (err, stdout) => {
          if (err || !stdout) {
            return resolve(NextResponse.json({ ok: true, messages: [] }));
          }

          try {
            const data = JSON.parse(stdout);
            const rawMessages = Array.isArray(data.messages) ? data.messages : [];
            const formatted = rawMessages.map((m) => {
              const isMe = String(m.senderId) === String(ownerId) || m.isMe === true;
              return {
                id: m.msgId || String(Date.now()),
                text: m.text || (m.type === "image" ? "[Hình ảnh]" : "[Tin nhắn]"),
                senderId: m.senderId,
                senderName: m.senderName || (isMe ? "Sơn Tùng" : "Khách"),
                isMe,
                timestamp: m.timestamp || Date.now(),
                time: new Date(m.timestamp || Date.now()).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                date: new Date(m.timestamp || Date.now()).toLocaleDateString("vi-VN"),
                type: m.type || "text",
              };
            });

            return resolve(NextResponse.json({ ok: true, threadId, messages: formatted }));
          } catch {
            return resolve(NextResponse.json({ ok: true, threadId, messages: [] }));
          }
        }
      );
    });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
