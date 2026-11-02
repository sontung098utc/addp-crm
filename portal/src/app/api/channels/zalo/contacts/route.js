import { NextResponse } from "next/server";
import { runZaloCommand } from "../../../../../lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Danh Bạ Khách Hàng Zalo Thật (Tốc độ cao)
 */

let cachedContacts = null;
let lastFetchedAt = 0;

export async function GET() {
  try {
    const now = Date.now();
    // Cache danh bạ 5 phút
    if (cachedContacts && now - lastFetchedAt < 300000) {
      return NextResponse.json({ ok: true, cached: true, contacts: cachedContacts });
    }

    const result = await runZaloCommand(["friend", "list", "--json"], { timeout: 15000 });
    if (!result.ok || !result.data) {
      return NextResponse.json({ ok: true, contacts: cachedContacts || [] });
    }

    const list = Array.isArray(result.data) ? result.data : [];
    const formatted = list.map((u) => ({
      userId: u.userId,
      name: u.displayName || u.zaloName || "Khách Zalo",
      avatar: u.avatar || "",
      phone: u.phoneNumber ? `0${u.phoneNumber.replace(/^84/, "")}` : "",
      gender: u.gender === 0 ? "Nam" : u.gender === 1 ? "Nữ" : "Khác",
    }));

    cachedContacts = formatted;
    lastFetchedAt = now;

    return NextResponse.json({ ok: true, total: formatted.length, contacts: formatted });
  } catch (error) {
    console.error("[ZALO_CONTACTS_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh bạ Zalo." }, { status: 500 });
  }
}
