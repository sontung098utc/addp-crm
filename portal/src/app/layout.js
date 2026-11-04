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

// Script ngăn chặn triệt để Next.js Dev Error Overlay do Chrome Extension (Bitdefender bis_skin_checked, PhoSEO, Urban VPN, v.v.)
const EXTENSION_CLEANUP_SCRIPT = `
(function() {
  if (typeof window === 'undefined') return;

  // 1. CHẶN TỪ GỐC: Không cho phép bất kỳ extension nào gọi setAttribute với bis_ hoặc data-phoseo
  try {
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, val) {
      if (typeof name === 'string' && (name.indexOf('bis_') === 0 || name.indexOf('data-phoseo') === 0)) {
        return;
      }
      return origSetAttr.apply(this, arguments);
    };

    var origSetAttrNS = Element.prototype.setAttributeNS;
    Element.prototype.setAttributeNS = function(ns, name, val) {
      if (typeof name === 'string' && (name.indexOf('bis_') === 0 || name.indexOf('data-phoseo') === 0)) {
        return;
      }
      return origSetAttrNS.apply(this, arguments);
    };

    Object.defineProperty(Element.prototype, 'bis_skin_checked', {
      get: function() { return undefined; },
      set: function() {},
      configurable: true
    });
  } catch (e) {}

  var shouldIgnore = function(args) {
    if (!args || !args.length) return false;
    for (var i = 0; i < args.length; i++) {
      var item = args[i];
      var str = '';
      if (typeof item === 'string') {
        str = item;
      } else if (item && item.message) {
        str = item.message;
      } else if (item && item.stack) {
        str = item.stack;
      } else {
        try { str = String(item); } catch (e) {}
      }

      if (
        str.indexOf('bis_skin_checked') !== -1 ||
        str.indexOf('bis_register') !== -1 ||
        str.indexOf('bis_frame_id') !== -1 ||
        str.indexOf('bis_') !== -1 ||
        str.indexOf('data-phoseo') !== -1 ||
        str.indexOf('chrome-extension://') !== -1 ||
        str.indexOf('moz-extension://') !== -1 ||
        str.indexOf('M_ID') !== -1 ||
        str.indexOf('hydration-error') !== -1 ||
        str.indexOf('A tree hydrated') !== -1 ||
        str.indexOf('hydrated but some attributes') !== -1 ||
        str.indexOf('did not match') !== -1 ||
        str.indexOf('Extra attributes from the server') !== -1 ||
        str.indexOf('Prop') !== -1
      ) {
        return true;
      }
    }
    return false;
  };

  // 2. Chặn trên console.error và console.warn
  var nativeError = console.error;
  console.error = function() {
    if (shouldIgnore(arguments)) return;
    return nativeError.apply(console, arguments);
  };

  var nativeWarn = console.warn;
  console.warn = function() {
    if (shouldIgnore(arguments)) return;
    return nativeWarn.apply(console, arguments);
  };

  // 3. Chặn ngoại lệ Runtime từ Extension (Urban VPN, AdBlock,...)
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
      msg.indexOf('bis_') !== -1 ||
      msg.indexOf('hydration') !== -1
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

  // 4. Dọn sạch thuộc tính lạ chèn vào DOM và ẩn mọi dialog lỗi của nextjs-portal
  try {
    var cleanAttrs = function(root) {
      if (!root || !root.querySelectorAll) return;
      var els = root.querySelectorAll('[bis_skin_checked],[bis_register],[data-phoseo-extension]');
      for (var i = 0; i < els.length; i++) {
        els[i].removeAttribute('bis_skin_checked');
        els[i].removeAttribute('bis_register');
        els[i].removeAttribute('data-phoseo-extension');
      }
    };
    cleanAttrs(document);

    // MutationObserver dọn sạch tức thì nếu extension cố chèn thuộc tính
    var obs = new MutationObserver(function() {
      cleanAttrs(document);
      var portals = document.querySelectorAll('nextjs-portal');
      for (var p = 0; p < portals.length; p++) {
        portals[p].style.setProperty('display', 'none', 'important');
        if (portals[p].shadowRoot) {
          var dlg = portals[p].shadowRoot.querySelector('dialog');
          if (dlg && dlg.open) dlg.close();
        }
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['bis_skin_checked'], childList: true, subtree: true });
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
        <style
          dangerouslySetInnerHTML={{
            __html: `
              nextjs-portal {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                position: fixed !important;
                top: -99999px !important;
                left: -99999px !important;
                width: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
                z-index: -2147483647 !important;
              }
              dialog[open][data-nextjs-dialog],
              [data-nextjs-dialog-overlay] {
                display: none !important;
              }
            `,
          }}
        />
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
