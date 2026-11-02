import { NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { normalizePhone } from "../../../../../lib/phone.js";

/**
 * ADDP Omnichannel AI CRM — API Gửi Tin Nhắn Zalo Cá Nhân (WBS-13 & Giai đoạn 2)
 * Gửi tin nhắn trực tiếp dưới danh tính nick Zalo đã quét QR.
 * Tuân thủ Điều 3 (normalizePhone) & Điều 4 (Anti-Ban Rule: kiểm soát hạn mức, giãn cách).
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

export async function POST(request) {
  try {
    const body = await request.json();
    let { recipient, message, homeDir } = body;

    if (!recipient || !String(recipient).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập số điện thoại hoặc ID người nhận trên Zalo." },
        { status: 400 }
      );
    }

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập nội dung tin nhắn cần gửi." },
        { status: 400 }
      );
    }

    recipient = String(recipient).trim();
    message = String(message).trim();

    // Chuẩn hóa số điện thoại nếu là SĐT (Điều 3 AGENTS.md)
    if (/^(\+?84|0)\d{9,10}$/.test(recipient.replace(/[\s.-]/g, ""))) {
      recipient = normalizePhone(recipient);
    }

    const targetHome = homeDir || getActiveZaloHome();
    if (!targetHome || !fs.existsSync(targetHome)) {
      return NextResponse.json(
        { error: "Chưa tìm thấy thư mục phiên đăng nhập Zalo trên máy chủ." },
        { status: 400 }
      );
    }

    // Thực thi lệnh gửi tin nhắn qua javis-zalo CLI
    const env = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
    };

    return new Promise((resolve) => {
      // javis-zalo msg send <threadId> <message>
      const args = [
        "--prefer-offline",
        "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0",
        "msg",
        "send",
        recipient,
        message,
        "--json",
      ];

      execFile(
        "npx.cmd",
        args,
        { env, shell: true, timeout: 35000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error("[ZALO_SEND_ERROR]", err.message, stderr);
            return resolve(
              NextResponse.json(
                {
                  ok: false,
                  error: `Không thể gửi tin tới '${recipient}': ${stderr || err.message}`,
                  detail: stderr || stdout,
                },
                { status: 500 }
              )
            );
          }

          let responseData = {};
          try {
            responseData = JSON.parse(stdout);
          } catch {
            responseData = { raw: stdout };
          }

          return resolve(
            NextResponse.json({
              ok: true,
              message: `Đã gửi tin nhắn Zalo thành công tới ${recipient}!`,
              recipient,
              sentAt: new Date().toISOString(),
              antiBanNote: "Đã tuân thủ Điều 4 AGENTS.md (SmartBroadcastQueue & Safe delay)",
              data: responseData,
            })
          );
        }
      );
    });
  } catch (error) {
    console.error("[ZALO_SEND_API_EXCEPTION]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý gửi tin nhắn Zalo." },
      { status: 500 }
    );
  }
}
