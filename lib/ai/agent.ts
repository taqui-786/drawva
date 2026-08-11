// ============================================================
// Drawva AI System — LangChain Runnable Agent Pipeline
// ============================================================
// Two-stage multimodal agent:
//   Stage 1 (vision): snapshot image recognition (only when the
//     request carries a canvas data-URL image)
//   Stage 2 (code):  RunnableSequence → ChatOpenAI.withStructuredOutput
//   Self-healing:    validateCommand + repair chain that re-prompts
//     with RETRY_INSTRUCTION(reason); text-parser fallback for
//     providers without tool-calling support.
//   Last resort:     getFallbackReply() single minimal widget card.
// ============================================================

import { z } from "zod";
import { validateCommand } from "@/lib/canvas/commands";
import { getAiModel } from "./model";
import {
  SYSTEM_PROMPT,
  FLOWCHART_RULES,
  MANDATORY_VISIBLE,
  JSON_CONTRACT,
  RETRY_INSTRUCTION,
  buildHumanMessage,
  PROMPT_EVAL_SYSTEM_PROMPT,
  buildPromptEvalHumanMessage,
} from "./prompts";
import type { AiIntent, AiRequest, AiReply } from "./types";

// ── Zod contract (mirrors CanvasCommand in lib/canvas/types.ts) ──

const TOOL_NAMES = [
  "write_text",
  "draw_formula",
  "plot_function",
  "draw",
  "erase",
  "html_widget",
  "diagram_source",
] as const;

const INTENTS: readonly AiIntent[] = [
  "none",
  "answer",
  "explain",
  "hint",
  "plot",
  "continue",
  "flowchart",
  "refine",
  "plantuml",
  "smiles",
  "vegalite",
  "circuit",
  "widget",
  "app",
  "game",
];

const toolSchema = z
  .object({
    tool: z.enum(TOOL_NAMES),
    x: z.number().default(100),
    y: z.number().default(100),
    w: z.number().optional(),
    h: z.number().optional(),
    mode: z.literal("rect").optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    maxWidth: z.number().optional(),
    latex: z.string().optional(),
    expression: z.string().optional(),
    origin: z.object({ x: z.number(), y: z.number() }).optional(),
    types: z.array(z.string()).optional(),
    items: z.array(z.unknown()).optional(),
    html: z.string().optional(),
    title: z.string().optional(),
    pluginId: z.string().optional(),
    diagramKind: z.string().optional(),
    sourceFormat: z.string().optional(),
    source: z.string().optional(),
    copyText: z.string().optional(),
    copyLabel: z.string().optional(),
    frameworkVersion: z.string().optional(),
  })
  .passthrough();

export const replySchema = z.object({
  intent: z.enum(INTENTS),
  message: z.string().optional(),
  commands: z.array(toolSchema).min(1).max(16),
});

function sanitizeJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Agent entry point ────────────────────────────────────────

/**
 * Executes the complete LangChain Runnable Agent pipeline:
 * 1. Stage 1 (Vision): NVIDIA / OpenCode snapshot image recognition
 * 2. Stage 2 (Prompt Evaluation): NVIDIA / Eval prompt analysis & enrichment
 * 3. Stage 3 (Code & Widget Generation): Structured output generation
 * 4. Self-healing repair loop: validateCommand failures re-prompt model
 * 5. Minimal deterministic fallback widget when offline
 */
export async function runCanvasAiAgent(
  req: AiRequest,
  options?: { maxAttempts?: number },
): Promise<AiReply> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const hasImage = Boolean(
    req.atlasImage && req.atlasImage.startsWith("data:image/"),
  );

  const visionModel = hasImage
    ? getAiModel({ task: "vision", hasImage: true })
    : null;
  const evalModel = getAiModel({ task: "eval" });
  const codeModel = getAiModel({ task: "code", hasImage: false });

  if (!codeModel && !visionModel && !evalModel) {
    return getFallbackReply(req);
  }

  // ── Stage 1: Multimodal vision recognition ──
  let visualNotes = "";
  if (hasImage && visionModel) {
    try {
      console.log("[AI Agent] 👁️ Stage 1: Running snapshot vision recognition...");
      const visionRes = await visionModel.invoke([
        {
          role: "system",
          content:
            "You are a visual recognition assistant for an interactive whiteboard. Describe all handwritten text, drawings, shapes, and annotations present in the image snapshot concisely.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: req.atlasImage } },
            {
              type: "text",
              text: "Identify all text, diagram nodes, and visual marks in this canvas snapshot.",
            },
          ],
        },
      ]);
      visualNotes =
        typeof visionRes.content === "string"
          ? visionRes.content
          : JSON.stringify(visionRes.content);
      console.log(
        `[AI Agent] 👁️ Vision notes: "${visualNotes.slice(0, 150)}..."`,
      );
    } catch (vErr) {
      const errMsg = vErr instanceof Error ? vErr.message : String(vErr);
      console.warn(
        `[AI Agent] ⚠️ Vision stage skipped/failed (${errMsg}). Proceeding with scene JSON.`,
      );
    }
  }

  // ── Stage 2: Prompt Evaluation & Refinement Stage ──
  let evaluatedPrompt = "";
  const activeEvalModel = evalModel || visionModel || codeModel;
  if (activeEvalModel) {
    try {
      console.log("[AI Agent] 🔍 Stage 2: Running Prompt Evaluation chain...");
      const evalRes = await activeEvalModel.invoke([
        { role: "system", content: PROMPT_EVAL_SYSTEM_PROMPT },
        { role: "user", content: buildPromptEvalHumanMessage(req, visualNotes) },
      ]);
      evaluatedPrompt =
        typeof evalRes.content === "string"
          ? evalRes.content
          : JSON.stringify(evalRes.content);
      console.log(
        `[AI Agent] 🔍 Evaluated Prompt: "${evaluatedPrompt.slice(0, 150)}..."`,
      );
    } catch (eErr) {
      const errMsg = eErr instanceof Error ? eErr.message : String(eErr);
      console.warn(
        `[AI Agent] ⚠️ Prompt eval stage skipped (${errMsg}). Using raw input.`,
      );
    }
  }

  // ── Stage 3: Code & Widget Generation Stage ──
  const activeModel = codeModel || evalModel || visionModel!;

  const humanText = `${FLOWCHART_RULES}\n${MANDATORY_VISIBLE}\n${JSON_CONTRACT}\n\n${buildHumanMessage(req)}${
    visualNotes ? `\n\n[Visual Snapshot Recognition]:\n${visualNotes}` : ""
  }${
    evaluatedPrompt ? `\n\n[Evaluated & Refined Prompt Spec]:\n${evaluatedPrompt}` : ""
  }`;

  let lastErrorReason = "";

  // Direct generation chain with Zod schema validation
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[AI Agent] ⚡ Stage 3: Invoking code model (Attempt ${attempt})...`);
      const messages: unknown[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: humanText },
      ];

      if (attempt > 1 && lastErrorReason) {
        messages.push({
          role: "user",
          content: RETRY_INSTRUCTION(lastErrorReason),
        });
      }

      const response = await activeModel.invoke(
        messages as Parameters<typeof activeModel.invoke>[0],
      );

      const rawContent =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const cleanedJson = sanitizeJsonString(rawContent);
      const parsedJson = JSON.parse(cleanedJson);
      const raw = replySchema.parse(parsedJson);

      const commands = raw.commands;
      if (commands.length === 0) {
        lastErrorReason = "Model returned an empty commands array";
        continue;
      }

      let valid = true;
      for (const cmd of commands) {
        const v = validateCommand(cmd);
        if (!v.ok) {
          valid = false;
          lastErrorReason = v.reason || "invalid command structure";
          break;
        }
      }
      if (!valid) continue;

      console.log(
        `[AI Agent] ✅ Attempt ${attempt}: emitting ${commands.length} command(s).`,
      );
      return {
        intent: raw.intent as AiIntent,
        message: raw.message,
        commands: commands as unknown as AiReply["commands"],
        attempts: attempt,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Agent] Attempt ${attempt} failed: ${errMsg}`);
      lastErrorReason = errMsg || "Failed to emit structured commands";
    }
  }

  // Last resort: single minimal deterministic card
  return getFallbackReply(req);
}

/**
 * Single minimal fallback reply — used when no LLM API key is
 * configured or every generation attempt failed.
 */
export function getFallbackReply(req: AiRequest): AiReply {
  const vX = req.atlasRect?.x ?? 0;
  const vY = req.atlasRect?.y ?? 0;
  const vW = req.atlasRect?.w ?? req.canvasSize.w;
  const vH = req.atlasRect?.h ?? req.canvasSize.h;

  const defaultW = Math.max(480, Math.round(vW * 0.65));
  const defaultH = Math.max(320, Math.round(vH * 0.55));
  const defaultX = Math.round(vX + (vW - defaultW) / 2);
  const defaultY = Math.round(vY + (vH - defaultH) / 2);

  const promptText = escapeHtml(
    (req.userPrompt || "Canvas Item").slice(0, 30),
  );

  return {
    intent: "widget",
    message: "Generated interactive canvas card",
    commands: [
      {
        tool: "html_widget",
        x: defaultX,
        y: defaultY,
        w: defaultW,
        h: defaultH,
        title: promptText,
        html: `<div class="p-6 font-sans text-slate-800 bg-white/95 rounded-2xl shadow-xl border border-slate-200 text-center"><div class="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Drawva Widget</div><div class="text-lg font-extrabold mb-2">${promptText}</div><div class="text-xs text-slate-500 mb-4">Set DEEPINFRA_API_KEY in .env.local to enable 100% dynamic AI generation for any prompt.</div><button class="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs" onclick="alert('Ready!')">Interact</button></div>`,
      },
    ],
    attempts: 1,
  };
}