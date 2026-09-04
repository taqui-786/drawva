import type { CanvasEngine } from "@/lib/canvas/engine";
import type { WidgetManager } from "@/lib/canvas/widgets";
import type { ObjectManager } from "@/lib/canvas/objects";
import type { BoardHistory } from "@/lib/canvas/history";
import type { DraftManager } from "@/lib/canvas/draftStore";
import type { Camera } from "@/lib/canvas/camera";
import type { Rect } from "@/lib/canvas/types";
import type { AiLogEntry, AiLogStep } from "@/lib/ai/types";
import { AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import {
  getActiveModel,
  getProviderConfig,
  getReasoningEffort,
  getWebSearchEnabled,
  type ProviderConfig,
} from "@/lib/ai/provider";
import { buildAtlas } from "@/lib/canvas/atlas";
import { buildScene } from "@/lib/canvas/scene";
import { widgetGeometryForViewport } from "@/lib/ai/geometry";
import { SIZE } from "@/lib/canvas/constants";
import {
  saveAgentSession,
  loadAgentSession,
  clearAgentSession,
  saveAgentLog,
  redactLogEntry,
} from "@/lib/canvas/persistence";
import {
  AGENT_CONVERSATION_MAX_BYTES,
  AGENT_MAX_APPLIES_PER_TURN,
  AGENT_MAX_DETAIL_SNAPSHOTS_PER_TURN,
  AGENT_MAX_CONSECUTIVE_FAILURES,
  AGENT_MAX_EDITS_PER_TURN,
  AGENT_MAX_LOADED_PLUGINS,
  AGENT_MAX_PATCHES_PER_TURN,
  AGENT_MAX_SNAPSHOTS_PER_TURN,
  AGENT_MAX_STEPS_PER_TURN,
  AGENT_MAX_TURN_IMAGES,
  AGENT_SCENE_JSON_MAX,
  AGENT_TOOL_CACHE_ENTRIES,
  REVISION_FINGERPRINT_ENTRIES,
} from "./agentTools";
import { executeTool, fnv1a, type ActiveImage, type ConductorToolDeps } from "./conductorTools";

export type StepMessage =
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
  | { role: "system"; text: string; tag?: "cancel" };

export type ConductorEvent =
  | { kind: "turn_start" }
  | { kind: "step_start"; stepNumber?: number }
  | { kind: "tool_start"; name: string; argsSummary: string }
  | { kind: "tool_end"; name: string; ok: boolean; summary: string }
  | { kind: "text_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | { kind: "turn_end"; reason: "done" | "cancelled" | "error"; error?: string; message?: string }
  | { kind: "usage"; usage: { inputTokens: number; outputTokens: number } }
  | { kind: "log"; entry: AiLogEntry };

export interface ConductorDeps {
  engine: CanvasEngine;
  widgets: WidgetManager;
  objects: ObjectManager;
  history: BoardHistory;
  draft: DraftManager;
  camera: Camera;
  provider: () => ProviderConfig | null;
  getRevision: () => number;
  /** Content fingerprint of the board — see lib/canvas/fingerprint.ts. */
  getFingerprint: () => string;
  /**
   * Cumulative caller-frame → revision-bump tally. Diffed across the turn and
   * written to the log as `revisionBumps` so a conflict storm names its source.
   */
  getRevisionAudit?: () => Record<string, number>;
  onEvent: (e: ConductorEvent) => void;
  afterBoardChange: () => void;
  getInkBox?: () => Rect | null;
  canvasId?: () => string | undefined;
}

interface TurnPolicy {
  applies: number;
  patches: number;
  edits: number;
  snapshots: number;
  detailSnapshots: number;
  readOnlyStreak: number;
  layoutReviewNeeded: boolean;
  steps: number;
  /** Consecutive failures of the same tool — the anti-thrash fuse. */
  failStreak: { name: string; count: number };
  /** Once tripped, every later tool call in this turn short-circuits. */
  stopped: string;
  /** Widget title → id created this turn, so a retry cannot duplicate it. */
  createdWidgets: Map<string, string>;
}

/** Normalized widget title of a create command, or "" when this apply makes none. */
function widgetTitleOf(args: unknown): string {
  const commands = (args as { commands?: unknown })?.commands;
  const list = Array.isArray(commands) ? commands : [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (rec.targetId) return "";
    const makesWidget = rec.html !== undefined || rec.source !== undefined;
    const title = typeof rec.title === "string" ? rec.title.trim().toLowerCase() : "";
    if (makesWidget && title) return title;
  }
  return "";
}

/** Thrown to unwind the turn pump on cancel/generation change. */
class TurnAborted extends Error {
  constructor() {
    super("Turn aborted.");
    this.name = "TurnAborted";
  }
}

export class Conductor {
  private messages: StepMessage[] = [];
  private running = false;
  private currentGeneration = 0;
  private abort: AbortController | null = null;
  private sendQueue: { text: string; attachments?: File[]; options?: { headless?: boolean } }[] = [];
  private images = new Map<string, ActiveImage>();
  private latestSnapshotId: string | null = null;
  private turnImageIds: string[] = [];
  private atlasImageId: string | null = null;
  private listeners = new Set<(e: ConductorEvent) => void>();
  private turnUsage = { inputTokens: 0, outputTokens: 0 };
  /**
   * Largest single-step input token count in the turn. `turnUsage.inputTokens`
   * is the *sum* over steps, so a 14-step turn reports ~14× the real context
   * size; without this number the total is easy to misread as one request.
   */
  private turnPeakInput = 0;
  private turnSteps = 0;
  /**
   * revision → board fingerprint, recorded whenever a revision is reported to
   * the model. Lets the conflict check ask "did the content the model saw at
   * `baseRevision` actually change?" instead of "did the counter move?".
   */
  private revisionFingerprints = new Map<number, string>();
  /** Bump tally at turn start; the turn's own bumps are the difference. */
  private auditAtTurnStart: Record<string, number> = {};
  private revisionAtTurnStart = 0;
  /** Plugin ids whose contracts are injected into the server-side system prompt. */
  private loadedPluginIds = new Set<string>();
  /** Per-turn idempotency: SHA-256 of {name,args} → replayed outcome. */
  private toolCache = new Map<string, { result: unknown; isError: boolean }>();
  /** Revision the cache was built at — replays must never return stale revision-scoped state. */
  private toolCacheRevision = -1;

  constructor(private deps: ConductorDeps) {
    const restored = loadConversation(this.deps.canvasId?.());
    this.messages = restored.messages;
    this.loadedPluginIds = new Set(restored.pluginIds);
    void loadAgentSession(this.deps.canvasId?.()).then((saved) => {
      if (saved && Array.isArray(saved) && saved.length > 0 && this.messages.length === 0) {
        this.messages = saved as StepMessage[];
      }
    });
  }

  clearHistory(): void {
    this.messages = [];
    this.images.clear();
    this.latestSnapshotId = null;
    this.atlasImageId = null;
    this.loadedPluginIds.clear();
    clearConversation(this.deps.canvasId?.());
  }

  watch(fn: (e: ConductorEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getMessages(): StepMessage[] {
    return this.messages;
  }

  isRunning(): boolean {
    return this.running;
  }

  async send(text: string, attachments?: File[], options?: { headless?: boolean }): Promise<void> {
    if (this.running) {
      this.sendQueue.push({ text, attachments, options });
      return;
    }
    try {
      await this.runTurn(text, attachments, options);
    } catch (err) {
      this.running = false;
      this.emit({ kind: "turn_end", reason: "error", error: err instanceof Error ? err.message : "Agent turn failed." });
    }
    while (this.sendQueue.length && !this.running) {
      const next = this.sendQueue.shift();
      if (next) {
        try {
          await this.runTurn(next.text, next.attachments, next.options);
        } catch (err) {
          this.running = false;
          this.emit({ kind: "turn_end", reason: "error", error: err instanceof Error ? err.message : "Agent turn failed." });
        }
      }
    }
  }

  steer(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!this.running) {
      void this.send(trimmed);
      return;
    }
    // The agent loop runs server-side; steering posts straight into the
    // running turn and its events arrive on the open turn stream.
    this.messages.push({ role: "user", text: trimmed });
    this.persistConversation();
    this.postSteer(trimmed);
  }

  cancel(): void {
    this.currentGeneration++;
    this.sendQueue = [];
    this.abort?.abort();
    this.postCancel(false);
    if (!this.running) return;
    this.messages.push({ role: "system", text: "[user cancelled]", tag: "cancel" });
    this.running = false;
    this.emit({ kind: "turn_end", reason: "cancelled" });
  }

  reset(): void {
    this.cancel();
    this.postCancel(true);
    this.messages = [];
    this.images.clear();
    this.latestSnapshotId = null;
    this.turnImageIds = [];
    this.atlasImageId = null;
    clearConversation(this.deps.canvasId?.());
  }

  private emit(e: ConductorEvent): void {
    this.deps.onEvent(e);
    for (const fn of this.listeners) fn(e);
  }

  /**
   * Bumps attributed to this turn: total counter movement plus the per-caller
   * delta. A total far above the number of successful mutations means something
   * is calling afterBoardChange() without changing the board.
   */
  private turnRevisionBumps(): { total: number; byCaller: Record<string, number> } {
    const now = this.deps.getRevisionAudit?.() ?? {};
    const byCaller: Record<string, number> = {};
    for (const [caller, count] of Object.entries(now)) {
      const delta = count - (this.auditAtTurnStart[caller] ?? 0);
      if (delta > 0) byCaller[caller] = delta;
    }
    return { total: this.deps.getRevision() - this.revisionAtTurnStart, byCaller };
  }

  /**
   * Remember the fingerprint the board had at the current revision. First
   * observation wins: that is the state the model was shown for that revision.
   */
  private recordRevisionFingerprint(): void {
    const revision = this.deps.getRevision();
    if (this.revisionFingerprints.has(revision)) return;
    this.revisionFingerprints.set(revision, this.deps.getFingerprint());
    if (this.revisionFingerprints.size > REVISION_FINGERPRINT_ENTRIES) {
      this.revisionFingerprints.delete(this.revisionFingerprints.keys().next().value as number);
    }
  }

  private toolDeps(): ConductorToolDeps {
    return {
      engine: this.deps.engine,
      widgets: this.deps.widgets,
      objects: this.deps.objects,
      history: this.deps.history,
      draft: this.deps.draft,
      camera: this.deps.camera,
      getRevision: this.deps.getRevision,
      getFingerprint: this.deps.getFingerprint,
      fingerprintAt: (revision) => this.revisionFingerprints.get(revision),
      afterBoardChange: this.deps.afterBoardChange,
      registerImage: (img) => {
        this.images.set(img.id, img);
        this.latestSnapshotId = img.id;
      },
      registerPlugin: (pluginId) => {
        if (this.loadedPluginIds.has(pluginId)) return "already" as const;
        if (this.loadedPluginIds.size >= AGENT_MAX_LOADED_PLUGINS) return "limit" as const;
        this.loadedPluginIds.add(pluginId);
        return "registered" as const;
      },
      getInkBox: this.deps.getInkBox,
    };
  }

  private async runTurn(text: string, attachments?: File[], options?: { headless?: boolean }): Promise<void> {
    const files = attachments ?? [];
    if (files.length > AGENT_MAX_TURN_IMAGES) {
      this.emit({ kind: "turn_end", reason: "error", error: `At most ${AGENT_MAX_TURN_IMAGES} images per turn.` });
      return;
    }

    const gen = ++this.currentGeneration;
    const initialLen = this.messages.length;
    this.running = true;
    this.abort = new AbortController();
    this.turnImageIds = [];
    this.atlasImageId = null;
    this.turnUsage = { inputTokens: 0, outputTokens: 0 };
    this.turnPeakInput = 0;
    this.turnSteps = 0;
    this.turnErrorMessage = "";
    this.toolCache = new Map();
    this.toolCacheRevision = this.deps.getRevision();
    this.revisionFingerprints = new Map([[this.toolCacheRevision, this.deps.getFingerprint()]]);
    this.auditAtTurnStart = { ...(this.deps.getRevisionAudit?.() ?? {}) };
    this.revisionAtTurnStart = this.toolCacheRevision;
    this.emit({ kind: "turn_start" });

    let userText = text.trim();
    let finished = false;
    let finalText = "";

    try {
      const images: { id: string; dataUrl: string }[] = [];
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
        const id = `img-${fnv1a(dataUrl)}`;
        images.push({ id, dataUrl });
        this.images.set(id, { id, dataUrl, note: `attachment ${file.name || id}` });
        this.turnImageIds.push(id);
      }

      let atlasMeta: { sourceRect: Rect; imageScale: number; changedBox?: Rect } | undefined;
      // If no image files were uploaded, capture the canvas so the vision model sees what the user wrote and drew!
      if (images.length === 0) {
        try {
          const viewport = this.deps.camera.visibleWorldRect();
          const ink = this.deps.getInkBox?.() ?? null;
          const atlas = await buildAtlas(
            this.deps.engine,
            viewport,
            ink,
            this.deps.widgets,
            this.deps.objects
          );
          if (atlas?.atlasImage) {
            const id = `img-atlas-${fnv1a(atlas.atlasImage)}`;
            images.push({ id, dataUrl: atlas.atlasImage });
            this.images.set(id, {
              id,
              dataUrl: atlas.atlasImage,
              note: `canvas snapshot (sourceRect: {x:${atlas.sourceRect.x},y:${atlas.sourceRect.y},w:${atlas.sourceRect.w},h:${atlas.sourceRect.h}}, scale:${atlas.imageScale.toFixed(4)})`,
            });
            this.latestSnapshotId = id;
            this.turnImageIds.push(id);
            atlasMeta = {
              sourceRect: atlas.sourceRect,
              imageScale: atlas.imageScale,
              changedBox: atlas.changedBox,
            };
            this.atlasImageId = id;
          }
        } catch (err) {
          console.warn("[Conductor] Failed to capture canvas snapshot:", err);
        }
      }

      const host = this.hostRefs(atlasMeta);
      userText = [text.trim(), host].filter(Boolean).join("\n\n");
      this.messages.push({ role: "user", text: userText, images: images.length ? images : undefined });
      this.persistConversation();

      const policy: TurnPolicy = {
        applies: 0,
        patches: 0,
        edits: 0,
        snapshots: 0,
        detailSnapshots: 0,
        readOnlyStreak: 0,
        layoutReviewNeeded: false,
        steps: 0,
        failStreak: { name: "", count: 0 },
        stopped: "",
        createdWidgets: new Map(),
      };
      const stepsLog: AiLogStep[] = [];

      // The agent loop runs server-side: one turn stream carries text deltas
      // and tool requests; this side answers tool requests with the same
      // budget/cache/layout policy the per-step loop used to enforce.
      const turnResult = await this.postTurn(userText, images, gen, policy, stepsLog);
      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      if (turnResult.kind === "error") {
        this.emit({ kind: "turn_end", reason: "error", error: turnResult.message || "Agent turn failed." });
        return;
      }
      finalText = turnResult.text || "";
      finished = true;
      this.messages.push({ role: "assistant", text: finalText });
      stepsLog.push({
        stepNumber: policy.steps + 1,
        text: finalText,
        summary: "Finished turn with final message",
      });
      this.persistConversation();

      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      this.emit({ kind: "turn_end", reason: "done", message: finalText || undefined });

      const config = this.deps.provider() ?? getProviderConfig();
      const commandsList: unknown[] = [];
      for (const s of stepsLog) {
        if (s.tool === "canvas_apply" && s.args && typeof s.args === "object") {
          const a = s.args as { commands?: unknown[] };
          if (Array.isArray(a.commands)) {
            commandsList.push(...a.commands);
          }
        }
      }

      const logEntry: AiLogEntry = {
        timestamp: Date.now(),
        requestId: `turn-${Date.now()}`,
        model: getActiveModel() || "unknown",
        providerType: config?.type,
        attempts: Math.max(1, policy.steps),
        status: finished ? "success" : "error",
        errorMessage: finished ? undefined : "Agent turn ended without a final answer.",
        atlasImage: this.images.get(this.latestSnapshotId || "")?.dataUrl || "",
        systemPrompt: AGENT_SYSTEM_PROMPT,
        userPromptText: userText,
        injectedPlugins: [...this.loadedPluginIds],
        steps: stepsLog,
        revisionBumps: this.turnRevisionBumps(),
        tokenUsage: {
          inputTokens: this.turnUsage.inputTokens,
          outputTokens: this.turnUsage.outputTokens,
          totalTokens: this.turnUsage.inputTokens + this.turnUsage.outputTokens,
          // inputTokens is the sum over every step in the turn — each step
          // resends the system prompt and the whole conversation. These two make
          // that readable: peak is the largest single request's context.
          peakInputTokens: this.turnPeakInput,
          billedSteps: this.turnSteps,
        },
        response: {
          message: finalText,
          commands: commandsList,
        },
      };
      this.emit({ kind: "log", entry: logEntry });
      // Durable per-turn trace: redacted copy survives reloads for debugging.
      void saveAgentLog(redactLogEntry(logEntry));
    } catch (err) {
      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Agent turn failed.";
      this.emit({ kind: "turn_end", reason: "error", error: message });
    } finally {
      if (gen === this.currentGeneration) {
        this.running = false;
        this.abort = null;
        if (options?.headless) {
          this.messages = this.messages.slice(0, initialLen);
        } else {
          this.persistConversation();
          this.pruneImages();
        }
      }
    }
  }

  private async postTurn(
    userText: string,
    images: { id: string; dataUrl: string }[],
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string }> {
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model) {
      return { kind: "error", message: "Configure an API provider in Settings to use Drawva Agent." };
    }

    const body = {
      conversation: this.conversationSuffix(),
      providerType: config.type,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      reasoningEffort: getReasoningEffort(),
      text: userText,
      images: images.length ? images : undefined,
      history: this.seedHistory(),
      loadedPluginIds: [...this.loadedPluginIds],
      webSearch: getWebSearchEnabled(),
    };

    const attempt = async (): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string }> => {
      const res = await fetch("/api/canvas/agent/step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abort?.signal,
      });
      if (!res.ok || !res.body) {
        let message = "Agent turn failed.";
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          message = data.error || data.message || message;
        } catch {}
        const err = new Error(message) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return this.pumpTurnStream(res, gen, policy, stepsLog);
    };

    try {
      return await attempt();
    } catch (err) {
      if (err instanceof TurnAborted || this.abort?.signal.aborted || gen !== this.currentGeneration) {
        return { kind: "cancelled" };
      }
      if (isRetryableTurnError(err)) {
        // Server already retried with backoff; this client retry covers HTTP-level
        // failures. Delay so a rate-limited provider gets breathing room.
        await sleep(1500, this.abort?.signal);
        try {
          return await attempt();
        } catch (retryErr) {
          if (retryErr instanceof TurnAborted || this.abort?.signal.aborted || gen !== this.currentGeneration) {
            return { kind: "cancelled" };
          }
          return { kind: "error", message: retryErr instanceof Error ? retryErr.message : "Agent turn failed." };
        }
      }
      return { kind: "error", message: err instanceof Error ? err.message : "Agent turn failed." };
    }
  }

  /**
   * Read one turn stream: text/reasoning/usage events project straight
   * through; each tool request runs the client policy chain and posts back
   * as a tool result on the same conversation.
   */
  private async pumpTurnStream(
    res: Response,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string }> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Mutable so a tool call can clear it: interim "working on it" lines are
    // progress, not the answer, and concatenating them produced the 25-sentence
    // final message in the reported trace.
    const sink = { text: "" };
    const checkLive = () => {
      if (gen !== this.currentGeneration || this.abort?.signal.aborted) throw new TurnAborted();
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        checkLive();
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf("\n\n");
        while (sep >= 0) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const outcome = await this.handleTurnFrame(block, gen, policy, stepsLog, sink);
          if (outcome === "final") return { kind: "final", text: sink.text };
          if (outcome === "error") return { kind: "error", message: this.turnErrorMessage || "Agent turn failed." };
          sep = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      if (err instanceof TurnAborted) return { kind: "cancelled" };
      throw err;
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }
    return { kind: "final", text: sink.text };
  }

  /**
   * Handle one SSE frame. Returns "final"/"error" when the turn stream is
   * complete, "continue" otherwise. Tool requests are answered inline before
   * reading resumes so the server loop keeps flowing on this same stream.
   */
  private async handleTurnFrame(
    block: string,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[],
    sink: { text: string }
  ): Promise<"continue" | "final" | "error"> {
    const eventName = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
    const dataLine = /^data: (.+)$/m.exec(block)?.[1] ?? "";
    if (!dataLine) return "continue";
    let data: unknown = null;
    try {
      data = JSON.parse(dataLine);
    } catch {
      return "continue";
    }
    if (!data || typeof data !== "object") return "continue";
    const rec = data as Record<string, unknown>;
    if (eventName === "text_delta" && typeof rec.text === "string") {
      sink.text += rec.text;
      this.emit({ kind: "text_delta", text: rec.text });
    } else if (eventName === "reasoning" && typeof rec.text === "string") {
      // Reasoning tokens never become the final answer — detail only.
      this.emit({ kind: "reasoning_delta", text: rec.text });
    } else if (eventName === "tool_request" && typeof rec.name === "string") {
      // Anything said before a tool call was a progress line, not the answer.
      sink.text = "";
      const toolCallId = String(rec.toolCallId || `call-${Date.now()}`);
      const answer = await this.answerToolRequest(String(rec.name), rec.args, toolCallId, gen, policy, stepsLog);
      if (gen !== this.currentGeneration || this.abort?.signal.aborted) throw new TurnAborted();
      await this.postToolResult(toolCallId, answer.result, answer.isError);
    } else if (eventName === "tool_end") {
      // Server echo of the posted result; the client already emitted its own.
    } else if (eventName === "agent_status") {
      // Server lifecycle mirror; the client owns running state.
    } else if (eventName === "final") {
      if (typeof rec.text === "string" && rec.text) sink.text = rec.text;
      return "final";
    } else if (eventName === "usage") {
      const inputTokens = Number(rec.inputTokens || 0);
      const outputTokens = Number(rec.outputTokens || 0);
      this.turnUsage.inputTokens += inputTokens;
      this.turnUsage.outputTokens += outputTokens;
      this.turnPeakInput = Math.max(this.turnPeakInput, inputTokens);
      this.turnSteps += 1;
      this.emit({ kind: "usage", usage: { inputTokens, outputTokens } });
    } else if (eventName === "error") {
      this.turnErrorMessage = String(rec.message || rec.error || "Agent turn failed.");
      return "error";
    }
    return "continue";
  }

  private turnErrorMessage = "";

  private async postToolResult(toolCallId: string, result: unknown, isError: boolean): Promise<void> {
    const signal = this.abort?.signal;
    try {
      await fetch("/api/canvas/agent/tool-result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversation: this.conversationSuffix(), toolCallId, result: result ?? {}, isError }),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (this.abort?.signal.aborted) throw new TurnAborted();
      throw err;
    }
  }

  private postSteer(text: string): void {
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model) return;
    const host = this.hostRefs();
    void fetch("/api/canvas/agent/step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversation: this.conversationSuffix(),
        providerType: config.type,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model,
        reasoningEffort: getReasoningEffort(),
        text: [text, host].filter(Boolean).join("\n\n"),
        loadedPluginIds: [...this.loadedPluginIds],
        webSearch: getWebSearchEnabled(),
        mode: "steer",
      }),
      signal: this.abort?.signal,
    })
      .then(async (res) => {
        try {
          await res.body?.cancel();
        } catch {}
      })
      .catch(() => {});
  }

  private postCancel(dispose: boolean): void {
    void fetch("/api/canvas/agent/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation: this.conversationSuffix(), ...(dispose ? { action: "dispose" } : {}) }),
    }).catch(() => {});
  }

  /** Server conversation suffix: per canvas, safe alphabet only. */
  private conversationSuffix(): string {
    const raw = this.deps.canvasId?.() || "default";
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw) ? raw : "default";
  }

  /**
   * Seed text for a fresh server conversation: recent user/assistant texts
   * only (tool payloads stay local). Established server sessions ignore it.
   */
  private seedHistory(): { role: string; text: string }[] {
    const out: { role: string; text: string }[] = [];
    let chars = 0;
    for (let i = this.messages.length - 1; i >= 0 && out.length < 60 && chars < 24_000; i--) {
      const m = this.messages[i];
      if (m.role === "user" && m.text.trim()) {
        out.unshift({ role: "user", text: m.text.slice(0, 2000) });
        chars += m.text.length;
      } else if (m.role === "assistant" && m.text.trim()) {
        const suffix = m.toolCall ? ` [called ${m.toolCall.name}]` : "";
        out.unshift({ role: "assistant", text: `${m.text.slice(0, 2000)}${suffix}` });
        chars += m.text.length;
      }
    }
    return out;
  }


  /**
   * Answer one server-requested tool call with the client-side policy chain:
   * budgets, idempotency cache, layout-review gate, and board execution.
   * The server loop parks until the answer posts back as a tool result.
   */
  private async answerToolRequest(
    name: string,
    args: unknown,
    toolCallId: string,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<{ result: unknown; isError: boolean }> {
    // Sticky terminal stop. Without it the model kept re-issuing the same
    // rejected call for the rest of the turn (25 steps, 3 landed).
    if (policy.stopped) {
      return { result: { ok: true, code: "STOPPED", message: policy.stopped }, isError: false };
    }
    policy.steps += 1;
    this.emit({ kind: "step_start", stepNumber: policy.steps });
    if (policy.steps > AGENT_MAX_STEPS_PER_TURN) {
      policy.stopped = `Step limit reached (${AGENT_MAX_STEPS_PER_TURN}). Tool use is closed for this turn: keep the best valid result and reply with a final answer now.`;
      return { result: { ok: true, code: "STEP_LIMIT_REACHED", message: policy.stopped }, isError: false };
    }
    this.emit({ kind: "tool_start", name, argsSummary: summarizeArgs(args) });

    let result: unknown;
    let isError = false;
    const budget: Record<string, { used: number; cap: number }> = {
      canvas_apply: { used: policy.applies, cap: AGENT_MAX_APPLIES_PER_TURN },
      canvas_patch_widget: { used: policy.patches, cap: AGENT_MAX_PATCHES_PER_TURN },
      canvas_edit: { used: policy.edits, cap: AGENT_MAX_EDITS_PER_TURN },
      canvas_snapshot: { used: policy.snapshots, cap: AGENT_MAX_SNAPSHOTS_PER_TURN },
    };
    const spent = budget[name];
    const duplicateTitle = name === "canvas_apply" ? widgetTitleOf(args) : "";
    const alreadyMade = duplicateTitle ? policy.createdWidgets.get(duplicateTitle) : undefined;
    if ((name === "canvas_patch_widget" || name === "canvas_edit") && policy.layoutReviewNeeded) {
          isError = true;
          result = {
            code: "LAYOUT_REVIEW_REQUIRED",
            message:
              "Widgets were just created or moved. Call canvas_snapshot with target=canvas, quality=basic to review the full layout before the next mutation.",
          };
        } else if (alreadyMade) {
          // The reported turn created "Animated Solar System" twice and then
          // spent nine steps trying to delete the copy. A retry of a widget you
          // already made is a patch/edit on the existing one, not a new create.
          isError = true;
          result = {
            code: "DUPLICATE_WIDGET",
            message: `A widget titled "${duplicateTitle}" was already created this turn as ${alreadyMade}. Refine that one with canvas_patch_widget or canvas_edit, or finish — do not create a second copy.`,
            objectId: alreadyMade,
          };
        } else if (spent && spent.used >= spent.cap) {
          // Exhausting a budget ends tool use for the turn instead of leaving the
          // model free to pivot to another tool and keep spinning.
          policy.stopped = `${name} budget reached (${spent.cap}). Tool use is closed for this turn: keep the best valid result and reply with a final answer now.`;
          result = { ok: true, code: "BUDGET_REACHED", message: policy.stopped };
        } else if (
          name === "canvas_snapshot" &&
          (args as { quality?: string } | null)?.quality === "detail" &&
          policy.detailSnapshots >= AGENT_MAX_DETAIL_SNAPSHOTS_PER_TURN
        ) {
          isError = true;
          result = {
            code: "DETAIL_BUDGET_REACHED",
            message: `Detail-snapshot budget reached (${AGENT_MAX_DETAIL_SNAPSHOTS_PER_TURN}/${AGENT_MAX_DETAIL_SNAPSHOTS_PER_TURN}). Use quality=basic or act on the detail you already have.`,
          };
        } else {
          // Any board change (apply, user ink, rollback) invalidates replays:
          // cached scan/snapshot results embed revision-scoped state and a
          // stale replayed revision poisons every subsequent baseRevision.
          const revisionNow = this.deps.getRevision();
          if (revisionNow !== this.toolCacheRevision) {
            this.toolCache.clear();
            this.toolCacheRevision = revisionNow;
          }
          const signature = await toolSignature(name, args);
          const cached = this.toolCache.get(signature);
          if (cached) {
            // Idempotent replay: identical {name,args} within the turn returns
            // the earlier outcome instead of executing again.
            result = cached.result;
            isError = cached.isError;
          } else {
            try {
              result = await executeTool(name, args, this.toolDeps());
              if (gen !== this.currentGeneration || this.abort?.signal.aborted) throw new TurnAborted();
              isError = isFailedResult(result);
              this.toolCache.set(signature, { result, isError });
              if (this.toolCache.size > AGENT_TOOL_CACHE_ENTRIES) {
                this.toolCache.delete(this.toolCache.keys().next().value as string);
              }
              if (result && typeof result === "object") {
                const rec = result as Record<string, unknown>;
                if (name === "canvas_apply" && rec.ok === true) {
                  policy.applies += 1;
                  if (duplicateTitle) {
                    const made = Array.isArray(rec.applied)
                      ? (rec.applied as { objectId?: unknown; kind?: unknown }[]).find(
                          (row) => row.kind === "html" || row.kind === "diagram"
                        )
                      : undefined;
                    const id = typeof made?.objectId === "string" ? made.objectId : "";
                    if (id) policy.createdWidgets.set(duplicateTitle, id);
                  }
                }
                if (name === "canvas_patch_widget" && rec.ok === true) policy.patches += 1;
                if (name === "canvas_edit" && rec.ok === true) policy.edits += 1;
                if (name === "canvas_snapshot" && rec.ok !== false) {
                  policy.snapshots += 1;
                  if ((args as { quality?: string } | null)?.quality === "detail") policy.detailSnapshots += 1;
                }
                // Layout-review gate: only a content-covering snapshot proves the
                // layout — a zoomed region/object view cannot verify composition.
                if (rec.widgetMutated === true) policy.layoutReviewNeeded = true;
                if (name === "canvas_snapshot" && rec.ok !== false && rec.coversContent === true) {
                  policy.layoutReviewNeeded = false;
                }
              }
            } catch (err) {
              isError = true;
              result = {
                code: "INTERNAL",
                message: err instanceof Error ? err.message : "Tool failed.",
              };
              this.toolCache.set(signature, { result, isError });
              if (this.toolCache.size > AGENT_TOOL_CACHE_ENTRIES) {
                this.toolCache.delete(this.toolCache.keys().next().value as string);
              }
            }
          }
        }

        isError = isError || isFailedResult(result);
        // Anti-thrash fuse. The real-user trace shows the same rejected
        // canvas_edit re-sent five times in one turn; after N consecutive
        // failures of one tool, tool use ends and the model must answer.
        if (isError) {
          policy.failStreak =
            policy.failStreak.name === name
              ? { name, count: policy.failStreak.count + 1 }
              : { name, count: 1 };
          if (policy.failStreak.count >= AGENT_MAX_CONSECUTIVE_FAILURES) {
            policy.stopped = `${name} failed ${policy.failStreak.count} times in a row, so tool use is closed for this turn. Keep what is already on the board and reply with a final answer explaining what you could not do.`;
            result = { ...(result as Record<string, unknown>), stopped: true, instruction: policy.stopped };
          }
        } else {
          policy.failStreak = { name: "", count: 0 };
        }
        // Read-only streak nudge. It rides on the tool result because that is
        // the only channel the server-side loop actually shows the model —
        // this.messages only seeds a *fresh* server session.
        if (name === "canvas_scan" || name === "canvas_snapshot" || name === "canvas_read" || name === "canvas_focus") {
          policy.readOnlyStreak += 1;
        } else {
          policy.readOnlyStreak = 0;
        }
        if (policy.readOnlyStreak >= 4 && !policy.stopped && result && typeof result === "object") {
          policy.readOnlyStreak = 0;
          result = {
            ...(result as Record<string, unknown>),
            instruction:
              "4 reads without a mutation. You have enough context — act now (canvas_apply/canvas_edit/canvas_patch_widget) or finish with a final answer. Do not re-capture a region you already saw.",
          };
        }
        // Every revision handed to the model gets its content fingerprint
        // recorded, so the next mutation's conflict check can distinguish
        // "the board changed" from "the counter moved".
        this.recordRevisionFingerprint();
        const toolImages = this.imagesForTool(name, result);
        stepsLog.push({
          stepNumber: policy.steps,
          tool: name,
          args,
          result,
          isError,
          summary: summarizeResult(result),
          text: undefined,
        });

        this.messages.push({
          role: "assistant",
          text: "",
          toolCall: { id: toolCallId, name, args },
        });
        this.messages.push({
          role: "tool",
          toolCallId,
          name,
          result,
          isError,
          images: toolImages,
        });
        // Crash durability: the turn's tool history survives a tab crash mid-run.
        this.persistConversation();
        this.emit({
          kind: "tool_end",
          name,
          ok: !isError,
          summary: summarizeResult(result),
        });
    return { result, isError };
  }

  private persistConversation(): void {
    saveConversation(this.messages, this.deps.canvasId?.(), [...this.loadedPluginIds]);
  }

  private hostRefs(atlasMeta?: { sourceRect: Rect; imageScale: number; changedBox?: Rect }): string {
    const selected = [
      this.deps.widgets.getSelectedId(),
      this.deps.objects.getSelectedId(),
    ].filter((id): id is string => Boolean(id));
    const viewport = this.deps.camera.visibleWorldRect();
    const ink = (atlasMeta?.changedBox && atlasMeta.changedBox.w > 0 && atlasMeta.changedBox.h > 0 && (!atlasMeta.sourceRect || atlasMeta.changedBox.w !== atlasMeta.sourceRect.w || atlasMeta.changedBox.h !== atlasMeta.sourceRect.h))
      ? atlasMeta.changedBox
      : (this.deps.getInkBox?.() ?? null);
    const scene = trimScene(buildScene(this.deps.widgets, this.deps.objects), viewport, selected);
    const widgetMax = widgetGeometryForViewport(viewport).max;
    return JSON.stringify({
      revision: this.deps.getRevision(),
      viewport,
      sourceRect: atlasMeta?.sourceRect || viewport,
      imageScale: atlasMeta?.imageScale || 1,
      canvasSize: SIZE,
      // The placement engine clamps any widget past this, preserving aspect.
      // Without it in the prompt the model asked for 3400x1180, silently got
      // 2500x867, and spent the rest of the turn trying to resize it back.
      maxWidgetSize: widgetMax,
      selectedIds: selected,
      newestInkBox: ink,
      scene,
    });
  }

  private activeImageIds(): Set<string> {
    const ids = new Set<string>(this.turnImageIds);
    if (this.latestSnapshotId) ids.add(this.latestSnapshotId);
    // Once the agent takes a fresher snapshot, the turn-opening atlas is
    // superseded — stop re-paying its vision tokens on every subsequent step.
    if (this.latestSnapshotId && this.atlasImageId && this.latestSnapshotId !== this.atlasImageId) {
      ids.delete(this.atlasImageId);
    }
    return ids;
  }

  private pruneImages(): void {
    const active = this.activeImageIds();
    for (const [id] of this.images) {
      if (!active.has(id)) {
        this.images.delete(id);
      }
    }
  }

  private imagesForTool(name: string, result: unknown): { id: string; dataUrl: string }[] | undefined {
    if (name !== "canvas_snapshot") return undefined;
    const id = result && typeof result === "object" ? String((result as { imageId?: unknown }).imageId || "") : "";
    const img = id ? this.images.get(id) : undefined;
    if (!img) return undefined;
    return [{ id: img.id, dataUrl: img.dataUrl }];
  }

}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/** Stable SHA-256 signature of a tool call for the idempotency cache. */
async function toolSignature(name: string, args: unknown): Promise<string> {
  const payload = JSON.stringify({ name, args: stableValue(args) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest.slice(0, 12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stableValue(v)])
    );
  }
  return value;
}

function getConversationKey(canvasId?: string): string {
  return canvasId ? `drawva.agent.conversation.${canvasId}` : "drawva.agent.conversation";
}

function stripImages(messages: StepMessage[]): StepMessage[] {
  return messages.map((m) => {
    if (m.role === "user" && m.images?.length) {
      const notes = m.images.map((img) => `[image expired: ${img.id}]`).join("\n");
      return { role: "user", text: notes ? `${m.text}\n${notes}` : m.text };
    }
    if (m.role === "tool" && m.images?.length) {
      const { images: _images, ...rest } = m;
      void _images;
      return rest;
    }
    return m;
  });
}

function loadConversation(canvasId?: string): { messages: StepMessage[]; pluginIds: string[] } {
  if (typeof window === "undefined") return { messages: [], pluginIds: [] };
  try {
    const raw = window.localStorage.getItem(getConversationKey(canvasId));
    if (!raw) return { messages: [], pluginIds: [] };
    const parsed = JSON.parse(raw) as { messages?: StepMessage[]; pluginIds?: string[] };
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      pluginIds: Array.isArray(parsed.pluginIds) ? parsed.pluginIds : [],
    };
  } catch {
    return { messages: [], pluginIds: [] };
  }
}

function saveConversation(messages: StepMessage[], canvasId?: string, pluginIds: string[] = []): void {
  if (typeof window === "undefined") return;
  const key = getConversationKey(canvasId);
  const stripped = stripImages(messages);
  void saveAgentSession(stripped, canvasId);
  let payload = { messages: stripped, pluginIds, createdAt: Date.now(), updatedAt: Date.now() };
  let raw = JSON.stringify(payload);
  while (raw.length > AGENT_CONVERSATION_MAX_BYTES && payload.messages.length > 1) {
    payload.messages.splice(0, 1);
    payload = { ...payload, updatedAt: Date.now() };
    raw = JSON.stringify(payload);
  }
  try {
    window.localStorage.setItem(key, raw);
  } catch {}
}

function clearConversation(canvasId?: string): void {
  if (typeof window === "undefined") return;
  void clearAgentSession(canvasId);
  try {
    window.localStorage.removeItem(getConversationKey(canvasId));
  } catch {}
}

function trimScene(
  scene: { items: Array<{ id?: string; kind: string; x: number; y: number; w: number; h: number; title?: string }>; count: number },
  viewport?: Rect | null,
  selectedIds?: string[]
) {
  const selectedSet = new Set(selectedIds || []);
  const sorted = [...scene.items].sort((a, b) => {
    const aSel = a.id && selectedSet.has(a.id) ? 1 : 0;
    const bSel = b.id && selectedSet.has(b.id) ? 1 : 0;
    if (aSel !== bSel) return bSel - aSel;
    if (viewport) {
      const aIn = a.x < viewport.x + viewport.w && a.x + a.w > viewport.x && a.y < viewport.y + viewport.h && a.y + a.h > viewport.y ? 1 : 0;
      const bIn = b.x < viewport.x + viewport.w && b.x + b.w > viewport.x && b.y < viewport.y + viewport.h && b.y + b.h > viewport.y ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
    }
    return a.y !== b.y ? a.y - b.y : a.x - b.x;
  });

  const items = sorted.map((i) => ({
    id: i.id,
    kind: i.kind,
    box: { x: i.x, y: i.y, w: i.w, h: i.h },
    title: i.title,
  }));
  let payload: unknown = { items, count: scene.count };
  let json = JSON.stringify(payload);
  while (items.length && json.length > AGENT_SCENE_JSON_MAX) {
    items.pop();
    payload = { items, count: scene.count, truncated: true };
    json = JSON.stringify(payload);
  }
  return payload;
}

function summarizeArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 160 ? `${s.slice(0, 157)}...` : s;
  } catch {
    return "";
  }
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const rec = result as Record<string, unknown>;
  if (typeof rec.code === "string") return String(rec.code);
  if (rec.ok === false) return "failed";
  if (typeof rec.imageId === "string") return "snapshot";
  if (Array.isArray(rec.applied)) return `applied ${rec.applied.length}`;
  if (typeof rec.document === "string") return "plugin loaded";
  if (Array.isArray(rec.items)) return `${rec.items.length} items`;
  return "ok";
}

function isFailedResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const rec = result as Record<string, unknown>;
  if (rec.ok === true) return false;
  return rec.ok === false || typeof rec.code === "string";
}

function isRetryableTurnError(err: unknown): boolean {
  const rec = err as { status?: number; message?: string };
  const status = Number(rec.status || 0);
  const msg = String(rec.message || "").toLowerCase();
  return status === 429 || status >= 500 || msg.includes("429") || msg.includes("rate limit");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read attachment."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}
