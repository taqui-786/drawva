import { NextResponse } from "next/server";
import { streamText, type ModelMessage } from "ai";
import { createChatModel, isFatalAuthError, isRateLimitError } from "@/lib/ai/model";
import { runAntigravityCli } from "@/lib/ai/antigravity";
import { runCodexCli } from "@/lib/ai/codex";
import { AGENT_SYSTEM_PROMPT, AI_TIMEOUT_MS, MAX_BODY_BYTES } from "@/lib/ai/prompts";
import { getAiSdkTools, parseAgentToolCall } from "@/lib/ai/agentTools";
import { getPluginMetadataList } from "@/lib/plugins/registry";
import type { ProviderType } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

interface StepRequest {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  enabledPluginIds?: unknown;
  messages?: unknown;
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

  const providerType: ProviderType = body.providerType || "custom";
  const isCli = providerType === "antigravity" || providerType === "codex";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  if (!isCli && (!apiKey || !modelId)) return json({ error: "Missing API key or model." }, 400);
  if (isCli && !modelId) return json({ error: "Missing model." }, 400);
  if (providerType === "custom" && !baseUrl) return json({ error: "Custom provider requires a Base URL." }, 400);

  const catalog = getPluginMetadataList();
  const known = new Set(catalog.map((p) => p.id));
  if (!Array.isArray(body.enabledPluginIds)) {
    return json({ error: "enabledPluginIds is required." }, 400);
  }
  const enabledPluginIds = body.enabledPluginIds.filter((id): id is string => typeof id === "string");
  const unknown = enabledPluginIds.filter((id) => !known.has(id));
  if (unknown.length) {
    return json({ error: `Unknown plugin id: ${unknown[0]}` }, 400);
  }

  const messages = parseMessages(body.messages);
  if (!messages) return json({ error: "messages is invalid." }, 400);

  const enabled = catalog.filter((p) => enabledPluginIds.includes(p.id));
  const catalogBlock = enabled.map((p) => `${p.id} — ${p.name} — ${p.description}`).join("\n");
  const system = `${AGENT_SYSTEM_PROMPT}\n\nPLUGIN CATALOG (load full docs with load_plugin):\n${catalogBlock || "(none)"}`;

  if (isCli) {
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
          const currentRev = typeof body.context?.revision === "number" ? body.context.revision : 0;
          const cliSystem = `You are the AI model backend for the Drawva Canvas whiteboard. The client Conductor engine executes your canvas commands on the whiteboard on your behalf.
You DO NOT need local CLI canvas tools or MCP tools installed. To draw, write text, calculate math formulas, or place interactive widgets on the whiteboard, you MUST return a standard JSON tool_call for "canvas_apply" and the Conductor engine will execute and render it immediately.

${system}

CLI DECISION PROTOCOL:
Return exactly one standard JSON object (no markdown fences, no leading/trailing prose outside JSON):
- To execute a canvas action: {"type":"tool_call","name":"<tool_name>","arguments":{...}}
- To answer/finish: {"type":"final","text":"..."}

Available Tools:
1. canvas_apply: Apply drawing/writing/widgets to the canvas.
   Arguments: {"baseRevision": ${currentRev}, "commands": [{"tool": "animate_scene"|"html_widget"|"write_text"|"draw_formula"|"plot_function"|"diagram_source"|"draw"|"erase", "x": number, "y": number, ...}]}
2. canvas_scan: List existing objects/widgets. Arguments: {"scope": "all"|"viewport"}
3. canvas_snapshot: Capture image of canvas region or viewport. Arguments: {"target": "viewport"|"region"|"object", "quality": "basic"|"detail"}
4. canvas_read: Read widget source code. Arguments: {"objectId": string}
5. canvas_patch_widget: Surgical unified-diff edit of a widget. Arguments: {"objectId": string, "baseRevision": ${currentRev}, "patch": string}
6. canvas_focus: Center camera. Arguments: {"target": "canvas"|"object"|"region"}
7. canvas_undo: Undo last action. Arguments: {}
8. load_plugin: Load plugin docs. Arguments: {"pluginId": string}

INSTRUCTION: Whenever asked to draw, solve, explain, or generate content on the whiteboard, return a tool_call with canvas_apply containing the commands. Return final only when complete or when purely answering a conversational question.`;

          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          const hasAssistantAfterLastUser = lastUserMsg
            ? messages.slice(messages.indexOf(lastUserMsg) + 1).some((m) => m.role === "assistant")
            : false;
          const lastImage = hasAssistantAfterLastUser ? undefined : lastUserMsg?.images?.[0]?.dataUrl;
          const userJson = JSON.stringify(
            {
              instruction: "Return one standard JSON tool_call for the next necessary canvas action (e.g. canvas_apply), or final when done.",
              context: body.context,
              messages,
            },
            null,
            2
          );

          const cliOpts = {
            systemPrompt: cliSystem,
            userJson,
            imageBase64: lastImage,
            model: modelId,
            reasoningEffort: body.reasoningEffort as Parameters<typeof createChatModel>[0]["reasoningEffort"],
            timeoutMs: AI_TIMEOUT_MS,
          };

          const reply =
            providerType === "antigravity"
              ? await runAntigravityCli(cliOpts)
              : await runCodexCli(cliOpts);

          if (reply.tokenUsage) {
            send("usage", reply.tokenUsage);
          }

          if (reply.toolCall) {
            const parsed = parseAgentToolCall(reply.toolCall.name, reply.toolCall.args);
            send("tool_call", {
              id: reply.toolCall.id || `call_cli_${Date.now()}`,
              name: parsed.name,
              args: parsed.args,
              extraToolCalls: 0,
            });
            send("final", { text: reply.message || "" });
          } else if (Array.isArray(reply.commands) && reply.commands.length > 0) {
            send("tool_call", {
              id: `call_cli_${Date.now()}`,
              name: "canvas_apply",
              args: { baseRevision: currentRev, commands: reply.commands },
              extraToolCalls: 0,
            });
            send("final", { text: reply.message || "" });
          } else {
            if (reply.message) {
              send("text_delta", { text: reply.message });
            }
            send("final", { text: reply.message || "" });
          }
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
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  let model;
  try {
    model = createChatModel({
      providerType,
      baseUrl,
      apiKey,
      model: modelId,
      timeoutMs: AI_TIMEOUT_MS,
      reasoningEffort: body.reasoningEffort as Parameters<typeof createChatModel>[0]["reasoningEffort"],
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
        await runStepWithAiSdk(model, system, aiSdkMessages, req.signal, send);
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

async function runStepWithAiSdk(
  model: ReturnType<typeof createChatModel>,
  system: string,
  messages: ModelMessage[],
  signal: AbortSignal,
  send: (event: string, data: unknown) => void
): Promise<void> {
  const once = async () => streamOnceWithAiSdk(model, system, messages, signal, send);
  try {
    await once();
  } catch (err) {
    if (signal.aborted) throw err;
    if (isFatalAuthError(err)) throw err;
    if (isRateLimitError(err) || isServerError(err)) {
      await once();
      return;
    }
    throw err;
  }
}

async function streamOnceWithAiSdk(
  model: ReturnType<typeof createChatModel>,
  system: string,
  messages: ModelMessage[],
  signal: AbortSignal,
  send: (event: string, data: unknown) => void
): Promise<void> {
  const tools = getAiSdkTools();
  const safeMessages = messages.length > 0 ? messages : [{ role: "user" as const, content: "Proceed with the canvas task." }];

  const result = streamText({
    model,
    instructions: system,
    messages: safeMessages,
    tools,
    abortSignal: signal,
    maxRetries: 0,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
      openai: { promptCacheKey: "drawva-agent-system-v1" },
    },
  });

  let fullText = "";
  const toolCallsCollected: { id: string; name: string; args: unknown }[] = [];

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
      });
    } else if (part.type === "error") {
      const errPart = part as { error: unknown };
      send("error", { message: publicError(errPart.error) });
      return;
    }
  }

  try {
    const usage = await result.usage;
    if (usage) {
      send("usage", {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
      });
    }
  } catch {}

  if (toolCallsCollected.length > 0) {
    const first = toolCallsCollected[0];
    send("tool_call", {
      id: first.id,
      name: first.name,
      args: first.args,
      extraToolCalls: Math.max(0, toolCallsCollected.length - 1),
    });
    send("final", { text: fullText });
    return;
  }

  send("final", { text: fullText });
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

function isServerError(err: unknown): boolean {
  const rec = err as { status?: number; statusCode?: number };
  const status = Number(rec.status || rec.statusCode || 0);
  return status >= 500 && status < 600;
}

function publicError(err: unknown): string {
  if (isFatalAuthError(err)) return "API key rejected by provider.";
  if (isRateLimitError(err)) return "Provider rate limited the request. Try again.";
  return err instanceof Error ? err.message : "Agent step failed.";
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
