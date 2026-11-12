// ============================================================================
// ADDP CRM - PM2 PROCESS MANAGER CONFIGURATION (PRODUCTION)
// Dành cho triển khai trực tiếp trên máy chủ Linux/Windows không dùng Docker
// ============================================================================

module.exports = {
  apps: [
    {
      name: "addp-crm-portal",
      cwd: "./portal",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        APP_ENV: "production",
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: "production",
        APP_ENV: "staging",
        PORT: 3006,
        DATA_DIR: ".data_staging",
        PILOT_SAFE_MODE: "true",
        QA_DISABLE_AUTO_SYNC: "true",
      },
    },
    {
      name: "addp-crm-staging",
      cwd: "./portal",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3006",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        APP_ENV: "staging",
        PORT: 3006,
        DATA_DIR: ".data_staging",
        PILOT_SAFE_MODE: "true",
        QA_DISABLE_AUTO_SYNC: "true",
      },
    },
    {
      name: "addp-crm-gateway",
      cwd: "./server",
      script: "python3",
      args: "-m uvicorn app:app --host 127.0.0.1 --port 8000 --workers 2",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        PYTHONUNBUFFERED: "1",
        ENVIRONMENT: "production",
      },
    },
    {
      name: "addp-crm-backup-cron",
      cwd: "./portal",
      script: "src/scripts/backup_database_cron.js",
      instances: 1,
      autorestart: false, // Script backup dạng batch/cron chỉ chạy 1 lần khi kích hoạt, không tự động loop restart
      watch: false,
      cron_restart: "0 2 * * *", // Tự động chạy sao lưu database vào 02:00 sáng mỗi ngày (WBS-50)
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
