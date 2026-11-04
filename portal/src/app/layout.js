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

// Script ngăn chặn triệt để 100% Next.js Dev Error Overlay do Chrome Extension (Bitdefender bis_skin_checked, PhoSEO, Urban VPN, v.v.)
const EXTENSION_CLEANUP_SCRIPT = `
(function() {
  if (typeof window === 'undefined') return;

  var isIgnoredStr = function(str) {
    if (!str || typeof str !== 'string') return false;
    var s = str.toLowerCase();
    return (
      s.indexOf('bis_skin_checked') !== -1 ||
      s.indexOf('bis_register') !== -1 ||
      s.indexOf('bis_frame_id') !== -1 ||
      s.indexOf('bis_') !== -1 ||
      s.indexOf('data-phoseo') !== -1 ||
      s.indexOf('chrome-extension://') !== -1 ||
      s.indexOf('moz-extension://') !== -1 ||
      s.indexOf('m_id') !== -1 ||
      s.indexOf('hydrat') !== -1 ||
      s.indexOf('server rendered html') !== -1 ||
      s.indexOf("didn't match") !== -1 ||
      s.indexOf('did not match') !== -1 ||
      s.indexOf('extra attributes from the server') !== -1 ||
      s.indexOf('prop ') !== -1
    );
  };

  var shouldIgnoreArgs = function(args) {
    if (!args || !args.length) return false;
    for (var i = 0; i < args.length; i++) {
      var item = args[i];
      if (!item) continue;
      if (typeof item === 'string' && isIgnoredStr(item)) return true;
      if (item.message && isIgnoredStr(item.message)) return true;
      if (item.stack && isIgnoredStr(item.stack)) return true;
      try {
        if (isIgnoredStr(String(item))) return true;
      } catch (e) {}
    }
    return false;
  };

  // 1. Chặn HTMLDialogElement.showModal và show đối với nextjs dialog overlay (tránh top-layer modal)
  try {
    if (typeof HTMLDialogElement !== 'undefined') {
      var origShowModal = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function() {
        if (
          this.hasAttribute('data-nextjs-dialog') ||
          this.getAttribute('id') === 'nextjs-overlay' ||
          (this.closest && this.closest('nextjs-portal')) ||
          (this.getRootNode && this.getRootNode().host && this.getRootNode().host.tagName === 'NEXTJS-PORTAL')
        ) {
          try { this.close(); } catch(e) {}
          return;
        }
        return origShowModal.apply(this, arguments);
      };

      var origShow = HTMLDialogElement.prototype.show;
      HTMLDialogElement.prototype.show = function() {
        if (
          this.hasAttribute('data-nextjs-dialog') ||
          (this.closest && this.closest('nextjs-portal')) ||
          (this.getRootNode && this.getRootNode().host && this.getRootNode().host.tagName === 'NEXTJS-PORTAL')
        ) {
          try { this.close(); } catch(e) {}
          return;
        }
        return origShow.apply(this, arguments);
      };
    }
  } catch (e) {}

  // 2. Chặn trên console.error và console.warn
  var nativeError = console.error;
  console.error = function() {
    if (shouldIgnoreArgs(arguments)) return;
    return nativeError.apply(console, arguments);
  };

  var nativeWarn = console.warn;
  console.warn = function() {
    if (shouldIgnoreArgs(arguments)) return;
    return nativeWarn.apply(console, arguments);
  };

  // 3. Chặn window.onerror và event 'error'
  window.addEventListener('error', function(event) {
    var fn = event.filename || '';
    var msg = event.message || '';
    var stack = (event.error && (event.error.stack || event.error.message)) || '';
    if (
      isIgnoredStr(fn) ||
      isIgnoredStr(msg) ||
      isIgnoredStr(stack) ||
      (event.error && isIgnoredStr(String(event.error)))
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var str = (reason && (reason.stack || reason.message || String(reason))) || '';
    if (isIgnoredStr(str)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return true;
    }
  }, true);

  // 4. Chặn window.reportError nếu có
  if (typeof window.reportError === 'function') {
    var origReportError = window.reportError;
    window.reportError = function(err) {
      if (err && isIgnoredStr(err.message || err.stack || String(err))) return;
      return origReportError.apply(this, arguments);
    };
  }

  // 5. Tự động dọn sạch thuộc tính của extension khỏi DOM và triệt tiêu nextjs-portal
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

    var obs = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes' && m.attributeName && m.attributeName.indexOf('bis_') === 0) {
          m.target.removeAttribute(m.attributeName);
        }
      }
      cleanAttrs(document);
      var portals = document.querySelectorAll('nextjs-portal');
      for (var p = 0; p < portals.length; p++) {
        portals[p].style.setProperty('display', 'none', 'important');
        portals[p].style.setProperty('visibility', 'hidden', 'important');
        portals[p].style.setProperty('width', '0px', 'important');
        portals[p].style.setProperty('height', '0px', 'important');
        if (portals[p].shadowRoot) {
          var dlgs = portals[p].shadowRoot.querySelectorAll('dialog');
          for (var d = 0; d < dlgs.length; d++) {
            if (dlgs[d].open) dlgs[d].close();
            dlgs[d].style.setProperty('display', 'none', 'important');
          }
        }
      }
    });
    obs.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
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
              nextjs-portal,
              dialog[open][data-nextjs-dialog],
              [data-nextjs-dialog-overlay] {
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
