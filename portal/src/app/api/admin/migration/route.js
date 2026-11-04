import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { runMigration } from "@/scripts/migrate_all_legacy_data";

export async function GET() {
  try {
    const logFile = path.join(process.cwd(), ".data", "migration_log.json");
    let log = null;
    if (fs.existsSync(logFile)) {
      log = JSON.parse(fs.readFileSync(logFile, "utf8"));
    }
    return NextResponse.json({
      ok: true,
      lastMigration: log,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const results = runMigration();
    return NextResponse.json({
      ok: true,
      message: "Đã hoàn thành di chuyển dữ liệu lịch sử thành công.",
      results,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
