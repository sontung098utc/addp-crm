"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ZaloQrModal from "./ZaloQrModal";
import FacebookConnectModal from "./FacebookConnectModal";

const PLATFORM_TABS = [
  { id: "ALL", label: "Tất Cả Kênh", icon: "🌐" },
  { id: "ZALO_PERSONAL", label: "Zalo Cá Nhân (QR)", icon: "📱", badge: "Multi-QR" },
  { id: "FACEBOOK", label: "Fanpage Facebook", icon: "💬", badge: "Graph API" },
  { id: "ZALO_OA", label: "Zalo OA", icon: "📢", badge: "ZNS" },
  { id: "TIKTOK_SHOP", label: "TikTok Shop", icon: "🎵", badge: "GMV Max" },
  { id: "SHOPEE", label: "Shopee", icon: "🧡", badge: "Open API v2" },
  { id: "KIOTVIET", label: "KiotViet", icon: "🏭", badge: "POS" },
  { id: "MAGENTO", label: "Website ADDP", icon: "🛒", badge: "Magento 2.4.8" },
];

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState("ALL");
  const [channels, setChannels] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  const [isZaloQrOpen, setIsZaloQrOpen] = useState(false);
  const [isFbModalOpen, setIsFbModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [banner, setBanner] = useState(null);

  // Form thêm tài khoản mới
  const [newForm, setNewForm] = useState({
    platform: "ZALO_PERSONAL",
    name: "",
    externalId: "",
    config: {},
  });

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (data.ok) {
        setChannels(data.channels || []);
        setPlatforms(data.platforms || {});
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối khi tải danh sách kênh." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleTestHealth = async (id) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/channels/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setBanner({ type: "success", text: `[${data.platform}] ${data.message}` });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Kiểm tra kết nối thất bại." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi kiểm tra kết nối." });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteChannel = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa kênh '${name}'?`)) return;
    try {
      const res = await fetch(`/api/channels?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ type: "success", text: data.message });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối khi xóa kênh." });
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ type: "success", text: data.message });
        setIsAddModalOpen(false);
        setNewForm({ platform: "ZALO_PERSONAL", name: "", externalId: "", config: {} });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Không thể thêm kênh." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi thêm kênh mới." });
    }
  };

  const filteredChannels =
    activeTab === "ALL"
      ? channels
      : channels.filter((c) => c.platform === activeTab);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-bold text-cyan-400">
              Giai Đoạn 2: WBS-11 • WBS-12 • WBS-13 • WBS-14
            </span>
            <h1 className="text-lg font-bold text-white">
              Trung Tâm Kết Nối Đa Kênh & Quản Lý Đa Tài Khoản (ConnectionHub)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Hợp nhất 7 nền tảng: Website Magento 2.4.8, Fanpage Facebook, Zalo Cá Nhân (Multi-QR), Zalo OA, TikTok Shop, Shopee và KiotViet
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFbModalOpen(true)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 shadow transition flex items-center gap-1.5"
          >
            <span>📘</span> Kết Nối Fanpage 1-Click
          </button>
          <button
            type="button"
            onClick={() => setIsZaloQrOpen(true)}
            className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-4 py-2.5 shadow transition flex items-center gap-1.5"
          >
            <span>📱</span> Quét Mã QR Zalo Cá Nhân
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 shadow transition flex items-center gap-1.5"
          >
            <span>+</span> Thêm Kênh / Gian Hàng
          </button>
          <Link
            href="/settings"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3.5 py-2.5 transition"
          >
            🔐 Ma Trận Phân Quyền Kênh
          </Link>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium text-slate-400">Tổng Tài Khoản Đang Quản Lý</div>
          <div className="text-2xl font-bold text-white mt-1">{channels.length} Kênh</div>
          <div className="text-xs text-blue-400 mt-2">Bao gồm 7 nền tảng bán hàng & CSKH</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium text-slate-400">Zalo Cá Nhân (Multi-Account)</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {channels.filter((c) => c.platform === "ZALO_PERSONAL").length} Nick QR
          </div>
          <div className="text-xs text-slate-400 mt-2">Mỗi tài khoản 1 thư mục phiên cô lập</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium text-slate-400">Bảo Vệ Tài Khoản (Anti-Ban)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">45s – 120s</div>
          <div className="text-xs text-slate-400 mt-2">Giới hạn ≤ 70 tin/nick/ngày (Điều 4)</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs font-medium text-slate-400">Định Danh Khách Hàng</div>
          <div className="text-2xl font-bold text-purple-400 mt-1">10 Chữ Số</div>
          <div className="text-xs text-slate-400 mt-2">Gộp hội thoại & đơn theo normalizePhone</div>
        </div>
      </div>

      {/* Platform Navigation Tabs (Kế thừa từ channels_view.php) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {PLATFORM_TABS.map((tab) => {
          const count =
            tab.id === "ALL"
              ? channels.length
              : channels.filter((c) => c.platform === tab.id).length;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition ${
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  active ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Channels List */}
      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-xs text-slate-400">
          Đang tải danh sách tài khoản kênh...
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-3">
          <div className="text-2xl">🔌</div>
          <div className="text-sm font-bold text-white">Chưa Có Tài Khoản Nào Cho Kênh Này</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Bấm nút &ldquo;Thêm Kênh / Gian Hàng&rdquo; hoặc &ldquo;Quét Mã QR Zalo&rdquo; để bắt đầu kết nối.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChannels.map((ch) => {
            const meta = platforms[ch.platform] || {};
            const isTesting = testingId === ch.id;

            return (
              <div
                key={ch.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                        meta.color || "text-slate-300 bg-slate-800 border-slate-700"
                      }`}
                    >
                      {meta.label || ch.platform}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      {ch.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{ch.name}</h3>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      ID: {ch.externalId}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">{meta.desc}</p>

                  <div className="rounded-xl bg-slate-950 p-3 space-y-1 text-[11px]">
                    <div className="flex justify-between text-slate-400">
                      <span>Trạng thái:</span>
                      <span className="text-slate-200 font-medium">{ch.statusLabel}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Nhân sự phụ trách:</span>
                      <span className="text-blue-400 font-semibold font-mono">
                        {ch.assignedStaffCodes?.join(", ") || "ADMIN"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => handleTestHealth(ch.id)}
                    className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 transition"
                  >
                    {isTesting ? "Đang kiểm tra..." : "⚡ Kiểm Tra Kết Nối"}
                  </button>
                  {ch.platform === "FACEBOOK" && (
                    <button
                      type="button"
                      onClick={() => setIsFbModalOpen(true)}
                      className="rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold px-3 py-2 hover:bg-blue-600/30 transition"
                    >
                      {ch.status === "CONNECTED" ? "Đổi Fanpage" : "Chọn Fanpage"}
                    </button>
                  )}
                  {ch.platform === "ZALO_PERSONAL" && (
                    <>
                      {ch.status === "CONNECTED" && (
                        <Link
                          href="/inbox"
                          className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-2 transition flex items-center gap-1"
                        >
                          💬 Vào Nhắn Tin
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsZaloQrOpen(true)}
                        className="rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold px-3 py-2 hover:bg-cyan-600/30 transition"
                      >
                        {ch.status === "CONNECTED" ? "Đổi Nick QR" : "Quét Lại QR"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch.id, ch.name)}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold px-3 py-2 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm Tài Khoản Kênh Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Thêm Kênh / Gian Hàng Mới (WBS-11)</h3>
                <p className="text-xs text-slate-400">
                  Lưu trữ mã hóa Token an toàn bằng AES-256-GCM
                </p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Chọn Nền Tảng</label>
                <select
                  value={newForm.platform}
                  onChange={(e) => setNewForm({ ...newForm, platform: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                >
                  {Object.entries(platforms).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tên Nhận Diện Tài Khoản (VD: Fanpage Sữa Hạt, Zalo Bác Sĩ...) *
                </label>
                <input
                  required
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="VD: Fanpage ADDP Đông Trùng Hạ Thảo"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Mã ID Đối Tác / Page ID / Shop ID
                </label>
                <input
                  value={newForm.externalId}
                  onChange={(e) => setNewForm({ ...newForm, externalId: e.target.value })}
                  placeholder="VD: fb_page_10293 hoặc shop_shopee_8899"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white font-mono"
                />
              </div>

              {/* Dynamic fields based on platform */}
              {newForm.platform === "MAGENTO" && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Domain Website Magento 2.4.8</label>
                  <input
                    value={newForm.config.domain || "https://addp.vn"}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        config: { ...newForm.config, domain: e.target.value },
                      })
                    }
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
              )}

              {newForm.platform === "FACEBOOK" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Page Access Token (Long-lived)</label>
                    <input
                      type="password"
                      placeholder="EAA..."
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, pageAccessToken: e.target.value },
                        })
                      }
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 space-y-1.5 text-[11px] text-blue-200">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>📘 Webhook Meta Graph API (WBS-16 & 17)</span>
                    </div>
                    <p>• Callback URL: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/facebook</code></p>
                    <p>• Verify Token: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 font-mono">addp_crm_fb_webhook_secret_2026</code></p>
                    <p className="text-emerald-400 font-semibold">✓ Đã bật tự động ẩn bình luận chứa SĐT khách hàng (Chống cướp khách)</p>
                  </div>
                </div>
              )}

              {newForm.platform === "ZALO_OA" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">OA ID</label>
                      <input
                        placeholder="1829..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, oaId: e.target.value },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">App ID</label>
                      <input
                        placeholder="2938..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, appId: e.target.value },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 space-y-1.5 text-[11px] text-sky-200">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>🏢 Webhook Zalo OA Open API v3 (WBS-15 & 17)</span>
                    </div>
                    <p>• Webhook URL: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/zalo-oa</code></p>
                    <p>• Sự kiện đã kích hoạt: <span className="text-white">user_send_text, user_send_image, user_submit_info, follow</span></p>
                    <p className="text-emerald-400 font-semibold">✓ Hỗ trợ CSKH tự động ZNS và xoay vòng Refresh Token</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold"
                >
                  Lưu Kênh Kết Nối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quét Mã QR Zalo Cá Nhân (WBS-14) */}
      <ZaloQrModal
        isOpen={isZaloQrOpen}
        onClose={() => setIsZaloQrOpen(false)}
        onLoggedIn={(accountInfo) => {
          setBanner({
            type: "success",
            text: `Đăng nhập Zalo cá nhân thành công (${accountInfo.label || "Nick mới"})!`,
          });
          loadChannels();
        }}
      />

      {/* Modal Kết Nối Fanpage 1-Click (WBS-16 & 17) */}
      <FacebookConnectModal
        isOpen={isFbModalOpen}
        onClose={() => setIsFbModalOpen(false)}
        onConnected={(newPages) => {
          setBanner({
            type: "success",
            text: `Đã kết nối thành công ${newPages.length} Fanpage vào CRM!`,
          });
          loadChannels();
        }}
      />
    </div>
  );
}
