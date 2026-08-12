import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getAllCodeModels } from "./model";
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
import type { AiReply, AiRequest, AgentEvent } from "./types";

export const AgentReplySchema = z.object({
  intent: z.enum(["none", "hint", "continue", "explain", "plot", "correct", "erase", "answer", "typeset"]),
  observedText: z.string().optional(),
  message: z.string().optional(),
  commands: z.array(z.record(z.string(), z.unknown())),
});

export type AgentReply = z.infer<typeof AgentReplySchema>;

export interface AgentOptions {
  timeoutMs?: number;
  /** Provider id the user pinned; tried first, then the rest as fallback. */
  preferredProviderId?: string;
  /** Emitted as the pipeline moves between providers (for live fallback UI). */
  onEvent?: (event: AgentEvent) => void;
}

export async function runAgent(
  req: AiRequest,
  sceneText: string,
  opts: AgentOptions = {}
): Promise<AiReply> {
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await runPipeline(req, sceneText, controller, opts);
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
    parts.push(
      `\n--- REFINEMENT TARGET (widgetEdit) ---`,
      `Target Widget ID: ${req.widgetEdit.id}`,
      `Plugin ID: ${req.widgetEdit.pluginId}`,
      `Widget Type: ${req.widgetEdit.widgetType}`,
      `Source Format: ${req.widgetEdit.sourceFormat || "(none)"}`,
      `Current Title: ${req.widgetEdit.title || "(none)"}`,
      `Widget Box: ${JSON.stringify(req.widgetEdit.box)}`,
      `Current Source / Code:\n${(req.widgetEdit.source || req.widgetEdit.html || "").slice(0, 4000)}`,
      `REFINEMENT INSTRUCTION: This request is an in-place update for the target widget above. Read the newest handwritten ink near/on the target widget as modification instructions. Return exactly ONE replacement widget command (${req.widgetEdit.widgetType}) with pluginId:"${req.widgetEdit.pluginId}" and sourceFormat:"${req.widgetEdit.sourceFormat || "mermaid"}" that applies the requested changes while preserving unchanged content.`
    );
  }
  parts.push(`Scene JSON:\n${req.scene || sceneText}`, `\nInspect the attached canvas image (if present) and evaluate the prompt.`);
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

  // 1. Direct parse check
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

  // 2. Multi-object extraction (e.g. write_text{...} diagram_source{...})
  const commands: Record<string, unknown>[] = [];
  let observedText: string | undefined;
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
    return { intent: finalIntent, observedText, message, commands };
  }

  // 3. Truncated JSON salvage
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

/**
 * AI Perception & Execution Pipeline (Single Stage):
 *   Single stage — CODE model receives image, canvas scene metadata, user prompt, and
 *   returns structured JSON commands directly.
 */
async function runPipeline(
  req: AiRequest,
  sceneText: string,
  controller: AbortController,
  opts: AgentOptions = {}
): Promise<AiReply> {
  const { preferredProviderId, onEvent } = opts;

  // Provider order: user's pinned choice first, then the rest as fallback.
  let providers = getAllCodeModels();
  if (preferredProviderId) {
    providers = [
      ...providers.filter((p) => p.id === preferredProviderId),
      ...providers.filter((p) => p.id !== preferredProviderId),
    ];
  }

  if (providers.length === 0) {
    return getFallbackReply(req, "No AI provider configured — dry-run.");
  }

  let lastError: unknown = null;

  for (let idx = 0; idx < providers.length; idx++) {
    const { id, provider, model } = providers[idx];
    console.log(`[AI Pipeline] ⚡ Provider [${idx + 1}/${providers.length}]: "${provider}" starting...`);
    onEvent?.({ type: "provider_start", providerId: id, provider, attempt: idx + 1 });
    const base = model.withStructuredOutput(AgentReplySchema, { name: "canvas_reply" });

    const attempt = async (retry: boolean): Promise<AiReply> => {
      const system = retry
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

      // Baseten endpoints (deepinfra) do not support OpenAI tools parameter in HTTP body;
      // invoke direct text-text generation directly to get fast ~1s JSON generation.
      if (id === "deepinfra") {
        const rawRes = await model.invoke(messages, { signal: controller.signal });
        const text = typeof rawRes.content === "string" ? rawRes.content : JSON.stringify(rawRes.content);
        response = parseJsonResponse(text);
        if (!response) {
          throw new Error(`DeepInfra response could not be parsed as valid JSON: ${text.slice(0, 200)}`);
        }
      } else {
        try {
          const res = await base.invoke(messages, { signal: controller.signal });
          response = {
            intent: res.intent ?? "answer",
            message: res.message,
            observedText: res.observedText,
            commands: Array.isArray(res.commands) ? res.commands : [],
          };
        } catch (structErr) {
          console.warn(`[AI Pipeline] Structured output failed for "${provider}", falling back to direct JSON invocation:`, structErr instanceof Error ? structErr.message : structErr);
          const rawRes = await model.invoke(messages, { signal: controller.signal });
          const text = typeof rawRes.content === "string" ? rawRes.content : JSON.stringify(rawRes.content);
          response = parseJsonResponse(text);
          if (!response) {
            throw structErr;
          }
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

      const reply: AiReply = {
        intent: response.intent ?? "answer",
        message: response.message,
        observedText: response.observedText,
        commands,
        attempts: retry ? 2 : 1,
        requestId: req.requestId,
        providerId: id,
      };
      return reply;
    };

    try {
      const result = await attempt(false);
      console.log(`[AI Pipeline] ✅ Generation complete using "${provider}" (${result.commands.length} commands).`);
      onEvent?.({ type: "provider_done", providerId: id, provider });
      return result;
    } catch (err) {
      if (controller.signal.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Pipeline] ⚠️ Provider "${provider}" failed: ${msg}`);
      lastError = err;
      onEvent?.({ type: "provider_failed", providerId: id, provider, error: msg });

      // Retry once on same provider if not a 529/503 overload error
      if (!msg.includes("529") && !msg.includes("503") && !msg.includes("prediction")) {
        try {
          console.log(`[AI Pipeline] 🔄 Retrying provider "${provider}"...`);
          onEvent?.({ type: "provider_retry", providerId: id, provider });
          const retryResult = await attempt(true);
          onEvent?.({ type: "provider_done", providerId: id, provider });
          return retryResult;
        } catch (retryErr) {
          console.warn(`[AI Pipeline] ⚠️ Retry failed for "${provider}":`, retryErr instanceof Error ? retryErr.message : retryErr);
          lastError = retryErr;
        }
      }
      console.warn(`[AI Pipeline] 🔀 Escalating to next fallback provider...`);
    }
  }

  console.error(`[AI Pipeline] ❌ All AI providers failed. Last error:`, lastError instanceof Error ? lastError.message : lastError);
  throw lastError || new Error("All AI providers failed.");
}

export function getFallbackReply(req: AiRequest, message: string): AiReply {
  return {
    intent: "answer",
    message,
    commands: [],
    attempts: 0,
    requestId: req.requestId,
  };
}
