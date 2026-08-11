import { BaseMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { getAiVisionModel, getAiEvalModel, getAiCodeModel } from "./model";
import { AiRequestPayload, AiReplyResponse } from "./types";
import {
  VISION_SYSTEM_PROMPT,
  EVAL_SYSTEM_PROMPT,
  CODE_SYSTEM_PROMPT,
  JSON_CONTRACT,
  MANDATORY_VISIBLE,
  FLOWCHART_RULES,
} from "./prompts";
import { validateCommand } from "@/lib/canvas/commands";

export async function processAiCanvasRequest(payload: AiRequestPayload): Promise<AiReplyResponse> {
  const visionModel = getAiVisionModel();
  const evalModel = getAiEvalModel();
  const codeModel = getAiCodeModel();

  // Dry-run mode if primary models are unavailable
  if (!visionModel && !codeModel) {
    console.log("[AI Agent] 🤖 Running in dry-run mode (no API key configured)");
    return getDryRunFallbackReply(payload);
  }

  const changedBox = computeChangedBox(payload);

  try {
    // ----------------------------------------------------
    // STAGE 1: Vision Model (Perception Only)
    // ----------------------------------------------------
    let visionAnalysis = "No image provided or vision model disabled.";

    if (payload.image && visionModel) {
      console.log("[AI Chain] 👁️ Stage 1: Running Vision Model...");
      const visionMessages: BaseMessage[] = [
        new SystemMessage(VISION_SYSTEM_PROMPT),
        new HumanMessage({
          content: [
            {
              type: "image_url",
              image_url: {
                url: payload.image.startsWith("data:")
                  ? payload.image
                  : `data:image/webp;base64,${payload.image}`,
              },
            },
            {
              type: "text",
              text: `Analyze this canvas snapshot image in detail. User Typed Input: "${payload.typedInput || ""}".`,
            },
          ] as unknown as string,
        }),
      ];

      const visionResponse = await visionModel.invoke(visionMessages);
      visionAnalysis =
        typeof visionResponse.content === "string"
          ? visionResponse.content
          : JSON.stringify(visionResponse.content);
      console.log(`[AI Chain] 👁️ Vision Model Output: "${visionAnalysis.slice(0, 150)}..."`);
    }

    // ----------------------------------------------------
    // STAGE 2: Eval Model (Synthesis & Prompt Optimization)
    // ----------------------------------------------------
    let evaluatedPrompt = visionAnalysis;

    if (evalModel) {
      console.log("[AI Chain] 🧠 Stage 2: Running Prompt Eval Model...");
      const evalMessages: BaseMessage[] = [
        new SystemMessage(EVAL_SYSTEM_PROMPT),
        new HumanMessage(
          `Vision Model Analysis: ${visionAnalysis}\n\nUser Bounding Box (changedBox): ${JSON.stringify(
            changedBox
          )}\n\nScene State JSON: ${JSON.stringify(
            payload.scene || []
          )}\n\nVisible Bounds: ${JSON.stringify(
            payload.visibleRect || {}
          )}\n\nUser Typed Input: "${payload.typedInput || ""}"\nAction Trigger: ${
            payload.userAction || "auto"
          }`
        ),
      ];

      const evalResponse = await evalModel.invoke(evalMessages);
      evaluatedPrompt =
        typeof evalResponse.content === "string"
          ? evalResponse.content
          : JSON.stringify(evalResponse.content);
      console.log(`[AI Chain] 🧠 Eval Model Output: "${evaluatedPrompt.slice(0, 150)}..."`);
    }

    // ----------------------------------------------------
    // STAGE 3: Code Model (Structured Command Generation)
    // ----------------------------------------------------
    const targetCodeModel = codeModel || visionModel;
    if (!targetCodeModel) return getDryRunFallbackReply(payload);

    console.log("[AI Chain] ⚡ Stage 3: Running Code Model for JSON Canvas Commands...");
    const codeSystemContent = `${CODE_SYSTEM_PROMPT}\n\n${JSON_CONTRACT}\n\n${MANDATORY_VISIBLE}\n\n${FLOWCHART_RULES}`;
    const codeMessages: BaseMessage[] = [
      new SystemMessage(codeSystemContent),
      new HumanMessage(
        `Evaluated Instruction Prompt:\n${evaluatedPrompt}\n\nUser Active Drawing Bounding Box (changedBox):\n${JSON.stringify(
          changedBox
        )}\n\nVisible Rect Bounds:\n${JSON.stringify(payload.visibleRect || {})}`
      ),
    ];

    const codeResponse = await targetCodeModel.invoke(codeMessages);
    const codeOutput =
      typeof codeResponse.content === "string"
        ? codeResponse.content
        : JSON.stringify(codeResponse.content);

    return parseModelResponse(codeOutput, payload, changedBox);
  } catch (err: unknown) {
    console.error("[AI Agent Chain Error]:", err);
    return getDryRunFallbackReply(payload);
  }
}

function computeChangedBox(payload: AiRequestPayload): { x: number; y: number; w: number; h: number } {
  if (payload.scene && payload.scene.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of payload.scene) {
      const x = (item as { x?: number; box?: { x: number } }).x ?? (item as { box?: { x: number } }).box?.x ?? 0;
      const y = (item as { y?: number; box?: { y: number } }).y ?? (item as { box?: { y: number } }).box?.y ?? 0;
      const w = (item as { w?: number; box?: { w: number } }).w ?? (item as { box?: { w: number } }).box?.w ?? 200;
      const h = (item as { h?: number; box?: { h: number } }).h ?? (item as { box?: { h: number } }).box?.h ?? 100;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    if (minX !== Infinity && maxX - minX > 0 && maxY - minY > 0) {
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
  const vis = payload.visibleRect || { x: 500, y: 500, w: 600, h: 400 };
  return { x: Math.round(vis.x + 50), y: Math.round(vis.y + 50), w: 300, h: 100 };
}

function parseModelResponse(
  rawText: string,
  payload: AiRequestPayload,
  changedBox: { x: number; y: number; w: number; h: number }
): AiReplyResponse {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getDryRunFallbackReply(payload);

    const parsed = JSON.parse(jsonMatch[0]);
    const rawCmds = Array.isArray(parsed.commands) ? parsed.commands : [];
    const validCmds = [];

    for (const cmd of rawCmds) {
      // Fallback placement if model missed explicit x/y
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
        cmd.x = Math.round(changedBox.x + changedBox.w + 40);
        cmd.y = Math.round(changedBox.y);
      }
      const v = validateCommand(cmd);
      if (v.valid && v.command) {
        validCmds.push(v.command);
      }
    }

    return {
      intent: parsed.intent || "Canvas assistant response",
      message: parsed.message || "Updated canvas",
      commands: validCmds,
      attempts: 1,
    };
  } catch {
    return getDryRunFallbackReply(payload);
  }
}

function getDryRunFallbackReply(payload: AiRequestPayload): AiReplyResponse {
  const visible = payload.visibleRect || { x: 500, y: 500, w: 600, h: 400 };
  const posX = Math.round(visible.x + visible.w / 2 - 50);
  const posY = Math.round(visible.y + visible.h / 2 - 20);

  // Math calculation check (Drawva demo behavior "3+2=" -> "5")
  const typed = payload.typedInput || "";
  let answerText = "5";
  if (typed.includes("=") || typed.includes("+")) {
    try {
      const expr = typed.replace("=", "").trim();
      const val = Function(`"use strict"; return (${expr})`)();
      if (typeof val === "number" && !isNaN(val)) answerText = String(val);
    } catch {}
  }

  return {
    intent: "Dry-run demo answer",
    message: "Dry-run mode: AI generated sample output",
    commands: [
      {
        tool: "write_text",
        x: posX,
        y: posY,
        text: answerText,
        fontSize: 32,
        color: "#2563eb",
      },
    ],
    attempts: 1,
  };
}
