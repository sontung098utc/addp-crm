"use client";

import dynamic from "next/dynamic";

const LiveZaloInbox = dynamic(() => import("./LiveZaloInbox"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center p-12 text-slate-400 text-sm">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span>Đang khởi động Hộp thư Hợp nhất Đa kênh...</span>
      </div>
    </div>
  ),
});

export default function InboxPage() {
  return <LiveZaloInbox />;
}
