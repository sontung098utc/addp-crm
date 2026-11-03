import { NextResponse } from "next/server";
import { searchSecondBrain } from "@/lib/secondBrain";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";

    const docs = searchSecondBrain(q);

    return NextResponse.json({
      ok: true,
      docs,
      total: docs.length,
    });
  } catch (error) {
    console.error("GET /api/ai/knowledge error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
