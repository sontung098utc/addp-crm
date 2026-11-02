export default function HomePage() {
  const channels = [
    { name: "Website Magento 2.4.8", desc: "ADDP.vn, CustomForm & Minigame", badge: "Sẵn sàng cấu hình" },
    { name: "Fanpage Facebook", desc: "Đa Fanpage Messenger & Bình luận", badge: "Sẵn sàng cấu hình" },
    { name: "Zalo Cá Nhân (Multi-QR)", desc: "Đăng nhập nhiều tài khoản Zalo qua QR", badge: "Sẵn sàng cấu hình" },
    { name: "Zalo Official Account", desc: "Zalo OA Open API v3 & Tin nhắn ZNS", badge: "Sẵn sàng cấu hình" },
    { name: "TikTok Shop & Ads", desc: "Đa gian hàng TikTok & GMV Max", badge: "Sẵn sàng cấu hình" },
    { name: "Shopee Open API v2", desc: "Đa gian hàng Shopee & Vận đơn SPX", badge: "Sẵn sàng cấu hình" },
    { name: "KiotViet POS & Kho", desc: "Đồng bộ Hóa đơn, Tồn kho & Lịch CSKH", badge: "Sẵn sàng cấu hình" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg shadow">
            A
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ADDP Omnichannel AI CRM</h1>
            <p className="text-xs text-slate-400">Tên miền: https://crm.addp.vn • Phương án A (Hybrid Micro-Modular)</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
          ● Hạ tầng Ngày 1 (WBS-01 & WBS-02) Đã Sẵn Sàng
        </span>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-xl font-bold mb-2">Trung Tâm Quản Trị & Chăm Sóc Khách Hàng Đa Kênh ADDP</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Hệ thống hợp nhất 7 kênh bán hàng và chăm sóc khách hàng về 1 nơi duy nhất, tích hợp AI tự động trả lời 24/7,
            gửi tin nhắn hàng loạt an toàn, phân loại thẻ khách hàng, theo dõi bệnh lý và lộ trình chăm sóc Ngày 1-3-7-14-21.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            7 Nền Tảng Kết Nối Đa Tài Khoản
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((ch) => (
              <div
                key={ch.name}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-slate-100">{ch.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{ch.desc}</div>
                </div>
                <div className="text-xs text-blue-400 font-medium">{ch.badge}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
