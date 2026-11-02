import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Danh Bạ Khách Hàng Zalo Thật (WBS-13)
 * Trích xuất danh sách bạn bè/khách hàng thật từ phiên Zalo đã quét QR.
 * Tuân thủ Điều 11 AGENTS.md (Nghiêm cấm số liệu ảo, chỉ hiển thị dữ liệu xác thực).
 */

let cachedContacts = null;
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
      return NextResponse.json({
        ok: true,
        contacts: [],
        message: "Chưa có tài khoản Zalo cá nhân nào được kết nối.",
      });
    }

    // Cache trong 5 phút để tránh tải lại quá nhiều lần làm chậm giao diện
    const now = Date.now();
    if (cachedContacts && now - lastFetchedAt < 300000) {
      return NextResponse.json({
        ok: true,
        cached: true,
        contacts: cachedContacts,
      });
    }

    const env = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
    };

    return new Promise((resolve) => {
      const args = [
        "--prefer-offline",
        "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0",
        "friend",
        "list",
        "--json",
      ];

      execFile(
        "npx.cmd",
        args,
        { env, shell: true, timeout: 20000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error("[ZALO_CONTACTS_ERROR]", err.message);
            return resolve(
              NextResponse.json({
                ok: true,
                contacts: cachedContacts || [],
                error: "Không thể lấy danh bạ mới nhất từ Zalo CLI.",
              })
            );
          }

          try {
            const list = JSON.parse(stdout);
            const formatted = (Array.isArray(list) ? list : []).map((u) => ({
              userId: u.userId,
              name: u.displayName || u.zaloName || "Khách Zalo",
              avatar: u.avatar || "",
              phone: u.phoneNumber ? `0${u.phoneNumber.replace(/^84/, "")}` : "",
              gender: u.gender === 0 ? "Nam" : u.gender === 1 ? "Nữ" : "Khác",
            }));

            cachedContacts = formatted;
            lastFetchedAt = now;

            return resolve(
              NextResponse.json({
                ok: true,
                total: formatted.length,
                contacts: formatted,
              })
            );
          } catch {
            return resolve(
              NextResponse.json({
                ok: true,
                contacts: cachedContacts || [],
              })
            );
          }
        }
      );
    });
  } catch (error) {
    console.error("[ZALO_CONTACTS_EXCEPTION]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi tải danh bạ Zalo." },
      { status: 500 }
    );
  }
}
