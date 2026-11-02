#!/usr/bin/env bash
# Sao lưu CSDL addp_crm mỗi ngày, giữ 14 bản gần nhất.
# Cài cron trên server:  30 2 * * * cd /opt/addp-crm/deploy && bash scripts/backup-mysql.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
mkdir -p backups
FILE="backups/addp_crm_$(date +%Y%m%d_%H%M).sql.gz"
docker exec crm-mysql sh -c "mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines --triggers ${MYSQL_DATABASE:-addp_crm}" | gzip > "$FILE"
echo "$(date '+%F %T') Đã sao lưu: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t backups/addp_crm_*.sql.gz | tail -n +15 | xargs -r rm -f
