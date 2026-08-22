import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { createChatModel } from "@/lib/ai/model";
import { AI_TIMEOUT_MS, MAX_BODY_BYTES, MAX_COMMANDS, MAX_DIAGRAM_BYTES, MAX_HTML_BYTES } from "@/lib/ai/prompts";
import { widgetGeometryForViewport } from "@/lib/ai/geometry";
import { validateCommands } from "@/lib/canvas/commands";
import { SIZE } from "@/lib/canvas/constants";
import { getEnabledPluginDescriptors } from "@/lib/plugins/registry";
import type { AiRequest, AgentEvent, PluginDescriptor } from "@/lib/ai/types";
import type { ProviderType } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

function readBody(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: "Request too large" };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

function clampBox(b: unknown): { x: number; y: number; w: number; h: number } {
  const c = (b ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { x: n(c.x), y: n(c.y), w: n(c.w), h: n(c.h) };
}

function parseSceneItems(scene?: string): Array<{ kind: string; x: number; y: number; w: number; h: number; title?: string }> {
  if (!scene) return [];
  try {
    const parsed = JSON.parse(scene);
    if (Array.isArray(parsed?.items)) {
      return parsed.items.map((i: Record<string, unknown>) => ({
        kind: String(i.kind || "object"),
        x: Number(i.x) || 0,
        y: Number(i.y) || 0,
        w: Number(i.w) || 0,
        h: Number(i.h) || 0,
        title: typeof i.title === "string" ? i.title : undefined,
      }));
    }
  } catch {}
  return [];
}

function validateReply(
  reply: Awaited<ReturnType<typeof runAgent>>,
  visibleRect: { x: number; y: number; w: number; h: number },
  changedBox: { x: number; y: number; w: number; h: number },
  keepPosition = false,
  widgetEditBox?: { x: number; y: number; w: number; h: number },
  sceneText?: string,
  enabledPlugins: PluginDescriptor[] = []
) {
  const pluginIds = new Set(enabledPlugins.map((p) => p.id));
  // General HTML is mandatory and always enabled
  pluginIds.add("general");
  if (pluginIds.size <= 1) {
    pluginIds.add("flowchart");
  }
  const widgetGeometry = widgetGeometryForViewport(visibleRect);
  const ctx = {
    aiColor: "#2679b8",
    scale: 1.5,
    widgetSlots: 8,
    plugins: pluginIds,
    visibleRect,
    changedBox,
    keepPosition,
    widgetEditBox,
    sceneItems: parseSceneItems(sceneText),
    widgetGeometry,
  };
  const { commands, rejected } = validateCommands(reply.commands, ctx);
  return {
    intent: reply.intent,
    message: reply.message || "",
    observedText: reply.observedText || "",
    commands,
    rejected,
    requestId: reply.requestId,
    attempts: reply.attempts,
    providerId: reply.providerId,
    tokenUsage: reply.tokenUsage,
    debug: reply.debug,
  };
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Failed to read body" }, 400);
  }
  const parsed = readBody(raw);
  if (!parsed.ok) return json(parsed, 400);
  const p = parsed.data as Partial<AiRequest> & { stream?: boolean };

  const providerType: ProviderType = p.providerType || "custom";
  const baseUrl = typeof p.baseUrl === "string" ? p.baseUrl.trim() : "";
  const apiKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
  const modelId = typeof p.model === "string" ? p.model.trim() : "";

  if (!apiKey || !modelId) {
    return json({ error: "Missing API key or model. Configure a provider in Settings." }, 400);
  }
  if (providerType === "custom" && !baseUrl) {
    return json({ error: "Custom provider requires a Base URL. Configure it in Settings." }, 400);
  }

  const visibleRect = clampBox(p.visibleRect);
  const changedBox = clampBox(p.changedBox);
  const sourceRect = clampBox(p.sourceRect);
  const requestId = String(p.requestId || `req-${Date.now()}`);

  const atlasImage = typeof p.atlasImage === "string" ? p.atlasImage : "";
  if (!atlasImage || atlasImage.length > MAX_BODY_BYTES) {
    return json({ error: "atlasImage missing or too large" }, 400);
  }

  const widgetEdit =
    p.widgetEdit && typeof p.widgetEdit === "object"
      ? (p.widgetEdit as import("@/lib/ai/types").WidgetEditContext)
      : undefined;
  const focusInset =
    p.focusInset && typeof p.focusInset === "object" && !Array.isArray(p.focusInset)
      ? (p.focusInset as import("@/lib/ai/types").FocusInsetMeta)
      : null;
  const latestInput =
    p.latestInput && typeof p.latestInput === "object" && !Array.isArray(p.latestInput)
      ? (p.latestInput as import("@/lib/ai/types").LatestInputMeta)
      : undefined;

  const enabledPluginIds = Array.isArray(p.enabledPluginIds) ? p.enabledPluginIds : undefined;
  const enabledPlugins = getEnabledPluginDescriptors(enabledPluginIds);

  const aiRequest: AiRequest = {
    requestId,
    atlasImage,
    focusInset,
    latestInput,
    visibleRect,
    sourceRect,
    captureRect: clampBox(p.captureRect || visibleRect),
    changedBox,
    imageScale: typeof p.imageScale === "number" && Number.isFinite(p.imageScale) ? p.imageScale : undefined,
    imageSize: {
      w: Number((p.imageSize as { w?: unknown })?.w) || 0,
      h: Number((p.imageSize as { h?: unknown })?.h) || 0,
    },
    userPrompt: typeof p.userPrompt === "string" ? p.userPrompt.slice(0, 2000) : "",
    scene: typeof p.scene === "string" ? p.scene.slice(0, 20000) : "",
    trigger: p.trigger === "manual" ? "manual" : "user_paused",
    widgetEdit,
    keepPosition: p.keepPosition === true,
    providerType,
    baseUrl,
    apiKey,
    model: modelId,
    enabledPluginIds,
    enabledPlugins,
  };

  const model = createChatModel({ providerType, baseUrl, apiKey, model: modelId, timeoutMs: AI_TIMEOUT_MS });
  const sceneText = aiRequest.scene || "";

  // keepPosition is ONLY the explicit Refine button. A nearby/selected widgetEdit
  // is model context — the command's placement token decides whether to freeze
  // the existing box (in_place) or sit a new item beside the ink.
  const keepPosition = p.keepPosition === true;

  if (p.stream === true) {
    return streamReply(aiRequest, sceneText, model, visibleRect, changedBox, keepPosition, widgetEdit?.box, enabledPlugins);
  }

  const reply = await runAgent(aiRequest, sceneText, model);
  return json(validateReply(reply, visibleRect, changedBox, keepPosition, widgetEdit?.box, sceneText, enabledPlugins));
}

function streamReply(
  aiRequest: AiRequest,
  sceneText: string,
  model: ReturnType<typeof createChatModel>,
  visibleRect: { x: number; y: number; w: number; h: number },
  changedBox: { x: number; y: number; w: number; h: number },
  keepPosition = false,
  widgetEditBox?: { x: number; y: number; w: number; h: number },
  enabledPlugins: PluginDescriptor[] = []
): NextResponse {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };
      const onEvent = (event: AgentEvent) => {
        send("event", event);
      };
      try {
        const reply = await runAgent(aiRequest, sceneText, model, { onEvent });
        const payload = validateReply(reply, visibleRect, changedBox, keepPosition, widgetEditBox, sceneText, enabledPlugins);
        send("result", payload);
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[API /api/canvas/ai Error]: 🛑 Generation Failed:", err);
        let userMsg = "AI request failed";
        if (aborted) {
          userMsg = "AI request timed out";
        } else if (msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("capacity")) {
          userMsg = "Provider rate limit capacity reached (429). Please wait a few seconds before retrying.";
        } else if (msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("unauthorized")) {
          userMsg = "API key rejected by provider (401 Unauthorized). Check Settings.";
        } else if (msg.includes("529") || msg.includes("prediction")) {
          userMsg = "AI provider is currently overloaded.";
        }
        send("error", { error: userMsg, detail: msg });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

void MAX_COMMANDS;
void MAX_HTML_BYTES;
void MAX_DIAGRAM_BYTES;
void SIZE;
