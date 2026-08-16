import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { MAX_RETRIES } from "./model";
import {
  AI_TIMEOUT_MS,
  CODE_SYSTEM_PROMPT_EXTRA,
  FLOWCHART_RULES,
  WIDGET_VISUAL_RULES,
  SPATIAL_GESTURE_PROMPT,
  THEME_PERSONAS,
  MANDATORY_VISIBLE_RESPONSE,
  RETRY_INSTRUCTION,
  SYSTEM_PROMPT,
} from "./prompts";
import type { AiReply, AiRequest, AgentEvent, TokenUsage, AiDebugInfo } from "./types";

export const AgentReplySchema = z.object({
  intent: z.enum(["none", "hint", "continue", "explain", "plot", "correct", "erase", "answer", "typeset"]),
  observedText: z.string().optional(),
  spatialPlan: z.string().optional(),
  message: z.string().optional(),
  commands: z.array(z.record(z.string(), z.unknown())),
});

export type AgentReply = z.infer<typeof AgentReplySchema> & {
  tokenUsage?: TokenUsage;
  debug?: AiDebugInfo;
};

export interface AgentOptions {
  timeoutMs?: number;
  /** Emitted as the single provider is invoked / retried / completes. */
  onEvent?: (event: AgentEvent) => void;
}

export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const rec = err as Record<string, unknown>;
  const status = Number(rec.status || rec.statusCode || 0);
  const lcCode = String(rec.lc_error_code || "");

  return (
    status === 429 ||
    lcCode === "MODEL_RATE_LIMIT" ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("capacity")
  );
}

export function isFatalAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const rec = err as Record<string, unknown>;
  const status = Number(rec.status || rec.statusCode || 0);

  return (
    status === 401 ||
    status === 403 ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("unauthorized") ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key")
  );
}

export async function runAgent(
  req: AiRequest,
  sceneText: string,
  model: BaseChatModel,
  opts: AgentOptions = {}
): Promise<AiReply> {
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await runModel(req, sceneText, model, controller, opts);
  } finally {
    clearTimeout(timer);
  }
}

function systemPromptText(uiTheme?: string): string {
  const persona = THEME_PERSONAS[uiTheme || "studio"] || THEME_PERSONAS.studio;
  return `${SYSTEM_PROMPT}\n\nPersona Focus: ${persona}\n\n${SPATIAL_GESTURE_PROMPT}\n\n${CODE_SYSTEM_PROMPT_EXTRA}\n\n${FLOWCHART_RULES}\n\n${WIDGET_VISUAL_RULES}`;
}

function userMessageText(req: AiRequest, sceneText: string): string {
  const parts = [
    `Request id: ${req.requestId}`,
    `Trigger: ${req.trigger}`,
    `visibleRect: ${JSON.stringify(req.visibleRect)}`,
    `changedBox (latest user ink): ${JSON.stringify(req.changedBox)}`,
    `sourceRect: ${JSON.stringify(req.sourceRect)}`,
    `User prompt (if any): ${req.userPrompt || "(none)"}`,
  ];
  if (req.widgetEdit) {
    const wb = req.widgetEdit.box;
    parts.push(
      `\n--- REFINEMENT TARGET (widgetEdit) ---`,
      `Target Widget ID: ${req.widgetEdit.id}`,
      `Plugin ID: ${req.widgetEdit.pluginId}`,
      `Widget Type: ${req.widgetEdit.widgetType}`,
      `Source Format: ${req.widgetEdit.sourceFormat || "(none)"}`,
      `Current Title: ${req.widgetEdit.title || "(none)"}`,
      `Widget Box (EXACT position/size to preserve): ${JSON.stringify(wb)}`,
      `Current Baseline Source Code:\n${(req.widgetEdit.source || req.widgetEdit.html || "").slice(0, 4000)}`,
      `REFINEMENT INSTRUCTION: This is an IN-PLACE edit of the widget above. The ink/arrows on canvas are edit instructions — apply them to the baseline source code. Return exactly ONE updated replacement command (${req.widgetEdit.widgetType}) with:
  - pluginId: "${req.widgetEdit.pluginId}"
  - sourceFormat: "${req.widgetEdit.sourceFormat || "mermaid"}"
  - title: "${req.widgetEdit.title || "Widget"}"
  - placement: "in_place"  ← MUST use in_place refinement
  - x: ${wb.x}, y: ${wb.y}, w: ${wb.w}, h: ${wb.h}
  - Incorporate the handwritten edit instructions while preserving all existing content.`
    );
  }
  parts.push(`Scene JSON:\n${req.scene || sceneText}`, `\nInspect the canvas image, plan your spatial anchor coordinates in spatialPlan, then return matching commands.`);
  return parts.join("\n");
}


function salvageTruncatedJson(clean: string): string {
  let s = clean.trim();
  const firstBrace = s.indexOf("{");
  if (firstBrace < 0) return s;
  s = s.slice(firstBrace);

  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === "\\" && !escaped) {
      escaped = true;
    } else {
      if (char === '"' && !escaped) {
        inString = !inString;
      }
      escaped = false;
    }
  }

  if (inString) s += '"';
  s = s.replace(/,\s*$/g, "").replace(/,\s*"[^"]*":?\s*$/g, "");

  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === "\\" && !escaped) {
      escaped = true;
    } else {
      if (char === '"' && !escaped) {
        inString = !inString;
      } else if (!inString) {
        if (char === "{" || char === "[") {
          stack.push(char === "{" ? "}" : "]");
        } else if (char === "}" || char === "]") {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
      escaped = false;
    }
  }

  while (stack.length > 0) s += stack.pop();
  return s;
}

export function parseJsonResponse(raw: string): AgentReply | null {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(clean);
    const validated = AgentReplySchema.safeParse(parsed);
    if (validated.success) return validated.data;
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      const toolName = typeof rec.name === "string" ? rec.name : typeof rec.tool === "string" ? rec.tool : undefined;
      const args = typeof rec.args === "object" && rec.args !== null ? (rec.args as Record<string, unknown>) : rec;
      if (toolName && typeof args === "object") {
        return { intent: "continue", commands: [{ tool: toolName, ...args }] };
      }
    }
  } catch {}

  const commands: Record<string, unknown>[] = [];
  let observedText: string | undefined;
  let spatialPlan: string | undefined;
  let message: string | undefined;
  let intent = "continue";

  const objectRegex = /\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g;
  const matches = clean.match(objectRegex);
  if (matches && matches.length > 0) {
    for (const match of matches) {
      try {
        const obj = JSON.parse(match);
        const val = AgentReplySchema.safeParse(obj);
        if (val.success) {
          if (val.data.commands?.length) commands.push(...val.data.commands);
          if (val.data.message) message = val.data.message;
          if (val.data.observedText) observedText = val.data.observedText;
          if (val.data.spatialPlan) spatialPlan = val.data.spatialPlan;
          if (val.data.intent) intent = val.data.intent;
        } else if (obj && typeof obj === "object") {
          const rec = obj as Record<string, unknown>;
          const toolName = typeof rec.name === "string" ? rec.name : typeof rec.tool === "string" ? rec.tool : undefined;
          const args = typeof rec.args === "object" && rec.args !== null ? (rec.args as Record<string, unknown>) : rec;
          if (toolName && typeof args === "object") {
            commands.push({ tool: toolName, ...args });
          }
        }
      } catch {}
    }
  }

  if (commands.length > 0) {
    const validIntents = ["none", "hint", "continue", "explain", "plot", "correct", "erase", "answer", "typeset"] as const;
    const finalIntent = validIntents.includes(intent as (typeof validIntents)[number]) ? (intent as (typeof validIntents)[number]) : "continue";
    return { intent: finalIntent, observedText, spatialPlan, message, commands };
  }

  try {
    const salvagedStr = salvageTruncatedJson(clean);
    const parsed = JSON.parse(salvagedStr);
    const val = AgentReplySchema.safeParse(parsed);
    if (val.success) return val.data;
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      const toolName = typeof rec.name === "string" ? rec.name : typeof rec.tool === "string" ? rec.tool : undefined;
      const args = typeof rec.args === "object" && rec.args !== null ? (rec.args as Record<string, unknown>) : rec;
      if (toolName && typeof args === "object") {
        return { intent: "continue", commands: [{ tool: toolName, ...args }] };
      }
    }
  } catch {}

  return null;
}

function extractTokenUsage(res: unknown): TokenUsage | undefined {
  if (!res || typeof res !== "object") return undefined;
  const obj = res as Record<string, unknown>;

  const usageMeta = (obj.usage_metadata || (obj.raw as Record<string, unknown> | undefined)?.usage_metadata) as Record<string, unknown> | undefined;
  if (usageMeta && typeof usageMeta === "object") {
    const inputTokens = Number(usageMeta.input_tokens || usageMeta.prompt_tokens || 0);
    const outputTokens = Number(usageMeta.output_tokens || usageMeta.completion_tokens || 0);
    const totalTokens = Number(usageMeta.total_tokens || inputTokens + outputTokens);
    if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
      return { inputTokens, outputTokens, totalTokens };
    }
  }

  const respMeta = (obj.response_metadata || (obj.raw as Record<string, unknown> | undefined)?.response_metadata) as Record<string, unknown> | undefined;
  if (respMeta && typeof respMeta === "object") {
    const tokenUsage = (respMeta.tokenUsage || respMeta.usage) as Record<string, unknown> | undefined;
    if (tokenUsage && typeof tokenUsage === "object") {
      const inputTokens = Number(tokenUsage.promptTokens || tokenUsage.prompt_tokens || tokenUsage.input_tokens || 0);
      const outputTokens = Number(tokenUsage.completionTokens || tokenUsage.completion_tokens || tokenUsage.output_tokens || 0);
      const totalTokens = Number(tokenUsage.totalTokens || tokenUsage.total_tokens || inputTokens + outputTokens);
      if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
        return { inputTokens, outputTokens, totalTokens };
      }
    }
  }

  return undefined;
}

async function runModel(
  req: AiRequest,
  sceneText: string,
  model: BaseChatModel,
  controller: AbortController,
  opts: AgentOptions
): Promise<AiReply> {
  const { onEvent } = opts;
  const provider = req.model || "model";

  console.log(`[AI Pipeline] ⚡ Starting generation on "${provider}" (max ${MAX_RETRIES} attempts)...`);
  onEvent?.({ type: "provider_start", provider });

  let lastError: unknown = null;

  for (let attemptNo = 0; attemptNo < MAX_RETRIES; attemptNo++) {
    const isRetry = attemptNo > 0;
    try {
      const reply = await attemptReply(req, sceneText, model, controller, isRetry);
      console.log(`[AI Pipeline] ✅ Generation complete on attempt ${attemptNo + 1}/${MAX_RETRIES} (${reply.commands.length} commands).`);
      onEvent?.({ type: "provider_done", provider });
      return {
        ...reply,
        requestId: req.requestId,
        providerId: provider,
        attempts: attemptNo + 1,
      };
    } catch (err) {
      if (controller.signal.aborted) throw err;
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (isFatalAuthError(err)) {
        console.error(`[AI Pipeline] ❌ Provider rejected API key (401 Unauthorized): ${msg}`);
        onEvent?.({ type: "provider_failed", provider, error: "Invalid API key (401 Unauthorized)" });
        throw new Error(`API key rejected by provider (401 Unauthorized). Please check your API key in Settings.`);
      }

      console.warn(`[AI Pipeline] ⚠️ Attempt ${attemptNo + 1}/${MAX_RETRIES} failed: ${msg}`);
      onEvent?.({ type: "provider_failed", provider, error: msg });

      if (attemptNo < MAX_RETRIES - 1) {
        const rateLimit = isRateLimitError(err);
        const delayMs = rateLimit ? (attemptNo + 1) * 2500 : 1200;
        console.log(`[AI Pipeline] ⏳ Waiting ${delayMs}ms backoff before attempt ${attemptNo + 2}/${MAX_RETRIES}...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`[AI Pipeline] ❌ All ${MAX_RETRIES} attempts failed. Last error:`, lastError instanceof Error ? lastError.message : lastError);
  throw lastError instanceof Error ? lastError : new Error("AI generation failed.");
}

async function attemptReply(
  req: AiRequest,
  sceneText: string,
  model: BaseChatModel,
  controller: AbortController,
  isRetry: boolean
): Promise<AgentReply> {
  const system = isRetry
    ? `${systemPromptText(req.uiTheme)}\n\n${MANDATORY_VISIBLE_RESPONSE}\n\n${RETRY_INSTRUCTION}`
    : `${systemPromptText(req.uiTheme)}\n\n${MANDATORY_VISIBLE_RESPONSE}`;

  const textContent = userMessageText(req, sceneText);
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: "text", text: textContent },
  ];
  if (req.atlasImage) {
    contentParts.push({ type: "image_url", image_url: { url: req.atlasImage, detail: "high" } });
  }
  if (req.focusInset) {
    contentParts.push({ type: "image_url", image_url: { url: req.focusInset, detail: "high" } });
  }
  const userMsg = new HumanMessage({ content: contentParts });

  const messages = [new SystemMessage(system), userMsg];

  let response: AgentReply | null = null;
  let usage: TokenUsage | undefined;

  // Use jsonMode for non-OpenAI or custom providers (like NVIDIA, Ollama, DeepSeek, Groq)
  // because OpenAI function_calling tools parameter is unsupported on vision endpoints for custom models.
  const isCustomOrNvidia = req.providerType !== "openai";
  const structOpts = isCustomOrNvidia
    ? { method: "jsonMode" as const, name: "canvas_reply" }
    : { name: "canvas_reply" };

  try {
    if (typeof model.withStructuredOutput === "function") {
      const base = model.withStructuredOutput(AgentReplySchema, structOpts);
      const res = await base.invoke(messages, { signal: controller.signal });
      usage = extractTokenUsage(res);
      response = {
        intent: res.intent ?? "answer",
        message: res.message,
        observedText: res.observedText,
        spatialPlan: res.spatialPlan,
        commands: Array.isArray(res.commands) ? res.commands : [],
      };
    } else {
      throw new Error("Structured output unavailable");
    }
  } catch (structErr) {
    // If structErr is a Rate Limit (429), Auth (401/403), or Abort error, DO NOT call model.invoke in catch!
    if (isRateLimitError(structErr) || isFatalAuthError(structErr) || controller.signal.aborted) {
      throw structErr;
    }

    console.warn(
      `[AI Pipeline] Structured output failed, falling back to direct JSON invocation:`,
      structErr instanceof Error ? structErr.message : structErr
    );
    const rawRes = await model.invoke(messages, { signal: controller.signal });
    usage = extractTokenUsage(rawRes);
    const text = typeof rawRes.content === "string" ? rawRes.content : JSON.stringify(rawRes.content);
    response = parseJsonResponse(text);
    if (!response) {
      throw structErr;
    }
  }

  let commands = Array.isArray(response.commands) ? response.commands : [];
  if (req.widgetEdit) {
    const targetType = req.widgetEdit.widgetType;
    const matched = commands.filter(
      (c) => typeof c === "object" && c !== null && (c as { tool?: string }).tool === targetType
    );
    if (matched.length > 0) {
      commands = [matched[0]];
    }
  }

  return {
    intent: response.intent ?? "answer",
    message: response.message,
    observedText: response.observedText,
    spatialPlan: response.spatialPlan,
    commands,
    tokenUsage: usage,
    debug: {
      systemPrompt: system,
      userPromptText: textContent,
      model: req.model || "model",
      rawResponse: response,
    },
  };
}