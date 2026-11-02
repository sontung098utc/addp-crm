#!/usr/bin/env bash
# ============================================================================
# Xin chứng chỉ SSL Let's Encrypt LẦN ĐẦU cho crm.addp.vn (WBS-01).
# Điều kiện: bản ghi DNS A của crm.addp.vn đã trỏ về IP public của server,
#            cổng 80 + 443 đã mở trên firewall/router công ty.
# Chạy trong thư mục deploy/:   bash scripts/init-ssl.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "[LỖI] Chưa có deploy/.env. Chạy: cp .env.example .env rồi điền giá trị thật." >&2
  exit 1
fi
set -a; . ./.env; set +a
DOMAIN="${CRM_DOMAIN:-crm.addp.vn}"
EMAIL="${LETSENCRYPT_EMAIL:?Thiếu LETSENCRYPT_EMAIL trong .env}"

if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
  echo "Đã có chứng chỉ cho $DOMAIN - bỏ qua. (certbot tự gia hạn mỗi 12 giờ)"
  exit 0
fi

echo "[1/4] Kiểm tra DNS $DOMAIN ..."
getent hosts "$DOMAIN" || { echo "[LỖI] $DOMAIN chưa phân giải được DNS." >&2; exit 1; }

mkdir -p certbot/www certbot/conf

echo "[2/4] Bật nginx tạm (chỉ cổng 80) ..."
docker run -d --rm --name crm-nginx-bootstrap -p 80:80 \
  -v "$PWD/nginx/bootstrap:/etc/nginx/conf.d:ro" \
  -v "$PWD/certbot/www:/var/www/certbot:ro" nginx:1.27-alpine >/dev/null
trap 'docker stop crm-nginx-bootstrap >/dev/null 2>&1 || true' EXIT

echo "[3/4] Xin chứng chỉ Let's Encrypt cho $DOMAIN ..."
docker run --rm \
  -v "$PWD/certbot/www:/var/www/certbot" \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

echo "[4/4] Xong. Khởi động toàn hệ thống:  docker compose up -d --build"
