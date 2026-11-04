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
// và chặn các ngoại lệ Runtime do Extension bên thứ 3 (như Urban VPN M_ID) làm kích hoạt Next.js Error Overlay.
const EXTENSION_CLEANUP_SCRIPT = `
(function() {
  try {
    // 1. Chặn ngoại lệ Runtime từ Chrome Extension (Urban VPN, AdBlock,...)
    if (typeof window !== 'undefined') {
      window.addEventListener('error', function(event) {
        var fn = event.filename || '';
        var msg = event.message || '';
        var stack = (event.error && (event.error.stack || event.error.message)) || '';
        if (
          fn.indexOf('chrome-extension://') !== -1 ||
          fn.indexOf('moz-extension://') !== -1 ||
          stack.indexOf('chrome-extension://') !== -1 ||
          stack.indexOf('moz-extension://') !== -1 ||
          msg.indexOf('M_ID') !== -1 ||
          stack.indexOf('M_ID') !== -1 ||
          msg.indexOf('bis_') !== -1
        ) {
          event.stopImmediatePropagation();
          event.preventDefault();
          return true;
        }
      }, true);

      window.addEventListener('unhandledrejection', function(event) {
        var reason = event.reason;
        var str = (reason && (reason.stack || reason.message || String(reason))) || '';
        if (
          str.indexOf('chrome-extension://') !== -1 ||
          str.indexOf('moz-extension://') !== -1 ||
          str.indexOf('M_ID') !== -1
        ) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }, true);
    }

    // 2. Dọn sạch thuộc tính lạ chèn vào DOM trước khi React Hydrate
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
    var isCleaning = false;
    var obs = new MutationObserver(function(mutations) {
      if (isCleaning) return;
      var hasTargetAttr = false;
      for (var i = 0; i < mutations.length; i++) {
        var a = mutations[i].attributeName;
        if (a && (a.indexOf('bis_') === 0 || a === 'data-phoseo-extension')) {
          hasTargetAttr = true;
          break;
        }
      }
      if (hasTargetAttr) {
        isCleaning = true;
        cleanAttrs(document);
        isCleaning = false;
      }
    });
    obs.observe(document.documentElement, { attributes: true, subtree: true });
    setTimeout(function() { obs.disconnect(); }, 2000);
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
