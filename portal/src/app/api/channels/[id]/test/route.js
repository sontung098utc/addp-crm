import { NextResponse } from "next/server";
import { testChannelHealth } from "../../../../../lib/connectionHub.js";

/**
 * API Kiểm tra Sức khỏe Kết nối Kênh (Health Check WBS-11)
 */

export async function POST(request, context) {
  try {
    const params = await context.params;
    const id = params.id;
    const result = await testChannelHealth(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[CHANNEL_TEST_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi khi kiểm tra kết nối tài khoản kênh." },
      { status: 500 }
    );
  }
}
