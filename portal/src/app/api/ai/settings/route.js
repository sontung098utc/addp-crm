import { NextResponse } from "next/server";
import {
  getAiSettings,
  saveAiSettings,
  generateAiReply,
} from "@/lib/ai/aiRouter";
import { getVectorStats } from "@/lib/ai/vectorStore";
import {
  getMariaDbConfig,
  ensureAiMariaDbTables,
  runMariaDbSql,
} from "@/lib/mariadbClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getAiSettings({ maskSecrets: true });
    const dbCfg = getMariaDbConfig();
    let dbStatus = {
      configured: dbCfg.configured,
      connected: false,
      database: dbCfg.database || "",
      host: dbCfg.host || "",
      error: null,
    };

    if (dbCfg.configured) {
      const ping = runMariaDbSql("SELECT 1;");
      dbStatus.connected = ping.ok;
      if (!ping.ok) dbStatus.error = ping.error;
    }

    return NextResponse.json({
      ok: true,
      settings,
      dbStatus,
      vectorStats: getVectorStats(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action || "SAVE_SETTINGS";

    if (action === "INIT_MARIADB") {
      const res = ensureAiMariaDbTables();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Không thể khởi tạo bảng MariaDB: ${res.error}` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        message: "Đã khởi tạo & xác nhận 5 bảng AI/Vector/Hội thoại trên MariaDB 10.6!",
      });
    }

    if (action === "TEST_AI") {
      const testRes = await generateAiReply({
        systemPrompt: "Bạn là trợ lý ADDP CRM. Trả lời ngắn 1 câu tiếng Việt.",
        messages: [{ role: "user", content: "Chào bạn, hãy xác nhận kết nối thành công." }],
        maxTokens: 80,
      });
      if (!testRes.ok) {
        return NextResponse.json({ ok: false, error: testRes.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        message: `Kết nối thành công (${testRes.providerUsed.toUpperCase()} - ${testRes.modelUsed})${
          testRes.fallbackUsed ? " [Đã tự động chuyển dự phòng]" : ""
        }: "${testRes.text}"`,
        ...testRes,
      });
    }

    const saved = saveAiSettings({
      primaryProvider: body.primaryProvider,
      openaiApiKey: body.openaiApiKey,
      openaiModel: body.openaiModel,
      geminiApiKey: body.geminiApiKey,
      geminiModel: body.geminiModel,
    });

    return NextResponse.json({
      ok: true,
      message: "Đã lưu cấu hình AI Router (OpenAI GPT + Gemini Fallback).",
      settings: saved,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
