import { randomUUID } from "node:crypto";
import { BlockAssembler, ToolCallId, type StreamChunk } from "@deepseek-ai/dsh-llm";

export const CANVAS_DECISION_FEEDBACK_TOOL = "drawva_canvas_decision_feedback";
export const CANVAS_DECISION_PROTOCOL_SUMMARY =
  "Use at most one tool call per model step. Treat errors as feedback: correct or switch tools and continue; finish only when complete or unable to proceed.";

export interface DecisionFeedback {
  code: string;
  message: string;
  details?: unknown;
}

class CanvasDecisionProtocolError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "CanvasDecisionProtocolError";
    this.code = code;
    this.details = details;
  }
}

function decisionError(code: string, message: string, details: unknown = null): CanvasDecisionProtocolError {
  return new CanvasDecisionProtocolError(code, message, details);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function feedbackFrom(error: unknown, details: unknown = null): DecisionFeedback {
  const err = error as { code?: string; message?: string; details?: unknown };
  const code = String(err?.code || "CANVAS_DECISION_REJECTED");
  const message = String(err?.message || error || "Drawva Agent decision was rejected.");
  return Object.freeze({
    code,
    message: `${message} The entire tool decision was rejected before execution; no Canvas tool ran. Return exactly one corrected standard JSON tool call, or a final answer only when the task is complete or cannot proceed.`,
    details: details || err?.details || null,
  });
}

const feedbackCalls = new Map<string, DecisionFeedback>();
const feedbackCallIds = new Set<string>();

export function isDecisionFeedbackCall(callId: string): boolean {
  return feedbackCallIds.has(callId);
}

export function pruneDecisionFeedback(callId: string): DecisionFeedback | undefined {
  feedbackCallIds.delete(callId);
  const fb = feedbackCalls.get(callId);
  feedbackCalls.delete(callId);
  return fb;
}

export function clearDecisionFeedback(): void {
  feedbackCalls.clear();
  feedbackCallIds.clear();
}

function stageFeedback(feedback: DecisionFeedback): {
  type: "tool-call";
  id: ToolCallId;
  name: string;
  arguments: string;
} {
  const callId = `drawva_decision_${randomUUID()}`;
  const id = ToolCallId(callId);
  feedbackCalls.set(callId, feedback);
  feedbackCallIds.add(callId);
  return {
    type: "tool-call",
    id,
    name: CANVAS_DECISION_FEEDBACK_TOOL,
    arguments: JSON.stringify({ code: feedback.code }),
  };
}

const COMMAND_SYNONYMS = new Set([
  "write_text",
  "draw_formula",
  "plot_function",
  "animate_scene",
  "html_widget",
  "diagram_source",
  "draw",
  "erase",
]);

function validateToolCall(
  block: { name?: string; arguments?: string },
  availableTools: Set<string>
): void {
  const name = String(block?.name || "");
  if (!availableTools.has(name)) {
    if (COMMAND_SYNONYMS.has(name)) {
      throw decisionError(
        "CANVAS_COMMAND_NOT_TOOL",
        `'${name}' is a canvas command, not a top-level tool. To apply canvas commands (like ${name}), call the 'canvas_apply' tool with baseRevision and commands: [{ tool: '${name}', ... }].`
      );
    }
    throw decisionError(
      "CANVAS_TOOL_UNAVAILABLE",
      `Drawva Agent requested an unavailable tool: ${name || "(empty)"}. Available tools: ${[...availableTools].join(", ")}.`
    );
  }
  let args: unknown;
  try {
    args = JSON.parse(String(block?.arguments || "{}"));
  } catch (error) {
    throw decisionError(
      "CANVAS_TOOL_ARGUMENTS_INVALID",
      `${name} arguments are not valid complete JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isObject(args)) {
    throw decisionError("CANVAS_TOOL_ARGUMENTS_INVALID", `${name} arguments must be one JSON object.`);
  }
}

export function admitCanvasDecision({
  blocks,
  availableTools = [],
  enforceSingleTool = false,
}: {
  blocks: unknown[];
  availableTools: string[];
  enforceSingleTool?: boolean;
}):
  | { kind: "feedback"; block: { type: "tool-call"; id: ToolCallId; name: string; arguments: string } }
  | { kind: "final" }
  | { kind: "tool-call"; block: { type: "tool-call"; id: ToolCallId; name: string; arguments: string } }
  | { kind: "tool-calls"; blocks: { type: "tool-call"; id: ToolCallId; name: string; arguments: string }[] } {
  const content = Array.isArray(blocks)
    ? (blocks as { type: string; id?: ToolCallId; name?: string; arguments?: string }[])
    : [];
  const toolCalls = content.filter((block) => block?.type === "tool-call") as {
    type: "tool-call";
    id: ToolCallId;
    name: string;
    arguments: string;
  }[];

  if (enforceSingleTool && toolCalls.length > 1) {
    return {
      kind: "feedback",
      block: stageFeedback(
        feedbackFrom(
          decisionError(
            "CANVAS_ONE_TOOL_PER_STEP",
            `Your previous step returned ${toolCalls.length} tool calls, but Drawva Agent allows at most one tool call per model step.`,
            { toolCallCount: toolCalls.length }
          )
        )
      ),
    };
  }

  if (!toolCalls.length) return { kind: "final" };

  try {
    for (const call of toolCalls) {
      validateToolCall(call, new Set(availableTools));
    }
    if (toolCalls.length === 1) {
      return { kind: "tool-call", block: toolCalls[0] };
    }
    return { kind: "tool-calls", blocks: toolCalls };
  } catch (error) {
    return { kind: "feedback", block: stageFeedback(feedbackFrom(error)) };
  }
}

function chunkBlockType(chunk: StreamChunk): string | null {
  if (chunk.type === "block-start") return chunk.blockType;
  if (chunk.type === "text-delta") return "text";
  if (chunk.type === "reasoning-delta") return "reasoning";
  if (chunk.type === "tool-call-delta") return "tool-call";
  if (chunk.type === "block-end") return (chunk.block as { type?: string })?.type ?? null;
  return null;
}

function canonicalToolChunks(
  block: { id: ToolCallId; name: string; arguments: string },
  index: number
): StreamChunk[] {
  return [
    { type: "block-start", index, blockType: "tool-call" },
    { type: "tool-call-delta", index, id: block.id, name: block.name, argumentsDelta: block.arguments },
    { type: "block-end", index, block: { type: "tool-call", id: block.id, name: block.name, arguments: block.arguments } },
  ];
}

export async function* admitCanvasAgentDecisionStream(
  upstream: AsyncIterable<StreamChunk>,
  { availableTools = [] }: { availableTools?: string[] } = {}
): AsyncIterable<StreamChunk> {
  const assembler = new BlockAssembler();
  const heldChunks: StreamChunk[] = [];
  const heldUsageChunks: StreamChunk[] = [];
  const seenIndexes = new Set<number>();
  let finish: StreamChunk | null = null;

  for await (const chunk of upstream) {
    if ("index" in chunk && typeof chunk.index === "number" && Number.isInteger(chunk.index)) {
      seenIndexes.add(chunk.index);
    }
    if (chunk.type === "finish") {
      finish = chunk;
      break;
    }
    assembler.push(chunk);
    if (chunk.type === "usage") {
      heldUsageChunks.push(chunk);
      continue;
    }
    heldChunks.push(chunk);
  }

  const terminal = (finish || { type: "finish", reason: { kind: "stop" } }) as StreamChunk & {
    reason?: { kind?: string };
  };
  const terminalKind = terminal.reason?.kind;
  const assembledBlocks = assembler.blocks() as { type: string; id?: ToolCallId; name?: string; arguments?: string }[];
  const heldToolCalls = heldChunks
    .filter((chunk) => chunk.type === "block-end" && (chunk.block as { type?: string })?.type === "tool-call")
    .map((chunk) => (chunk as { block: { type: "tool-call"; id: ToolCallId; name: string; arguments: string } }).block);
  const assembledToolCalls = assembledBlocks.filter((block) => block?.type === "tool-call") as {
    type: "tool-call";
    id: ToolCallId;
    name: string;
    arguments: string;
  }[];
  const hasPartialToolCall = heldChunks.some((c) => chunkBlockType(c) === "tool-call");
  const toolCalls = assembledToolCalls.length ? assembledToolCalls : heldToolCalls;
  const blocks = assembledToolCalls.length || !heldToolCalls.length ? assembledBlocks : [...assembledBlocks, ...heldToolCalls];

  if (terminalKind === "error" || terminalKind === "aborted") {
    for (const held of heldChunks) yield held;
    for (const usage of heldUsageChunks) yield usage;
    yield terminal;
    return;
  }

  const admission =
    terminalKind === "max-tokens" && (toolCalls.length > 0 || hasPartialToolCall)
      ? {
          kind: "feedback" as const,
          block: stageFeedback(
            feedbackFrom(
              decisionError(
                "CANVAS_TOOL_DECISION_INCOMPLETE",
                "A tool decision reached the model token limit and cannot be executed safely.",
                { terminalKind }
              )
            )
          ),
        }
      : admitCanvasDecision({ blocks, availableTools });

  const unchangedSingleTool =
    admission.kind === "tool-call" && toolCalls.length === 1 && admission.block === toolCalls[0];
  const unchangedMultiTool =
    admission.kind === "tool-calls" && toolCalls.length > 1;

  if (admission.kind === "final" || unchangedSingleTool || unchangedMultiTool) {
    for (const held of heldChunks) yield held;
    for (const usage of heldUsageChunks) yield usage;
    yield terminal;
    return;
  }

  for (const held of heldChunks) {
    if (chunkBlockType(held) !== "tool-call") yield held;
  }
  const nextIndex = seenIndexes.size ? Math.max(...seenIndexes) + 1 : 0;
  const targetBlock =
    admission.kind === "feedback" || admission.kind === "tool-call"
      ? admission.block
      : admission.blocks[0];
  for (const chunk of canonicalToolChunks(targetBlock, nextIndex)) yield chunk;
  for (const usage of heldUsageChunks) yield usage;
  yield { type: "finish", reason: { kind: "tool-calls" } };
}

export function canvasDecisionFeedbackResult(exec: {
  name?: string;
  callId?: unknown;
}): {
  content: { type: "text"; text: string }[];
  isError: boolean;
  error: { message: string; info: { name: string; code: string } };
} | null {
  if (exec?.name !== CANVAS_DECISION_FEEDBACK_TOOL) return null;
  const callId = String(exec.callId || "");
  const feedback = pruneDecisionFeedback(callId) || {
    code: "CANVAS_DECISION_REJECTED",
    message: "Drawva Agent decision was rejected.",
  };
  return {
    content: [{ type: "text", text: `Drawva Agent decision rejected: ${feedback.message}` }],
    isError: true,
    error: { message: feedback.message, info: { name: "CanvasDecisionProtocolError", code: feedback.code } },
  };
}
