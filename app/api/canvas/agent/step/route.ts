import { NextResponse } from "next/server";
import {
  conversationIdFor,
  hasOpenTurn,
  runConversationTurn,
  steerConversationTurn,
  type TurnImage,
} from "@/lib/ai/dsh/sessions";
import { MAX_BODY_BYTES } from "@/lib/ai/prompts";
import { hasTinyfishKey } from "@/lib/ai/webTools";
import { getPluginMetadataList } from "@/lib/plugins/registry";
import { requireSession } from "@/lib/api-guard";
import { recordAiUsage } from "@/lib/actions/usage";
import { type ProviderType, type ReasoningEffort, PROVIDER_INFOS } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

interface TurnRequest {
  conversation?: unknown;
  conversationId?: unknown;
  connectionId?: unknown;
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  text?: unknown;
  images?: unknown;
  history?: unknown;
  loadedPluginIds?: unknown;
  webSearch?: boolean;
  mode?: unknown;
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Failed to read body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 400);

  let body: TurnRequest;
  try {
    body = JSON.parse(raw) as TurnRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if ("systemPrompt" in body || "prompt" in body) {
    return json({ error: "Client must not send prompt text." }, 400);
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  const conversationId = conversationIdFor(guard.userId, body.conversation ?? body.conversationId);
  const providerType: ProviderType = body.providerType || "custom";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  const info = PROVIDER_INFOS[providerType];
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : info?.defaultBaseUrl || "";
  if (!apiKey || !modelId) return json({ error: "Missing API key or model." }, 400);
  if (providerType === "custom" && !baseUrl) return json({ error: "Custom provider requires a Base URL." }, 400);

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return json({ error: "text is required." }, 400);

  const knownPluginIds = new Set(getPluginMetadataList().map((p) => p.id));
  const requestedPluginIds = Array.isArray(body.loadedPluginIds)
    ? body.loadedPluginIds.map(String).filter(Boolean)
    : [];
  const unknownPluginIds = requestedPluginIds.filter((id) => !knownPluginIds.has(id));
  if (unknownPluginIds.length > 0) {
    return json({ error: `Unknown plugin ids: ${unknownPluginIds.join(", ")}` }, 400);
  }

  const images = parseImages(body.images);
  if (images && images.length > 5) return json({ error: "At most 5 images per turn." }, 400);
  const history = parseHistory(body.history);
  if (history === null) return json({ error: "history is invalid." }, 400);

  const mode = (body.mode === "steer" ? "steer" : "followup") as "steer" | "followup";
  const reasoningEffort = (typeof body.reasoningEffort === "string" ? body.reasoningEffort : "default") as ReasoningEffort;

  const turnOptions = {
    conversationId,
    connectionId: typeof body.connectionId === "string" && body.connectionId ? body.connectionId : "default",
    providerType,
    baseUrl,
    apiKey,
    model: modelId,
    effort: reasoningEffort,
    text,
    images: images || [],
    loadedPluginIds: requestedPluginIds,
    webSearch: body.webSearch !== false,
    hasTinyfishKey: hasTinyfishKey(),
    priorTurns: history || undefined,
    mode,
  };

  if (mode === "steer" && hasOpenTurn(conversationId)) {
    try {
      await steerConversationTurn(turnOptions);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Steer failed." }, 502);
    }
    return json({ ok: true });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      };
      if (req.signal.aborted) {
        finish();
        return;
      }
      const onAbort = () => finish();
      req.signal.addEventListener("abort", onAbort, { once: true });
      try {
        await runConversationTurn(turnOptions, (e) => {
            if (req.signal.aborted) return;
            if (e.event === "usage") {
              void recordAiUsage({
                providerType,
                modelId,
                inputTokens: e.data.inputTokens,
                outputTokens: e.data.outputTokens,
                totalTokens: e.data.inputTokens + e.data.outputTokens,
              }).catch(() => {});
            }
            send(e.event, e.data);
          }
        );
      } catch (err) {
        if (!req.signal.aborted) {
          const message = err instanceof Error ? err.message : "Agent turn failed.";
          console.error(`[agent/step] turn failed for ${conversationId}:`, message);
          const data =
            process.env.NODE_ENV !== "production" && err instanceof Error && err.stack
              ? { message, stack: err.stack.split("\n").slice(0, 12).join("\n") }
              : { message };
          send("error", data);
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        finish();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function parseImages(raw: unknown): TurnImage[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const images = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.dataUrl !== "string") return null;
      return { id: rec.id, dataUrl: rec.dataUrl };
    })
    .filter((v): v is TurnImage => v !== null);
  return images;
}

function parseHistory(raw: unknown): { role: string; text: string }[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: { role: string; text: string }[] = [];
  for (const item of raw.slice(-120)) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    if ((rec.role !== "user" && rec.role !== "assistant") || typeof rec.text !== "string") return null;
    out.push({ role: rec.role, text: rec.text });
  }
  return out;
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
