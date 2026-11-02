import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ADDP Omnichannel AI CRM — Hệ Thống Quản Trị & Chăm Sóc Khách Hàng Đa Kênh",
  description:
    "Nền tảng hợp nhất Website Magento 2.4.8, Fanpage Facebook, Zalo Cá Nhân, Zalo OA, TikTok Shop, Shopee và KiotViet cho ADDP.",
};

// Script dọn sạch các thuộc tính lạ do Chrome Extension (Bitdefender bis_skin_checked, PhoSEO, v.v.)
// tự ý chèn vào DOM trước khi React 19 Hydrate, ngăn chặn triệt để lỗi Hydration Mismatch.
const EXTENSION_CLEANUP_SCRIPT = `
(function() {
  try {
    var cleanAttrs = function(root) {
      if (!root || !root.querySelectorAll) return;
      var els = root.querySelectorAll('[bis_skin_checked],[bis_register],[data-phoseo-extension]');
      for (var i = 0; i < els.length; i++) {
        els[i].removeAttribute('bis_skin_checked');
        els[i].removeAttribute('bis_register');
        els[i].removeAttribute('data-phoseo-extension');
      }
      var html = document.documentElement;
      var body = document.body;
      [html, body].forEach(function(el) {
        if (!el || !el.attributes) return;
        for (var j = el.attributes.length - 1; j >= 0; j--) {
          var name = el.attributes[j].name;
          if (name.indexOf('bis_') === 0 || name.indexOf('__processed_') === 0 || name === 'data-phoseo-extension') {
            el.removeAttribute(name);
          }
        }
      });
    };
    cleanAttrs(document);
    var obs = new MutationObserver(function() { cleanAttrs(document); });
    obs.observe(document.documentElement, { attributes: true, subtree: true });
    setTimeout(function() { obs.disconnect(); }, 4000);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_CLEANUP_SCRIPT }} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-slate-950 text-slate-100"
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
