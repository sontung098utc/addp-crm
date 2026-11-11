import { NextResponse } from "next/server";
import fs from "fs";
import {
  getAllActiveZaloHomes,
  getActiveZaloHome,
  ensureZaloMcpDaemon,
  syncZaloGroupsAndMetadata,
  getAllZaloHistoryFiles,
  triggerDirectSyncWorker,
  getZaloSyncStatus,
} from "@/lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Đồng Bộ Lịch Sử Toàn Bộ Tin Nhắn Zalo Cá Nhân
 * POST/GET /api/zalo/sync-history
 * Hỗ trợ các tham số:
 * - account: "all" | string (ID hoặc Tên tài khoản: "Sơn Tùng", "Lê Quyên"...)
 * - thread_id: string (Tùy chọn: chỉ định hội thoại cụ thể cần sync)
 * - limit: number (Mặc định 50 - 100 tin nhắn mỗi hội thoại)
 */
export async function POST(request) {
  return handleZaloSync(request);
}

export async function GET(request) {
  return handleZaloSync(request);
}

async function handleZaloSync(request) {
  try {
    let reqBody = {};
    if (request.method === "POST") {
      try {
        reqBody = await request.json();
      } catch {}
    }

    const { searchParams } = new URL(request.url);
    const targetAccountParam = (
      reqBody.account ||
      searchParams.get("account") ||
      "all"
    ).trim().toLowerCase();
    const targetThreadId = (
      reqBody.thread_id ||
      searchParams.get("thread_id") ||
      ""
    ).trim();
    const limit = Number(reqBody.limit || searchParams.get("limit")) || 50;

    // 1. Lấy danh sách tất cả các tài khoản Zalo đang kết nối
    const discoveredAccounts = getAllActiveZaloHomes();
    let accountsToSync = discoveredAccounts.length > 0 ? discoveredAccounts : [
      {
        accountId: "1781287338457243967",
        ownId: "1781287338457243967",
        displayName: "Sơn Tùng",
        name: "Sơn Tùng",
        homeDir: getActiveZaloHome(),
      },
    ];

    // Lọc theo account nếu được chỉ định
    if (targetAccountParam && targetAccountParam !== "all") {
      accountsToSync = accountsToSync.filter((acc) => {
        const dName = String(acc.displayName || acc.name || "").toLowerCase();
        const accId = String(acc.accountId || acc.ownId || "").toLowerCase();
        return (
          dName.includes(targetAccountParam) ||
          accId.includes(targetAccountParam) ||
          targetAccountParam.includes(dName)
        );
      });
    }

    if (accountsToSync.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Không tìm thấy tài khoản Zalo nào phù hợp để đồng bộ.",
      });
    }

    const syncReport = [];
    let totalMessagesSynced = 0;
    let totalThreadsSynced = 0;

    // 2. Đồng bộ tuần tự từng tài khoản Zalo
    for (const acc of accountsToSync) {
      const accDisplayName = acc.displayName || acc.name || "Zalo Cá Nhân";
      const ownId = String(acc.ownId || acc.accountId || "");
      let accMessagesCount = 0;
      const seenThreadIds = new Set();

      try {
        // 2.1. Kích hoạt trực tiếp Deep Backfill CHỈ ĐỌC (WS cmd 510 DM + cmd 511 Group + Group REST 50 tin/nhóm + Danh bạ/Avatar)
        // Tuyệt đối không gọi AI auto-reply hay gửi bất kỳ tin nhắn nào trong lúc đồng bộ.
        let workerRes = null;
        if (typeof triggerDirectSyncWorker === "function") {
          try {
            workerRes = await Promise.race([
              triggerDirectSyncWorker(acc.homeDir, { forceFull: true, runWsBackfill: true }),
              new Promise((r) => setTimeout(() => r(null), 25000)),
            ]);
          } catch {}
        } else {
          ensureZaloMcpDaemon(acc.homeDir);
        }

        // 2.3. Đọc metadata danh bạ & đếm toàn bộ lịch sử tin nhắn đã đồng bộ (CHỈ ĐỌC)
        const meta = await syncZaloGroupsAndMetadata(acc.homeDir, false);
        const historyFiles = getAllZaloHistoryFiles(acc.homeDir);
        const seenMsgIds = new Set();

        for (const filePath of historyFiles) {
          if (!fs.existsSync(filePath)) continue;
          try {
            const content = fs.readFileSync(filePath, "utf8");
            const lines = content.split("\n");

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const msg = JSON.parse(trimmed);
                const tid = String(msg.threadId || "");
                if (!tid) continue;
                if (targetThreadId && tid !== targetThreadId) continue;

                const msgId = String(msg.msgId || `${tid}_${msg.timestamp || accMessagesCount}`);
                if (seenMsgIds.has(msgId)) continue;
                seenMsgIds.add(msgId);
                seenThreadIds.add(tid);
                accMessagesCount++;
              } catch {}
            }
          } catch (fileErr) {
            console.error(`[Zalo Sync History] Lỗi đọc file ${filePath}:`, fileErr.message);
          }
        }

        const liveSyncStatus = getZaloSyncStatus(acc.homeDir);
        totalMessagesSynced += accMessagesCount;
        totalThreadsSynced += seenThreadIds.size;

        syncReport.push({
          account: accDisplayName,
          accountId: ownId,
          messagesCount: accMessagesCount,
          threadsCount: seenThreadIds.size,
          friendsCount: meta?.friendMap?.size || liveSyncStatus.friendsCount || 0,
          groupsCount: meta?.groupMap?.size || liveSyncStatus.groupsCount || 0,
          isSyncing: liveSyncStatus.isSyncing,
          dmBackfilled: workerRes?.dmBackfilledCount ?? liveSyncStatus.dmBackfilled ?? 0,
          groupBackfilled: workerRes?.groupBackfilledCount ?? liveSyncStatus.groupBackfilled ?? 0,
          status: liveSyncStatus.isSyncing ? "SYNCING_IN_BACKGROUND" : "SUCCESS",
        });
      } catch (accErr) {
        console.error(`[Zalo Sync History] Lỗi tài khoản ${accDisplayName}:`, accErr.message);
        syncReport.push({
          account: accDisplayName,
          accountId: ownId,
          status: "ERROR",
          error: accErr.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Đã hoàn tất đồng bộ lịch sử tin nhắn cho ${accountsToSync.length} tài khoản Zalo.`,
      totalMessagesSynced,
      totalThreadsSynced,
      accounts: syncReport,
    });
  } catch (error) {
    console.error("[ZALO_SYNC_HISTORY_FATAL_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi hệ thống khi đồng bộ lịch sử tin nhắn Zalo." },
      { status: 500 }
    );
  }
}
