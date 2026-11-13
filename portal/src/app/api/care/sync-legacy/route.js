import { NextResponse } from "next/server";
import { syncFromLegacyKhachhang, getLegacySyncMeta } from "@/lib/legacyKhachhangSync";

export const dynamic = "force-dynamic";

export async function GET() {
  const meta = getLegacySyncMeta();
  return NextResponse.json({
    ok: true,
    ...meta,
  });
}

export async function POST() {
  const result = await syncFromLegacyKhachhang();
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
