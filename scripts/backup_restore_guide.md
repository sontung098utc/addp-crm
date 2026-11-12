# QUY TRÌNH SAO LƯU VÀ PHỤC HỒI DỮ LIỆU ĐỘC LẬP (BACKUP & RESTORE PROCEDURES)

> **Mục tiêu:** Đảm bảo toàn vẹn dữ liệu cho cả kho lưu trữ tệp `.data/` và Cơ sở dữ liệu MySQL `addp_crm` / `addp_crm_staging`. Có thể kiểm tra tính toàn vẹn thông qua mã băm SHA-256.

---

## 1. QUY TRÌNH SAO LƯU (BACKUP)

### A. Sao lưu Cơ sở dữ liệu MySQL (Transaction Safe)
Sử dụng cờ `--single-transaction` và `--quick` để không khóa bảng khi đang có đơn hàng hoặc tin nhắn gửi đến:

```bash
# Định dạng tên file: backup_mysql_YYYYMMDD_HHMMSS.sql.gz
BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups/db"
mkdir -p "$BACKUP_DIR"

mysqldump -u addp_crm_user -p \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  addp_crm | gzip > "$BACKUP_DIR/backup_mysql_${BACKUP_DATE}.sql.gz"

# Tạo checksum SHA-256 để kiểm tra tính toàn vẹn
sha256sum "$BACKUP_DIR/backup_mysql_${BACKUP_DATE}.sql.gz" > "$BACKUP_DIR/backup_mysql_${BACKUP_DATE}.sql.gz.sha256"
```

### B. Sao lưu Kho tệp JSON và Cấu hình Kênh (`portal/.data/`)
```bash
BACKUP_DATA_DIR="./backups/data"
mkdir -p "$BACKUP_DATA_DIR"

tar -czvf "$BACKUP_DATA_DIR/backup_data_${BACKUP_DATE}.tar.gz" portal/.data/
sha256sum "$BACKUP_DATA_DIR/backup_data_${BACKUP_DATE}.tar.gz" > "$BACKUP_DATA_DIR/backup_data_${BACKUP_DATE}.tar.gz.sha256"
```

---

## 2. QUY TRÌNH PHỤC HỒI (RESTORE) & KIỂM TRA

### Bước 1: Xác minh tính toàn vẹn của tệp sao lưu
```bash
sha256sum -c backups/db/backup_mysql_20261111_020000.sql.gz.sha256
# Kết quả phải trả về: OK
```

### Bước 2: Phục hồi vào CSDL thử nghiệm (Isolation Test)
Tuyệt đối không restore đè trực tiếp lên CSDL đang chạy. Luôn phục hồi vào CSDL staging để kiểm tra:
```bash
# Tạo DB test
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS addp_crm_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Giải nén và nạp dữ liệu
gunzip < backups/db/backup_mysql_20261111_020000.sql.gz | mysql -u root -p addp_crm_restore_test

# Kiểm tra số lượng bản ghi
mysql -u root -p -e "SELECT count(*) FROM addp_crm_restore_test.customers; SELECT count(*) FROM addp_crm_restore_test.orders;"
```

### Bước 3: Phục hồi tệp JSON khi cần
```bash
tar -xzvf backups/data/backup_data_20261111_020000.tar.gz -C ./
```
