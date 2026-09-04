import { NextResponse } from "next/server";
import { cancelConversation, conversationIdFor, disposeConversation } from "@/lib/ai/dsh/sessions";
import { MAX_BODY_BYTES } from "@/lib/ai/prompts";
import { requireSession } from "@/lib/api-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Stop the running turn (`cancel`) or drop the conversation (`dispose`). */
export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request too large" }, { status: 400 });

  let body: { conversation?: unknown; conversationId?: unknown; action?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  const conversationId = conversationIdFor(guard.userId, body.conversation ?? body.conversationId);

  if (body.action === "dispose") {
    await disposeConversation(conversationId);
    return NextResponse.json({ ok: true });
  }
  const cancelled = cancelConversation(conversationId);
  return NextResponse.json({ ok: true, cancelled });
}
