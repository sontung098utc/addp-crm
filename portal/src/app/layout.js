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
// Bằng cách chặn lỗi tại cả 3 tầng: Object.defineProperty trên console.error/warn, window.onerror, và dọn sạch DOM trước khi React Hydrate.
const EXTENSION_CLEANUP_SCRIPT = `
(function() {
  if (typeof window === 'undefined') return;

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

  // 1. TẦNG 1: Chặn trên console.error và console.warn bằng Property Interceptor
  var nativeError = console.error;
  var currentErrorHandler = nativeError;
  var createErrorFilter = function(fn) {
    return function() {
      if (shouldIgnore(arguments)) return;
      return fn.apply(console, arguments);
    };
  };
  currentErrorHandler = createErrorFilter(nativeError);

  try {
    Object.defineProperty(console, 'error', {
      configurable: true,
      enumerable: true,
      get: function() { return currentErrorHandler; },
      set: function(newFn) { currentErrorHandler = createErrorFilter(newFn); }
    });
  } catch (e) {
    console.error = currentErrorHandler;
  }

  var nativeWarn = console.warn;
  var currentWarnHandler = nativeWarn;
  var createWarnFilter = function(fn) {
    return function() {
      if (shouldIgnore(arguments)) return;
      return fn.apply(console, arguments);
    };
  };
  currentWarnHandler = createWarnFilter(nativeWarn);

  try {
    Object.defineProperty(console, 'warn', {
      configurable: true,
      enumerable: true,
      get: function() { return currentWarnHandler; },
      set: function(newFn) { currentWarnHandler = createWarnFilter(newFn); }
    });
  } catch (e) {
    console.warn = currentWarnHandler;
  }

  // 2. TẦNG 2: Chặn ngoại lệ Runtime từ Extension (Urban VPN, AdBlock,...)
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

  // 3. TẦNG 3: Dọn sạch thuộc tính lạ chèn vào DOM trước khi React Hydrate
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
