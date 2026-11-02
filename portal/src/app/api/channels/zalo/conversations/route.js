import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Zalo Thật (WBS-21)
 * Lấy danh sách hội thoại gần đây (conversations recent) từ phiên Zalo thật.
 */

let cachedConversations = null;
let lastFetchedAt = 0;

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

export async function GET() {
  try {
    const targetHome = getActiveZaloHome();
    if (!targetHome || !fs.existsSync(targetHome)) {
      return NextResponse.json({ ok: true, conversations: [] });
    }

    const now = Date.now();
    if (cachedConversations && now - lastFetchedAt < 15000) {
      return NextResponse.json({ ok: true, cached: true, conversations: cachedConversations });
    }

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
          "conv",
          "recent",
          "--json",
        ],
        { env, shell: true, timeout: 18000 },
        (err, stdout) => {
          if (err || !stdout) {
            return resolve(NextResponse.json({ ok: true, conversations: cachedConversations || [] }));
          }

          try {
            const list = JSON.parse(stdout);
            const formatted = (Array.isArray(list) ? list : []).map((item) => ({
              id: item.threadId,
              name: item.name || "Khách Zalo",
              type: item.type === "Group" ? "GROUP" : "DIRECT",
              avatar: item.avatar || "",
              lastMessage: item.lastMessage || item.type || "Đã kết nối",
              lastActive: item.lastActive || "Vừa xong",
              channel: "ZALO_PERSONAL",
              channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
            }));

            cachedConversations = formatted;
            lastFetchedAt = now;

            return resolve(NextResponse.json({ ok: true, conversations: formatted }));
          } catch {
            return resolve(NextResponse.json({ ok: true, conversations: cachedConversations || [] }));
          }
        }
      );
    });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại." }, { status: 500 });
  }
}
