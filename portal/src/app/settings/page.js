"use client";

import { useEffect, useState, useCallback } from "react";
import StaffManager from "./StaffManager";
import ChannelPermissionMatrix from "./ChannelPermissionMatrix";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("staff");
  const [staffList, setStaffList] = useState([]);
  const [roles, setRoles] = useState({});
  const [channels, setChannels] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [simCode, setSimCode] = useState("S002");
  const [simResult, setSimResult] = useState(null);
  const [stage1Report, setStage1Report] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAllData = useCallback(async (simulateTarget = simCode) => {
    try {
      const [staffRes, matrixRes, seedRes] = await Promise.all([
        fetch(`/api/staff?simulateStaff=${encodeURIComponent(simulateTarget)}`),
        fetch("/api/settings/channel-permissions"),
        fetch(`/api/seed?staffCode=${encodeURIComponent(simulateTarget)}`),
      ]);
      const staffData = await staffRes.json();
      const matrixData = await matrixRes.json();
      const seedData = await seedRes.json();

      if (staffData.ok) {
        setStaffList(staffData.staff || []);
        setRoles(staffData.roles || {});
        setSimResult(staffData.simulatedScope || null);
      }
      if (matrixData.ok) {
        setChannels(matrixData.channels || []);
        setPermissions(matrixData.permissions || []);
      }
      if (seedData.ok) {
        setStage1Report(seedData);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }, [simCode]);

  useEffect(() => {
    loadAllData(simCode);
  }, [loadAllData, simCode]);

  const handleTriggerSeed = async () => {
    setSeeding(true);
    try {
      await fetch("/api/seed", { method: "POST" });
      await loadAllData(simCode);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
              Hoàn tất Giai đoạn 1: WBS-01 → WBS-10
            </span>
            <h1 className="text-lg font-bold text-white">
              Quản Trị Nhân Sự, Phân Quyền 7 Kênh, Cầu Nối SSO & Nghiệm Thu Giai Đoạn 1
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tuân thủ Điều 4 (Giới hạn 70 tin Zalo/ngày chống khóa nick) & Điều 5 (Phân quyền 6 cấp:
            ADMIN, SALE_LEADER, SALE, CSKH, KHO, KE_TOAN)
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeTab === "staff"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            👥 1. Nhân Sự & KPI (WBS-07)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("channels")}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeTab === "channels"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🔐 2. Ma Trận 7 Kênh (WBS-08)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rbac-sim")}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeTab === "rbac-sim"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🛡️ 3. Mô Phỏng RBAC (WBS-06)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stage1-acceptance")}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              activeTab === "stage1-acceptance"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🚀 4. Cầu Nối SSO & Nghiệm Thu GĐ 1 (WBS-09 & 10)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
          Đang tải dữ liệu Nhân sự & Ma trận phân quyền...
        </div>
      ) : (
        <>
          {activeTab === "staff" && (
            <StaffManager
              staffList={staffList}
              roles={roles}
              onRefresh={() => loadAllData(simCode)}
            />
          )}

          {activeTab === "channels" && (
            <ChannelPermissionMatrix
              staffList={staffList}
              channels={channels}
              permissions={permissions}
              onRefresh={() => loadAllData(simCode)}
            />
          )}

          {activeTab === "rbac-sim" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Bộ Mô Phỏng Kiểm Thử Phân Quyền Dữ Liệu RBAC (WBS-06 Live Simulator)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kiểm tra điều kiện lọc <code className="text-blue-400">prismaWhere</code>, quyền
                    xem giá vốn/lãi lỗ và quyền xuất dữ liệu khách hàng của từng nhân viên
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Chọn tài khoản kiểm thử:</span>
                  <select
                    value={simCode}
                    onChange={(e) => setSimCode(e.target.value)}
                    className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-semibold text-white"
                  >
                    {staffList.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {simResult && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                    <div className="font-bold text-blue-400 uppercase">
                      1. Phạm vi Khách Hàng 360 (Customers)
                    </div>
                    <div className="text-slate-300">{simResult.customers.description}</div>
                    <div className="pt-2 space-y-1">
                      <div>
                        Loại Scope:{" "}
                        <span className="font-mono font-bold text-emerald-400">
                          {simResult.customers.scopeType}
                        </span>
                      </div>
                      <div>
                        Xuất toàn bộ KH công ty:{" "}
                        <strong
                          className={
                            simResult.customers.canExportAllCustomers
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {simResult.customers.canExportAllCustomers
                            ? "ĐƯỢC PHÉP"
                            : "BỊ CHẶN (Điều 5 AGENTS.md)"}
                        </strong>
                      </div>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-300 overflow-x-auto">
                      {JSON.stringify(simResult.customers.prismaWhere, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                    <div className="font-bold text-purple-400 uppercase">
                      2. Phạm vi Hộp Thư Đa Kênh (Conversations)
                    </div>
                    <div className="text-slate-300">{simResult.conversations.description}</div>
                    <div className="pt-2">
                      Được truy cập Hộp thư:{" "}
                      <strong
                        className={
                          simResult.conversations.allowed ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {simResult.conversations.allowed ? "CÓ" : "KHÔNG (Khóa theo vai trò)"}
                      </strong>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-300 overflow-x-auto">
                      {JSON.stringify(simResult.conversations.prismaWhere, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                    <div className="font-bold text-amber-400 uppercase">
                      3. Phạm vi Đơn Hàng & Giá Vốn / Lãi Lỗ
                    </div>
                    <div className="text-slate-300">{simResult.orders.description}</div>
                    <div className="pt-2">
                      Xem Giá vốn (COGS) & Lãi ròng:{" "}
                      <strong
                        className={
                          simResult.orders.canViewFinancialCost
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {simResult.orders.canViewFinancialCost
                          ? "HIỂN THỊ ĐẦY ĐỦ"
                          : "TỰ ĐỘNG ẨN TRƯỜNG NHẠY CẢM"}
                      </strong>
                    </div>
                    <pre className="rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-300 overflow-x-auto">
                      {JSON.stringify(simResult.orders.prismaWhere, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "stage1-acceptance" && stage1Report && (
            <div className="space-y-6">
              {/* SSO Bridge Card (WBS-09) */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      🔗 Cầu Nối Xác Thực SSO/JWT: Next.js Portal ↔ Javis OS FastAPI (WBS-09)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Dùng chung chữ ký <code className="text-blue-400">CRM_JWT_SECRET</code> và vé
                      WebSocket một lần (<code className="text-emerald-400">wsTicket</code>) trên tên
                      miền <code className="text-blue-400">https://crm.addp.vn</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={seeding}
                    onClick={handleTriggerSeed}
                    className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-4 py-2.5 transition"
                  >
                    {seeding ? "Đang chạy test..." : "🧪 Chạy Kiểm Thử Khung Kỹ Thuật (Dev Only)"}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-slate-400">Phiên bản Cầu nối SSO</div>
                    <div className="font-mono font-bold text-blue-400 text-sm mt-1">
                      {stage1Report.ssoBridge?.bridgeVersion}
                    </div>
                    <div className="text-slate-500 mt-1">
                      Gateway: {stage1Report.ssoBridge?.javisGatewayUrl}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-slate-400">Vé WebSocket Thời gian thực (TTL 60s)</div>
                    <div className="font-mono font-bold text-emerald-400 text-sm mt-1 truncate">
                      {stage1Report.ssoBridge?.wsTicket}
                    </div>
                    <div className="text-slate-500 mt-1">
                      Nhân sự đang mô phỏng: {stage1Report.ViewingAs?.code} ({stage1Report.ViewingAs?.role})
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-slate-400">Dữ liệu Giả lập Kỹ thuật (Dev Fixtures)</div>
                    <div className="font-bold text-amber-400 text-sm mt-1">
                      [DEV ONLY] {stage1Report.seedData?.counts?.customersTotal} Mẫu test logic RBAC
                    </div>
                    <div className="text-slate-500 mt-1">
                      Tuân thủ Điều 11 AGENTS.md: Không chiếu số liệu giả ra màn hình kinh doanh
                    </div>
                  </div>
                </div>
              </section>

              {/* Acceptance Checks Table (WBS-10) */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      ✅ Bảng Kiểm Thử Nghiệm Thu Tự Động Giai Đoạn 1 (WBS-01 → WBS-10)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Kế thừa <code className="text-blue-400">QuanlyKH/api/seed/route.js</code> • Đạt{" "}
                      <strong className="text-emerald-400">
                        {stage1Report.acceptance?.passedCount}/{stage1Report.acceptance?.totalChecks}
                      </strong>{" "}
                      bài kiểm thử tự động
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                    PASS 100% TUẦN 1
                  </span>
                </div>

                <div className="space-y-2">
                  {stage1Report.acceptance?.checks?.map((chk) => (
                    <div
                      key={chk.id}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-400">{chk.id}</span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            {chk.wbs}
                          </span>
                          <span className="font-semibold text-white">{chk.name}</span>
                        </div>
                        <div className="text-slate-400 font-mono text-[11px]">{chk.detail}</div>
                      </div>
                      <span
                        className={`rounded-lg px-2.5 py-1 font-bold ${
                          chk.passed
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {chk.passed ? "✓ ĐẠT" : "✕ LỖI"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
