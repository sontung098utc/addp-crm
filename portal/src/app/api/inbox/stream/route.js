import { registerSseClient } from "@/lib/unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Realtime Server-Sent Events (SSE) Stream (WBS-21)
 * Đẩy tin nhắn và thông báo cuộc trò chuyện thời gian thực < 500ms
 */

export const dynamic = "force-dynamic";

export async function GET(request) {
  const stream = new ReadableStream({
    start(controller) {
      // Gửi sự kiện kết nối ban đầu
      const initialPayload = `data: ${JSON.stringify({ type: "CONNECTED", time: Date.now() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialPayload));

      const unregister = registerSseClient(controller);

      // Heartbeat giữ kết nối 25s/lần
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
          unregister();
        }
      }, 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        unregister();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
