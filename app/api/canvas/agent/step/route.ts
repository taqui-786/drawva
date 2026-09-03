import { NextResponse } from "next/server";
import { streamText, type ModelMessage } from "ai";
import {
  createChatModel,
  isFatalAuthError,
  isRateLimitError,
  maxOutputTokensFor,
  reasoningProviderOptions,
} from "@/lib/ai/model";
import { AGENT_MAX_LOADED_PLUGINS } from "@/lib/ai/agentTools";
import { AGENT_SYSTEM_PROMPT, AI_TIMEOUT_MS, MAX_BODY_BYTES, webAccessStatus } from "@/lib/ai/prompts";
import {
  AGENT_TOOL_DEFS,
  extractJsonDecision,
  getAiSdkTools,
  parseAgentToolCall,
  type WebToolFlags,
} from "@/lib/ai/agentTools";
import { hasTinyfishKey } from "@/lib/ai/webTools";
import { getEnabledPluginDescriptors, getPluginMetadataList } from "@/lib/plugins/registry";
import { requireSession } from "@/lib/api-guard";
import { recordAiUsage } from "@/lib/actions/usage";
import type { ProviderType, ReasoningEffort } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StepRequest {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  messages?: unknown;
  loadedPluginIds?: unknown;
  webSearch?: boolean;
  context?: { revision?: number; viewport?: unknown; canvasSize?: number };
}

type StepMessage =
  | { role: "user"; text: string; images?: { id: string; dataUrl: string }[] }
  | { role: "assistant"; text: string; toolCall?: { id: string; name: string; args: unknown } }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      result: unknown;
      isError?: boolean;
      images?: { id: string; dataUrl: string }[];
    }
  | { role: "system"; text: string; tag?: "compact" };

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Failed to read body" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 400);

  let body: StepRequest;
  try {
    body = JSON.parse(raw) as StepRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if ("systemPrompt" in body || "prompt" in body) {
    return json({ error: "Client must not send prompt text." }, 400);
  }

  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;

  const providerType: ProviderType = body.providerType || "custom";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  if (!apiKey || !modelId) return json({ error: "Missing API key or model." }, 400);
  if (providerType === "custom" && !baseUrl) return json({ error: "Custom provider requires a Base URL." }, 400);

  // Plugin contracts the conductor loaded this session: injected into the
  // system prompt (compaction-immune) instead of tool-result history.
  const knownPluginIds = new Set(getPluginMetadataList().map((p) => p.id));
  const requestedPluginIds = Array.isArray(body.loadedPluginIds)
    ? body.loadedPluginIds.map(String).filter(Boolean)
    : [];
  const unknownPluginIds = requestedPluginIds.filter((id) => !knownPluginIds.has(id));
  if (unknownPluginIds.length > 0) {
    return json({ error: `Unknown plugin ids: ${unknownPluginIds.join(", ")}` }, 400);
  }
  const loadedPluginIds = requestedPluginIds.slice(0, AGENT_MAX_LOADED_PLUGINS);

  const catalog = getPluginMetadataList();
  const catalogBlock = catalog.map((p) => `${p.id} — ${p.name} — ${p.description}`).join("\n");
  const contractBlock =
    loadedPluginIds.length > 0
      ? getEnabledPluginDescriptors(loadedPluginIds)
          .map((p) => `\n\n=== PLUGIN CONTRACT (durable): ${p.id} v${p.version} ===\n${p.document}`)
          .join("")
      : "";
  const webTools: WebToolFlags = { tinyfish: hasTinyfishKey(), search: body.webSearch !== false };
  const system = `${AGENT_SYSTEM_PROMPT}\n\n${webAccessStatus(webTools.search === true, webTools.tinyfish === true)}\n\nPLUGIN CATALOG (load full docs with load_plugin):\n${catalogBlock || "(none)"}${contractBlock}`;

  const messages = parseMessages(body.messages);
  if (!messages) return json({ error: "messages is invalid." }, 400);

  const reasoningEffort = (typeof body.reasoningEffort === "string" ? body.reasoningEffort : "default") as ReasoningEffort;

  let model;
  try {
    model = createChatModel({
      providerType,
      baseUrl,
      apiKey,
      model: modelId,
      timeoutMs: AI_TIMEOUT_MS,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to create model." }, 400);
  }

  const aiSdkMessages = toAiSdkMessages(messages);
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

      try {
        // AI SDK retries internally with exponential backoff that respects
        // Retry-After headers; fatal auth errors and aborts are never retried.
        await streamOnceWithAiSdk(model, providerType, modelId, system, aiSdkMessages, req.signal, send, reasoningEffort, webTools);
      } catch (err) {
        if (req.signal.aborted) return;
        send("error", { message: publicError(err) });
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
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

async function streamOnceWithAiSdk(
  model: ReturnType<typeof createChatModel>,
  providerType: ProviderType,
  modelId: string,
  system: string,
  messages: ModelMessage[],
  signal: AbortSignal,
  send: (event: string, data: unknown) => void,
  reasoningEffort: ReasoningEffort,
  webTools: WebToolFlags
): Promise<void> {
  const tools = getAiSdkTools(webTools);
  const safeMessages = messages.length > 0 ? messages : [{ role: "user" as const, content: "Proceed with the canvas task." }];
  const reasoning = reasoningProviderOptions(providerType, modelId, reasoningEffort);

  const result = streamText({
    model,
    instructions: system,
    messages: safeMessages,
    tools,
    abortSignal: signal,
    maxRetries: 2,
    maxOutputTokens: maxOutputTokensFor(providerType, modelId, reasoningEffort),
    providerOptions: {
      ...reasoning,
      anthropic: {
        ...(reasoning.anthropic as Record<string, unknown> | undefined),
        cacheControl: { type: "ephemeral" },
      },
      openai: {
        ...(reasoning.openai as Record<string, unknown> | undefined),
        promptCacheKey: "drawva-agent-system-v1",
      },
    },
  });

  let fullText = "";
  const toolCallsCollected: { id: string; name: string; args: unknown; admissionError?: string }[] = [];
  let finishReason: string | null = null;

  for await (const part of result.stream) {
    if (signal.aborted) return;

    if (part.type === "text-delta") {
      const delta = (part as { textDelta?: string; text?: string }).textDelta || (part as { textDelta?: string; text?: string }).text || "";
      fullText += delta;
      send("text_delta", { text: delta });
    } else if (part.type === "reasoning-delta") {
      const rText = (part as { textDelta?: string; text?: string }).textDelta || (part as { textDelta?: string; text?: string }).text || "";
      send("reasoning", { text: rText });
    } else if (part.type === "tool-call") {
      const tc = part as { toolCallId: string; toolName: string; args?: unknown; input?: unknown };
      const parsed = parseAgentToolCall(tc.toolName, tc.args ?? tc.input);
      toolCallsCollected.push({
        id: tc.toolCallId,
        name: parsed.name,
        args: parsed.args,
        admissionError: parsed.valid ? undefined : parsed.error,
      });
    } else if (part.type === "error") {
      const errPart = part as { error: unknown };
      send("error", { message: publicError(errPart.error) });
      return;
    }
  }

  try {
    finishReason = (await result.finishReason) || null;
  } catch {}

  try {
    const usage = await result.usage;
    if (usage) {
      await recordAiUsage({
        providerType,
        modelId,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
      });
      send("usage", {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
      });
    }
  } catch {}

  if (toolCallsCollected.length > 1) {
    // Decision admission: a multi-tool step is rejected as a whole — the model
    // must learn extra calls are never free. Nothing is executed.
    const first = toolCallsCollected[0];
    send("tool_call", {
      id: first.id,
      name: first.name,
      args: first.args,
      admissionError: `This step emitted ${toolCallsCollected.length} tool calls (${toolCallsCollected
        .map((c) => c.name)
        .join(", ")}); multi-tool steps are rejected and NONE of them were executed.`,
    });
    send("final", { text: fullText });
    return;
  }

  if (toolCallsCollected.length === 1) {
    const first = toolCallsCollected[0];
    let admissionError = first.admissionError;
    if (!admissionError && finishReason === "length") {
      admissionError =
        "Output was truncated mid-tool-call (max tokens reached), so the arguments may be incomplete.";
    }
    send("tool_call", {
      id: first.id,
      name: first.name,
      args: first.args,
      extraToolCalls: 0,
      admissionError,
    });
    send("final", { text: fullText });
    return;
  }

  const fallback = extractFallbackToolCall(fullText);
  if (fallback) {
    const parsed = parseAgentToolCall(fallback.name, fallback.args);
    send("tool_call", {
      id: `call_synth_${Date.now()}`,
      name: parsed.name,
      args: parsed.args,
      extraToolCalls: 0,
      admissionError: parsed.valid ? undefined : parsed.error,
    });
    send("final", { text: fallback.message || "" });
    return;
  }

  send("final", { text: fullText });
}

function extractFallbackToolCall(text: string): { name: string; args: unknown; message?: string } | null {
  if (!text || !text.includes("{")) return null;
  const parsed = extractJsonDecision(text);
  if (!parsed) return null;

  if (parsed.type === "tool_call" && typeof parsed.name === "string") {
    return {
      name: parsed.name,
      args: parsed.arguments || parsed.args || {},
      message: typeof parsed.text === "string" ? parsed.text : typeof parsed.message === "string" ? parsed.message : undefined,
    };
  }

  if (Array.isArray(parsed.commands) && parsed.commands.length > 0) {
    return {
      name: "canvas_apply",
      args: {
        commands: parsed.commands,
        baseRevision: parsed.baseRevision,
        note: typeof parsed.spatialPlan === "string" ? parsed.spatialPlan : typeof parsed.note === "string" ? parsed.note : undefined,
      },
      message: typeof parsed.message === "string" ? parsed.message : typeof parsed.text === "string" ? parsed.text : undefined,
    };
  }

  const toolName = String(parsed.tool || parsed.command || parsed.type || "");
  const validTools = ["write_text", "draw_formula", "plot_function", "animate_scene", "html_widget", "diagram_source", "draw", "erase"];
  if (validTools.includes(toolName)) {
    return {
      name: "canvas_apply",
      args: {
        commands: [parsed],
        baseRevision: parsed.baseRevision,
      },
      message: typeof parsed.message === "string" ? parsed.message : typeof parsed.text === "string" ? parsed.text : undefined,
    };
  }

  const agentTools = AGENT_TOOL_DEFS.map((d) => d.name);
  if (typeof parsed.name === "string" && agentTools.includes(parsed.name)) {
    return {
      name: parsed.name,
      args: parsed.args || parsed.arguments || {},
      message: typeof parsed.message === "string" ? parsed.message : undefined,
    };
  }
  return null;
}

function parseMessages(raw: unknown): StepMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: StepMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    if (rec.role === "user" && typeof rec.text === "string") {
      out.push({
        role: "user",
        text: rec.text,
        images: parseImages(rec.images),
      });
    } else if (rec.role === "assistant" && typeof rec.text === "string") {
      const tc = rec.toolCall;
      let toolCall: { id: string; name: string; args: unknown } | undefined;
      if (tc && typeof tc === "object") {
        const call = tc as Record<string, unknown>;
        if (typeof call.id === "string" && typeof call.name === "string") {
          toolCall = { id: call.id, name: call.name, args: call.args };
        }
      }
      out.push({ role: "assistant", text: rec.text, toolCall });
    } else if (rec.role === "tool" && typeof rec.toolCallId === "string" && typeof rec.name === "string") {
      out.push({
        role: "tool",
        toolCallId: rec.toolCallId,
        name: rec.name,
        result: rec.result,
        isError: rec.isError === true,
        images: parseImages(rec.images),
      });
    } else if (rec.role === "system" && typeof rec.text === "string") {
      out.push({
        role: "system",
        text: rec.text,
        tag: rec.tag === "compact" ? "compact" : undefined,
      });
    } else {
      return null;
    }
  }
  return out;
}

function parseImages(raw: unknown): { id: string; dataUrl: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const images = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.dataUrl !== "string") return null;
      return { id: rec.id, dataUrl: rec.dataUrl };
    })
    .filter((v): v is { id: string; dataUrl: string } => v !== null);
  return images.length ? images : undefined;
}

function toAiSdkMessages(messages: StepMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];
    if (m.role === "system") {
      out.push({ role: "user", content: `[system note] ${m.text}` });
    } else if (m.role === "user") {
      // Only attach vision images if this user prompt has no assistant response yet (Step 1 of the turn).
      // If assistant messages follow, Step 1 already processed this image.
      const hasSubsequentAssistant = messages.slice(idx + 1).some((msg) => msg.role === "assistant");
      if (!m.images?.length || hasSubsequentAssistant) {
        const extraNote = hasSubsequentAssistant && m.images?.length ? "\n[canvas visual layout inspected on step 1]" : "";
        out.push({ role: "user", content: `${m.text || ""}${extraNote}`.trim() });
      } else {
        const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [];
        if (m.text) {
          contentParts.push({ type: "text", text: m.text });
        }
        for (const img of m.images) {
          contentParts.push({ type: "image", image: img.dataUrl });
        }
        out.push({ role: "user", content: contentParts });
      }
    } else if (m.role === "assistant") {
      if (m.toolCall) {
        out.push({
          role: "assistant",
          content: [
            ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
            {
              type: "tool-call" as const,
              toolCallId: m.toolCall.id || `call-${Date.now()}`,
              toolName: m.toolCall.name,
              input: asArgs(m.toolCall.args),
            },
          ],
        });
      } else {
        out.push({ role: "assistant", content: m.text || "" });
      }
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: m.toolCallId || "call-1",
            toolName: m.name,
            output: {
              type: "json" as const,
              value: (m.result ?? {}) as never,
            },
          },
        ],
      });
      if (m.images?.length) {
        const imageParts: Array<{ type: "image"; image: string }> = m.images.map((img) => ({
          type: "image",
          image: img.dataUrl,
        }));
        out.push({ role: "user", content: imageParts });
      }
    }
  }
  return out;
}

function asArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) return args as Record<string, unknown>;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {}
  }
  return {};
}

function publicError(err: unknown): string {
  if (isFatalAuthError(err)) return "API key rejected by provider.";
  if (isRateLimitError(err)) return "Provider rate limited the request. Try again.";
  return err instanceof Error ? err.message : "Agent step failed.";
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
