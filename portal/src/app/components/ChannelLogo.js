"use client";

/**
 * ADDP CRM — Logo Chuẩn Thương Hiệu Đa Kênh (Zalo, TikTok, Shopee, Facebook, Zalo OA, KiotViet, Website)
 * Dùng SVG nội bộ sắc nét, tải tức thì 0ms, không phụ thuộc CDN ngoài.
 */
export default function ChannelLogo({ platform = "ZALO_PERSONAL", size = 18, className = "" }) {
  const key = String(platform || "ZALO_PERSONAL").toUpperCase();

  if (key === "FACEBOOK" || key === "FB") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="Facebook"
      >
        <circle cx="12" cy="12" r="11" fill="#1877F2" />
        <path
          d="M15.12 12.67L15.66 9.15H12.28V6.87C12.28 5.91 12.75 4.97 14.26 4.97H15.8V1.98C15.8 1.98 14.41 1.74 13.08 1.74C10.31 1.74 8.5 3.42 8.5 6.46V9.15H5.4V12.67H8.5V21.18C9.12 21.28 9.76 21.33 10.41 21.33C11.06 21.33 11.7 21.28 12.32 21.18V12.67H15.12Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (key === "TIKTOK_SHOP" || key === "TIKTOK" || key === "TT") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="TikTok Shop"
      >
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#0F0F0F" />
        {/* Cyan offset layer */}
        <path
          d="M15.7 7.8C14.7 7.1 14 6 13.9 4.8H11.9V14.7C11.9 15.9 10.9 16.9 9.7 16.9C8.5 16.9 7.5 15.9 7.5 14.7C7.5 13.5 8.5 12.5 9.7 12.5C9.9 12.5 10.2 12.5 10.4 12.6V10.4C10.2 10.4 9.9 10.3 9.7 10.3C7.3 10.3 5.3 12.3 5.3 14.7C5.3 17.1 7.3 19.1 9.7 19.1C12.1 19.1 14.1 17.1 14.1 14.7V9.7C15 10.4 16.2 10.8 17.4 10.8V8.7C16.8 8.7 16.2 8.4 15.7 7.8Z"
          fill="#25F4EE"
          transform="translate(-0.6, -0.5)"
        />
        {/* Pink offset layer */}
        <path
          d="M15.7 7.8C14.7 7.1 14 6 13.9 4.8H11.9V14.7C11.9 15.9 10.9 16.9 9.7 16.9C8.5 16.9 7.5 15.9 7.5 14.7C7.5 13.5 8.5 12.5 9.7 12.5C9.9 12.5 10.2 12.5 10.4 12.6V10.4C10.2 10.4 9.9 10.3 9.7 10.3C7.3 10.3 5.3 12.3 5.3 14.7C5.3 17.1 7.3 19.1 9.7 19.1C12.1 19.1 14.1 17.1 14.1 14.7V9.7C15 10.4 16.2 10.8 17.4 10.8V8.7C16.8 8.7 16.2 8.4 15.7 7.8Z"
          fill="#FE2C55"
          transform="translate(0.6, 0.5)"
        />
        {/* White main note */}
        <path
          d="M15.7 7.8C14.7 7.1 14 6 13.9 4.8H11.9V14.7C11.9 15.9 10.9 16.9 9.7 16.9C8.5 16.9 7.5 15.9 7.5 14.7C7.5 13.5 8.5 12.5 9.7 12.5C9.9 12.5 10.2 12.5 10.4 12.6V10.4C10.2 10.4 9.9 10.3 9.7 10.3C7.3 10.3 5.3 12.3 5.3 14.7C5.3 17.1 7.3 19.1 9.7 19.1C12.1 19.1 14.1 17.1 14.1 14.7V9.7C15 10.4 16.2 10.8 17.4 10.8V8.7C16.8 8.7 16.2 8.4 15.7 7.8Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (key === "SHOPEE" || key === "SP") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="Shopee"
      >
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#EE4D2D" />
        {/* Bag handle */}
        <path
          d="M9 8V7C9 5.34 10.34 4 12 4C13.66 4 15 5.34 15 7V8"
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {/* Shopping bag body */}
        <path
          d="M6.2 8.2H17.8L18.6 18.6C18.67 19.42 18.02 20.1 17.2 20.1H6.8C5.98 20.1 5.33 19.42 5.4 18.6L6.2 8.2Z"
          fill="#FFFFFF"
        />
        {/* Letter S */}
        <path
          d="M14.2 12.3C14.2 11.4 13.3 10.8 12.1 10.8C10.8 10.8 9.9 11.5 9.9 12.4C9.9 13.5 10.9 13.9 12.2 14.2C13.4 14.5 14.2 14.9 14.2 15.9C14.2 17 13.2 17.7 11.9 17.7C10.6 17.7 9.7 17.1 9.5 16.1"
          stroke="#EE4D2D"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "ZALO_OA" || key === "OA") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="Zalo OA"
      >
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#0088FF" />
        <path
          d="M12 4.2L18 6.8V11.8C18 15.6 15.4 18.9 12 19.9C8.6 18.9 6 15.6 6 11.8V6.8L12 4.2Z"
          fill="#FFFFFF"
        />
        <text
          x="12"
          y="14.2"
          textAnchor="middle"
          fill="#0088FF"
          fontSize="6.8"
          fontWeight="900"
          fontFamily="Arial, sans-serif"
        >
          OA
        </text>
      </svg>
    );
  }

  if (key === "KIOTVIET") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="KiotViet"
      >
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#0070F4" />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="10"
          fontWeight="900"
          fontFamily="Arial, sans-serif"
        >
          KV
        </text>
      </svg>
    );
  }

  if (key === "MAGENTO" || key === "LIVECHAT" || key === "WEB") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={`shrink-0 ${className}`}
        aria-label="Website ADDP"
      >
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#F26322" />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="9.5"
          fontWeight="900"
          fontFamily="Arial, sans-serif"
        >
          W
        </text>
      </svg>
    );
  }

  // Default: Zalo Cá Nhân (Official Zalo Blue rounded square + white chat bubble + Zalo text)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-label="Zalo"
    >
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#0068FF" />
      <path
        d="M12 4.5C7.6 4.5 4.2 7.4 4.2 11.1C4.2 13.1 5.2 14.9 6.8 16.1L5.8 19.3L9.3 17.7C10.1 17.9 11 18 12 18C16.4 18 19.8 15.1 19.8 11.1C19.8 7.4 16.4 4.5 12 4.5Z"
        fill="#FFFFFF"
      />
      <text
        x="12"
        y="13.2"
        textAnchor="middle"
        fill="#0068FF"
        fontSize="5.8"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        Zalo
      </text>
    </svg>
  );
}
