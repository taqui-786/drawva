import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { MAX_RETRIES } from "./model";
import {
  AI_TIMEOUT_MS,
  CODE_SYSTEM_PROMPT_EXTRA,
  FEWSHOT_SMALL_MODEL_PROMPT,
  PLUGIN_ROUTING_PROMPT,
  WIDGET_SYSTEM_PROMPT,
  THEME_PERSONAS,
  MANDATORY_VISIBLE_RESPONSE,
  RETRY_INSTRUCTION,
  SYSTEM_PROMPT,
} from "./prompts";
import { getModelTier, type ModelTier } from "./tiers";
import { widgetGeometryForViewport } from "./geometry";
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

/**
 * Builds the stable system prompt.
 * Order: identity/rules -> persona -> routing/tool selection -> widget system -> (micro fewshot if not frontier) -> mandatory fallback -> JSON schema.
 * Note: A stable prefix maximizes provider prompt caching; never interpolate volatile per-request data into system blocks.
 */
export function buildSystemPromptText(uiTheme?: string, pluginsEnabled = false, tier?: ModelTier): string {
  const persona = THEME_PERSONAS[uiTheme || "studio"] || THEME_PERSONAS.studio;
  const sections = [
    SYSTEM_PROMPT,
    `Persona Focus: ${persona}`,
  ];

  if (pluginsEnabled) {
    sections.push(PLUGIN_ROUTING_PROMPT, WIDGET_SYSTEM_PROMPT);
  }

  if (tier && tier !== "frontier") {
    sections.push(FEWSHOT_SMALL_MODEL_PROMPT);
  }

  sections.push(
    MANDATORY_VISIBLE_RESPONSE,
    CODE_SYSTEM_PROMPT_EXTRA
  );

  return sections.join("\n\n");
}

export function buildRetryInstruction(rejectReasons?: string[]): string {
  if (!rejectReasons || rejectReasons.length === 0) {
    return RETRY_INSTRUCTION;
  }

  const corrections: string[] = [];
  const seen = new Set<string>();

  for (const r of rejectReasons) {
    if (r.startsWith("draw.") && !seen.has("draw")) {
      corrections.push(
        "Your draw command was invalid. draw requires {tool:'draw', points:[[x,y],...], size:n} — one connected polyline in global coordinates. Resend the sketch as points; never use objects or nesting."
      );
      seen.add("draw");
    } else if (r.startsWith("animate_scene.") && !seen.has("animate_scene")) {
      corrections.push(
        "Your animate_scene was invalid. Keep the same visual plan. Objects need id + type (circle/ellipse/rect/line/path/text/group). Paths may use points:[[x,y],...] or SVG d. Translate may use from/to offsets or path:\"M...\". Pulse/fade use numeric from/to. Skip unknown fields rather than dropping the scene."
      );
      seen.add("animate_scene");
    } else if (r.startsWith("plot_function.") && !seen.has("plot_function")) {
      corrections.push(
        "plot_function requires an ASCII math expression with variable x (e.g. sin(x)*exp(-x))."
      );
      seen.add("plot_function");
    } else if (r.startsWith("html_widget.") && !seen.has("html_widget")) {
      corrections.push(
        "html_widget requires complete HTML/SVG document string in property 'html', with finite x, y, w, h."
      );
      seen.add("html_widget");
    } else if (r.startsWith("not-allowed:") && !seen.has("not-allowed")) {
      corrections.push(
        "Use only enabled tools: write_text, draw_formula, plot_function, animate_scene, html_widget, diagram_source, draw, erase."
      );
      seen.add("not-allowed");
    } else if (r.includes("max-1-widget") && !seen.has("widget-count")) {
      corrections.push(
        "Only 1 widget (html_widget or diagram_source) allowed per response. Companion write_text/draw_formula are permitted."
      );
      seen.add("widget-count");
    }
  }

  if (corrections.length === 0) {
    return RETRY_INSTRUCTION;
  }

  return `CORRECTIVE RETRY INSTRUCTION:\n${corrections.join("\n")}\nCarefully re-examine the canvas and return ONLY a valid JSON object conforming to the schema.`;
}

function userMessageText(req: AiRequest, sceneText: string): string {
  const widgetEdit = req.widgetEdit;
  const format = widgetEdit
    ? widgetEdit.sourceFormat || (widgetEdit.widgetType === "diagram_source" ? "mermaid" : "html")
    : "";
  const pluginId = widgetEdit
    ? format !== "mermaid" && format !== "html"
      ? format
      : widgetEdit.pluginId || "flowchart"
    : "";

  const pluginsEnabled = Array.isArray(req.enabledPlugins) && req.enabledPlugins.length > 0;

  const modelInput: Record<string, unknown> = {
    requestId: req.requestId,
    trigger: req.trigger,
    userAction: req.trigger === "manual" ? "answer" : "auto",
    actionMeaning: {
      auto: "respond naturally to the newest meaningful handwriting or spatial editing gesture",
      answer: "directly answer the newest question or spatial request",
    }[req.trigger === "manual" ? "answer" : "auto"],
    languagePolicy: "respond in English",
    uiTheme: req.uiTheme || "studio",
    persona: THEME_PERSONAS[req.uiTheme || "studio"] || THEME_PERSONAS.studio,
    personaPolicy:
      "Use persona to guide technical emphasis, reasoning method, examples, terminology, answer structure, and tone. It must not override user intent, response language, factual rigor, or safety requirements.",
    ...(req.reasoningEffort && req.reasoningEffort !== "default"
      ? {
          reasoningEffort: req.reasoningEffort,
          reasoningPolicy: {
            low: "Prioritize swift, concise direct answers. Avoid lengthy internal derivation.",
            medium: "Balance step-by-step thinking with speed. Verify calculations and layout coordinates before finalizing commands.",
            high: "Reason thoroughly step-by-step. Deeply verify mathematical derivations, coordinate constraints, and visual precision.",
            max: "Maximize analytical rigor. Exhaustively check every step, geometry constraint, and syntax rule before returning output.",
          }[req.reasoningEffort],
        }
      : {}),
    ...(pluginsEnabled
      ? {
          enabledPlugins: req.enabledPlugins,
        }
      : {}),
    canvasSize: { w: 20000, h: 20000 },
    visibleRect: req.visibleRect,
    captureRect: req.captureRect,
    sourceRect: req.sourceRect,
    imageSize: req.imageSize,
    imageScale: req.imageScale ?? null,
    latestInput: req.latestInput || { globalRect: req.changedBox, imageRect: null },
    changedBox: req.changedBox,
    focusInset: req.focusInset || null,
    widgetGeometry: widgetGeometryForViewport(req.visibleRect),
    userPrompt: req.userPrompt || null,
    scene: safeJson(req.scene || sceneText),
    note: widgetEdit
      ? "widgetEdit provides the existing target widget state for refinement reference. If the user's latest input modifies, annotates, or refines this widget (including multiple annotations like colors, labels, dates, fields, or structural edits), synthesize all of them and return placement in_place. If the user asks to draw or create a new independent visual, return a new command with placement inside_target, below, right, or match_sketch. The attached image is the full high-resolution visual of the canvas."
      : "The attached image is the full visual of the canvas. Inspect all user handwriting, markings, arrows, and annotations across the image. When user asks to solve/complete/animate over a hand-drawn sketch (e.g. maze, puzzle, circuit, diagram), UTILIZE the existing drawing: overlay ONLY the solution line/animation directly on the sketch at its global coordinates (placement: in_place, match_sketch, or overlay); DO NOT recreate the background visual or walls. If the user drew a container box/frame/circle or arrow target for the output, set placement to 'inside_target' or 'at_target' with {x, y, w, h}. For sketch replacements use 'match_sketch'. For in-place edits/overlays use 'in_place'. For adjacent items without a container, use 'below', 'right', 'left', or 'top'.",
  };

  if (widgetEdit) {
    const wb = widgetEdit.box;
    modelInput.widgetEdit = {
      id: widgetEdit.id,
      pluginId,
      widgetType: widgetEdit.widgetType,
      title: widgetEdit.title || "",
      sourceFormat: format,
      box: wb,
      source: (widgetEdit.source || widgetEdit.html || "").slice(0, 4000),
    };
    modelInput.widgetEditPolicy =
      widgetEdit.widgetType === "diagram_source"
        ? `The user is interacting near or targeting the supplied diagram_source widget ("${widgetEdit.title || "diagram"}"). The supplied source and sourceFormat are the current state.
- If the user's input contains updates, refinements, additions, or modifications of this diagram (including multiple annotations across different parts of the diagram), synthesize ALL of them into ONE complete replacement diagram_source with pluginId "${pluginId}", sourceFormat "${format}", and placement "in_place".
- If the user's latest input is a NEW independent drawing or separate request (e.g. "Draw <new topic>", "Create ...", a new sketch in open space), generate a NEW item with placement "below", "right", or "match_sketch". DO NOT replace or overwrite the existing diagram.`
        : `The user is interacting near or targeting the supplied html_widget ("${widgetEdit.title || "widget"}"). The supplied HTML/source is the current state.
- If the user's input contains updates, annotations, colors, labels, dates, or refinements for this widget (including multiple simultaneous annotations across different parts of the widget), synthesize ALL of them into ONE complete updated replacement html_widget for the same plugin with placement "in_place".
- If the user's latest input is a NEW independent visual or separate request, generate a NEW item with placement "below", "right", or "match_sketch". DO NOT replace or overwrite the existing widget.`;
  }

  return JSON.stringify(modelInput);
}

function safeJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
  const rawObj = (obj.raw && typeof obj.raw === "object" ? obj.raw : undefined) as Record<string, unknown> | undefined;

  const usageMeta = (obj.usage_metadata || rawObj?.usage_metadata) as Record<string, unknown> | undefined;
  if (usageMeta && typeof usageMeta === "object") {
    const inputTokens = Number(usageMeta.input_tokens || usageMeta.prompt_tokens || 0);
    const outputTokens = Number(usageMeta.output_tokens || usageMeta.completion_tokens || 0);
    const totalTokens = Number(usageMeta.total_tokens || inputTokens + outputTokens);
    if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
      return { inputTokens, outputTokens, totalTokens };
    }
  }

  const respMeta = (obj.response_metadata || rawObj?.response_metadata) as Record<string, unknown> | undefined;
  if (respMeta && typeof respMeta === "object") {
    const tokenUsage = (respMeta.tokenUsage || respMeta.usage || respMeta.estimatedTokenUsage) as Record<string, unknown> | undefined;
    if (tokenUsage && typeof tokenUsage === "object") {
      const inputTokens = Number(tokenUsage.promptTokens || tokenUsage.prompt_tokens || tokenUsage.input_tokens || 0);
      const outputTokens = Number(tokenUsage.completionTokens || tokenUsage.completion_tokens || tokenUsage.output_tokens || 0);
      const totalTokens = Number(tokenUsage.totalTokens || tokenUsage.total_tokens || inputTokens + outputTokens);
      if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
        return { inputTokens, outputTokens, totalTokens };
      }
    }
  }

  const directUsage = (obj.usage || rawObj?.usage) as Record<string, unknown> | undefined;
  if (directUsage && typeof directUsage === "object") {
    const inputTokens = Number(directUsage.promptTokens || directUsage.prompt_tokens || directUsage.input_tokens || directUsage.prompt_token_count || 0);
    const outputTokens = Number(directUsage.completionTokens || directUsage.completion_tokens || directUsage.output_tokens || directUsage.candidates_token_count || 0);
    const totalTokens = Number(directUsage.totalTokens || directUsage.total_tokens || inputTokens + outputTokens);
    if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
      return { inputTokens, outputTokens, totalTokens };
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
  let lastRejectReasons: string[] | undefined = undefined;

  for (let attemptNo = 0; attemptNo < MAX_RETRIES; attemptNo++) {
    const isRetry = attemptNo > 0;
    try {
      const reply = await attemptReply(req, sceneText, model, controller, isRetry, lastRejectReasons);
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
      if (err && typeof err === "object" && "rejectReasons" in err && Array.isArray((err as { rejectReasons?: unknown }).rejectReasons)) {
        lastRejectReasons = (err as { rejectReasons: string[] }).rejectReasons;
      } else {
        lastRejectReasons = undefined;
      }

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
  isRetry: boolean,
  lastRejectReasons?: string[]
): Promise<AgentReply> {
  const pluginsEnabled = Array.isArray(req.enabledPlugins) && req.enabledPlugins.length > 0;
  const tier = req.tier ?? getModelTier(req.model);
  const system = isRetry
    ? `${buildSystemPromptText(req.uiTheme, pluginsEnabled, tier)}\n\n${buildRetryInstruction(lastRejectReasons)}`
    : buildSystemPromptText(req.uiTheme, pluginsEnabled, tier);

  const textContent = userMessageText(req, sceneText);
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: "text", text: textContent },
  ];
  if (req.atlasImage) {
    contentParts.push({ type: "image_url", image_url: { url: req.atlasImage, detail: "high" } });
  }
  const userMsg = new HumanMessage({ content: contentParts });

  const messages = [new SystemMessage(system), userMsg];

  let response: AgentReply | null = null;
  let usage: TokenUsage | undefined;

  // Use jsonMode for non-OpenAI or custom providers (like NVIDIA, Ollama, DeepSeek, Groq)
  // because OpenAI function_calling tools parameter is unsupported on vision endpoints for custom models.
  const isCustomOrNvidia = req.providerType !== "openai";
  const structOpts = isCustomOrNvidia
    ? { method: "jsonMode" as const, name: "canvas_reply", includeRaw: true as const }
    : { name: "canvas_reply", includeRaw: true as const };

  try {
    if (typeof model.withStructuredOutput === "function") {
      const base = model.withStructuredOutput(AgentReplySchema, structOpts);
      const res = (await base.invoke(messages, { signal: controller.signal })) as
        | { raw?: unknown; parsed?: AgentReply }
        | AgentReply;
      usage = extractTokenUsage(res);
      const parsed = (res && typeof res === "object" && "parsed" in res && res.parsed ? res.parsed : res) as AgentReply;
      response = {
        intent: parsed.intent ?? "answer",
        message: parsed.message,
        observedText: parsed.observedText,
        spatialPlan: parsed.spatialPlan,
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
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
  const planSaysReplace = typeof response.spatialPlan === "string" && /\b(replace|in[-_]place|refine|update|modify|convert|functional)\b/i.test(response.spatialPlan);
  if (planSaysReplace || req.widgetEdit) {
    for (const c of commands) {
      if (typeof c === "object" && c !== null) {
        const rec = c as Record<string, unknown>;
        if (!rec.placement || rec.placement === "auto") {
          rec.placement = "in_place";
        }
        if (req.widgetEdit?.id && !rec.targetId) {
          rec.targetId = req.widgetEdit.id;
        }
      }
    }
  }
  if (req.widgetEdit) {
    const targetType = req.widgetEdit.widgetType;
    const inPlaceMatched = commands.filter(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        (c as { tool?: string }).tool === targetType &&
        (c as { placement?: string }).placement === "in_place"
    );
    if (inPlaceMatched.length > 0) {
      commands = [inPlaceMatched[0]];
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