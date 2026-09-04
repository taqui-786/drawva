import { NextResponse } from "next/server";
import { resolveBridgeCall } from "@/lib/ai/dsh/bridge";
import { conversationIdFor } from "@/lib/ai/dsh/sessions";
import { MAX_BODY_BYTES } from "@/lib/ai/prompts";
import { requireSession } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Browser answers to `tool_request` frames from the open turn stream. */
export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 400 });

  let body: { conversation?: unknown; conversationId?: unknown; toolCallId?: unknown; result?: unknown; isError?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  const conversationId = conversationIdFor(guard.userId, body.conversation ?? body.conversationId);
  const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId : "";
  if (!toolCallId) {
    return NextResponse.json({ error: "toolCallId is required." }, { status: 400 });
  }
  const settled = resolveBridgeCall(conversationId, toolCallId, body.result ?? {}, body.isError === true);
  if (!settled) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[tool-result] 410 for ${conversationId}:${toolCallId}`);
    }
    return NextResponse.json({ error: "Unknown or expired tool call." }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
