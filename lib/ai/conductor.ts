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
  AGENT_MAX_EDITS_PER_TURN,
  AGENT_MAX_LOADED_PLUGINS,
  AGENT_MAX_PATCHES_PER_TURN,
  AGENT_MAX_STEPS_PER_TURN,
  AGENT_MAX_TURN_IMAGES,
  AGENT_SCENE_JSON_MAX,
  AGENT_TOOL_CACHE_ENTRIES,
  COMPACT_KEEP,
  REVISION_FINGERPRINT_ENTRIES,
} from "./agentTools";
import { compactionTriggerTokens } from "./capabilities";
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
  | { role: "system"; text: string; tag?: "compact" | "steer" | "cancel" };

export type ConductorEvent =
  | { kind: "turn_start" }
  | { kind: "step_start"; stepNumber?: number }
  | { kind: "tool_start"; name: string; argsSummary: string }
  | { kind: "tool_end"; name: string; ok: boolean; summary: string }
  | { kind: "text_delta"; text: string }
  | { kind: "turn_end"; reason: "done" | "cancelled" | "error"; error?: string }
  | { kind: "usage"; usage: { inputTokens: number; outputTokens: number } }
  | { kind: "compact" }
  | { kind: "compact_failed"; message: string }
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

interface StepToolCall {
  id: string;
  name: string;
  args: unknown;
  extraToolCalls?: number;
  /** Admission-rejection reason from the server; when set the call is NOT executed. */
  admissionError?: string;
}

interface StepResult {
  kind: "tool_call" | "final" | "error";
  toolCall?: StepToolCall;
  text?: string;
  message?: string;
}

export class Conductor {
  private messages: StepMessage[] = [];
  private running = false;
  private currentGeneration = 0;
  private abort: AbortController | null = null;
  private pendingSteer: string[] = [];
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
  private compactFailedOnce = false;

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
    this.pendingSteer.push(trimmed);
  }

  cancel(): void {
    this.currentGeneration++;
    this.sendQueue = [];
    this.pendingSteer = [];
    this.abort?.abort();
    if (!this.running) return;
    this.messages.push({ role: "system", text: "[user cancelled]", tag: "cancel" });
    this.running = false;
    this.emit({ kind: "turn_end", reason: "cancelled" });
  }

  reset(): void {
    this.cancel();
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
    this.pendingSteer = [];
    this.turnImageIds = [];
    this.atlasImageId = null;
    this.turnUsage = { inputTokens: 0, outputTokens: 0 };
    this.turnPeakInput = 0;
    this.turnSteps = 0;
    this.toolCache = new Map();
    this.toolCacheRevision = this.deps.getRevision();
    this.revisionFingerprints = new Map([[this.toolCacheRevision, this.deps.getFingerprint()]]);
    this.auditAtTurnStart = { ...(this.deps.getRevisionAudit?.() ?? {}) };
    this.revisionAtTurnStart = this.toolCacheRevision;
    this.compactFailedOnce = false;
    this.emit({ kind: "turn_start" });

    let userText = text.trim();
    let steps = 0;
    let finished = false;

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

      let applies = 0;
      let patches = 0;
      let edits = 0;
      let layoutReviewNeeded = false;
      const stepsLog: AiLogStep[] = [];

      const mutationBlocked = (name: string): boolean =>
        (name === "canvas_apply" || name === "canvas_patch_widget" || name === "canvas_edit") && layoutReviewNeeded;

      const compactionTrigger = compactionTriggerTokens(getActiveModel() || "");

      while (steps < AGENT_MAX_STEPS_PER_TURN) {
        if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
        this.flushSteer();
        if (estimateTokens(this.serializeMessages()) > compactionTrigger) {
          await this.compactHistory();
          if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
        }
        this.emit({ kind: "step_start", stepNumber: steps + 1 });

        const step = await this.postStep();
        if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
        if (step.kind === "error") {
          this.emit({ kind: "turn_end", reason: "error", error: step.message || "Agent step failed." });
          return;
        }
        if (step.kind === "final") {
          this.messages.push({ role: "assistant", text: step.text || "" });
          stepsLog.push({
            stepNumber: steps + 1,
            text: step.text || "",
            summary: "Finished turn with final message",
          });
          finished = true;
          this.persistConversation();
          break;
        }

        const call = step.toolCall!;
        steps += 1;
        this.emit({ kind: "tool_start", name: call.name, argsSummary: summarizeArgs(call.args) });

        let result: unknown;
        let isError = false;
        if (call.admissionError) {
          // Decision admission: the server rejected this call's arguments before
          // execution. Surface the schema error as feedback so the model retries in-turn.
          isError = true;
          result = {
            code: "DECISION_REJECTED",
            message: `${call.admissionError} The tool was NOT executed. Return one corrected tool call with valid arguments, or a final answer when done.`,
          };
        } else if (mutationBlocked(call.name)) {
          isError = true;
          result = {
            code: "LAYOUT_REVIEW_REQUIRED",
            message:
              "Widgets were just created or moved. Call canvas_snapshot with target=canvas, quality=basic to review the full layout before the next mutation.",
          };
        } else if (call.name === "canvas_apply" && applies >= AGENT_MAX_APPLIES_PER_TURN) {
          result = {
            ok: true,
            code: "APPLY_BUDGET_REACHED",
            message: `Apply budget reached (${AGENT_MAX_APPLIES_PER_TURN}/${AGENT_MAX_APPLIES_PER_TURN}). Keep the best valid result, finish with a final answer, and wait for the user's next message.`,
          };
        } else if (call.name === "canvas_patch_widget" && patches >= AGENT_MAX_PATCHES_PER_TURN) {
          result = {
            ok: true,
            code: "PATCH_BUDGET_REACHED",
            message: `Patch budget reached (${AGENT_MAX_PATCHES_PER_TURN}/${AGENT_MAX_PATCHES_PER_TURN}). Keep the best valid result, finish with a final answer, and wait for the user's next message.`,
          };
        } else if (call.name === "canvas_edit" && edits >= AGENT_MAX_EDITS_PER_TURN) {
          result = {
            ok: true,
            code: "EDIT_BUDGET_REACHED",
            message: `Edit budget reached (${AGENT_MAX_EDITS_PER_TURN}/${AGENT_MAX_EDITS_PER_TURN}). Keep the best valid result, finish with a final answer, and wait for the user's next message.`,
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
          const signature = await toolSignature(call.name, call.args);
          const cached = this.toolCache.get(signature);
          if (cached) {
            // Idempotent replay: identical {name,args} within the turn returns
            // the earlier outcome instead of executing again.
            result = cached.result;
            isError = cached.isError;
          } else {
            try {
              result = await executeTool(call.name, call.args, this.toolDeps());
              if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
              isError = isFailedResult(result);
              this.toolCache.set(signature, { result, isError });
              if (this.toolCache.size > AGENT_TOOL_CACHE_ENTRIES) {
                this.toolCache.delete(this.toolCache.keys().next().value as string);
              }
              if (result && typeof result === "object") {
                const rec = result as Record<string, unknown>;
                if (call.name === "canvas_apply" && rec.ok === true) applies += 1;
                if (call.name === "canvas_patch_widget" && rec.ok === true) patches += 1;
                if (call.name === "canvas_edit" && rec.ok === true) edits += 1;
                // Layout-review gate: after any widget mutation the next mutation
                // waits for a fresh content-covering snapshot at the current revision.
                if (rec.widgetMutated === true) layoutReviewNeeded = true;
                if (
                  call.name === "canvas_snapshot" &&
                  rec.coversContent === true &&
                  rec.revision === this.deps.getRevision()
                ) {
                  layoutReviewNeeded = false;
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
        // Every revision handed to the model gets its content fingerprint
        // recorded, so the next mutation's conflict check can distinguish
        // "the board changed" from "the counter moved".
        this.recordRevisionFingerprint();
        const toolImages = this.imagesForTool(call.name, result);
        stepsLog.push({
          stepNumber: steps,
          tool: call.name,
          args: call.args,
          result,
          isError,
          summary: summarizeResult(result),
          text: step.text || undefined,
        });

        this.messages.push({
          role: "assistant",
          text: step.text || "",
          toolCall: { id: call.id, name: call.name, args: call.args },
        });
        this.messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          result,
          isError,
          images: toolImages,
        });
        // Crash durability: the turn's tool history survives a tab crash mid-run.
        this.persistConversation();
        this.emit({
          kind: "tool_end",
          name: call.name,
          ok: !isError,
          summary: summarizeResult(result),
        });
        if ((call.extraToolCalls ?? 0) > 0) {
          this.messages.push({
            role: "system",
            text: `One tool call per step. ${call.extraToolCalls} extra call(s) were not executed. Continue the task by issuing the next single tool call on the following step.`,
          });
        }
      }

      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      const stepLimitMessage = `Step limit reached (${AGENT_MAX_STEPS_PER_TURN}/${AGENT_MAX_STEPS_PER_TURN}).`;
      if (finished) {
        this.emit({ kind: "turn_end", reason: "done" });
      } else {
        this.emit({ kind: "turn_end", reason: "error", error: stepLimitMessage });
      }

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
        attempts: Math.max(1, steps),
        status: finished ? "success" : "error",
        errorMessage: finished ? undefined : stepLimitMessage,
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
          message: stepsLog.filter((s) => s.text).map((s) => s.text).join("\n\n"),
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

  private persistConversation(): void {
    saveConversation(this.messages, this.deps.canvasId?.(), [...this.loadedPluginIds]);
  }

  private flushSteer(): void {
    if (this.pendingSteer.length === 0) return;
    const text = this.pendingSteer.splice(0).join("\n");
    // Steering changes the canvas context: attach a fresh state digest so the
    // next steps reason over current revision/scene, not the turn-opening view.
    this.messages.push({ role: "user", text: `${text}\n\n${this.hostRefs()}`, images: undefined });
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
    return JSON.stringify({
      revision: this.deps.getRevision(),
      viewport,
      sourceRect: atlasMeta?.sourceRect || viewport,
      imageScale: atlasMeta?.imageScale || 1,
      canvasSize: SIZE,
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

  private serializeMessages(): StepMessage[] {
    const active = this.activeImageIds();
    const pruned = this.pruneOldToolResults(this.messages);
    return pruned.map((m) => {
      if ((m.role === "user" || m.role === "tool") && m.images?.length) {
        const kept: { id: string; dataUrl: string }[] = [];
        const notes: string[] = [];
        for (const img of m.images) {
          if (active.has(img.id)) kept.push(img);
          else {
            const meta = this.images.get(img.id);
            notes.push(`[image expired: ${meta?.note || img.id}]`);
          }
        }
        const extra = notes.join("\n");
        if (m.role === "user") {
          return { ...m, text: extra ? `${m.text}\n${extra}` : m.text, images: kept.length ? kept : undefined };
        }
        return { ...m, images: kept.length ? kept : undefined };
      }
      return m;
    });
  }

  /**
   * Deterministic context pressure relief: tool results AND the assistant
   * tool-call args that produced them get clipped to a head summary once they
   * fall outside the last 8 messages (tool-result pruning, without a second
   * compaction model call).
   *
   * Args matter as much as results here: a canvas_apply that creates a widget
   * carries the widget's whole document, and that message was resent verbatim on
   * every later step of the turn — the single largest repeated payload in a
   * widget-building turn. The widget lives on the board now; the model re-reads
   * it with canvas_read when it needs the source.
   */
  private pruneOldToolResults(messages: StepMessage[]): StepMessage[] {
    const recentFrom = Math.max(0, messages.length - 8);
    return messages.map((m, idx) => {
      if (idx >= recentFrom) return m;
      if (m.role === "assistant") {
        if (!m.toolCall) return m;
        try {
          const json = JSON.stringify(m.toolCall.args ?? null);
          if (json.length <= 2000) return m;
          return {
            ...m,
            toolCall: {
              ...m.toolCall,
              args: {
                code: "PRUNED",
                note: "Full arguments clipped for context budget; the result of this call is authoritative. Use canvas_read for current item source.",
                summary: json.slice(0, 800),
              },
            },
          };
        } catch {
          return { ...m, toolCall: { ...m.toolCall, args: { code: "PRUNED" } } };
        }
      }
      if (m.role !== "tool") return m;
      try {
        const json = JSON.stringify(m.result ?? null);
        if (json.length <= 2000) return m;
        return { ...m, result: { code: "PRUNED", note: "Full result clipped for context budget; re-run the tool if details are needed.", summary: json.slice(0, 800) } };
      } catch {
        return { ...m, result: { code: "PRUNED" } };
      }
    });
  }

  private async compactHistory(): Promise<void> {
    if (this.messages.length <= COMPACT_KEEP) return;
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model) return;
    // One loud failure per turn: keep retrying silently-succeeding compaction
    // but never truncate history behind the user's back.
    if (this.compactFailedOnce) return;
    this.emit({ kind: "compact" });
    const keep = this.messages.slice(-COMPACT_KEEP);
    // Providers require tool results to follow their assistant tool call, and
    // most require the post-system conversation to open with a user turn — so
    // drop any leading orphaned tool/assistant messages after slicing.
    while (keep.length && keep[0].role !== "user" && keep[0].role !== "system") keep.shift();
    const fail = (message: string) => {
      this.compactFailedOnce = true;
      this.emit({ kind: "compact_failed", message });
      // Keep the full history: silent truncation loses context forever; a
      // provider context overflow later in the turn is a loud, honest error.
    };
    try {
      const res = await fetch("/api/canvas/agent/compact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerType: config.type,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          messages: this.serializeMessages(),
        }),
        signal: this.abort?.signal,
      });
      if (!res.ok) {
        let message = `Compaction failed (HTTP ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = `Compaction failed: ${data.error}`;
        } catch {}
        fail(message);
        return;
      }
      const data = (await res.json()) as { summary?: string };
      const summary = (data.summary || "").trim();
      if (!summary) {
        fail("Compaction returned an empty summary; history kept intact.");
        return;
      }
      this.messages = [{ role: "system", text: summary, tag: "compact" }, ...keep];
      this.persistConversation();
    } catch (err) {
      if (this.abort?.signal.aborted) throw err;
      fail(err instanceof Error ? `Compaction failed: ${err.message}` : "Compaction failed.");
    }
  }

  private async postStep(): Promise<StepResult> {
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model) {
      return { kind: "error", message: "Configure an API provider in Settings to use Drawva Agent." };
    }

    const body = {
      providerType: config.type,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      reasoningEffort: getReasoningEffort(),
      messages: this.serializeMessages(),
      loadedPluginIds: [...this.loadedPluginIds],
      webSearch: getWebSearchEnabled(),
      context: {
        revision: this.deps.getRevision(),
        viewport: this.deps.camera.visibleWorldRect(),
        canvasSize: SIZE,
      },
    };

    const attempt = async (): Promise<StepResult> => {
      const res = await fetch("/api/canvas/agent/step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abort?.signal,
      });
      if (!res.ok || !res.body) {
        let message = "Agent step failed.";
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          message = data.error || data.message || message;
        } catch {}
        const err = new Error(message) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return readStepSse(res, (e) => {
        if (e.kind === "usage") {
          this.turnUsage.inputTokens += e.usage.inputTokens;
          this.turnUsage.outputTokens += e.usage.outputTokens;
          this.turnPeakInput = Math.max(this.turnPeakInput, e.usage.inputTokens);
          this.turnSteps += 1;
        }
        this.emit(e);
      });
    };

    try {
      return await attempt();
    } catch (err) {
      if (this.abort?.signal.aborted) throw err;
      if (isRetryableStepError(err)) {
        // Server already retried with backoff; this client retry covers HTTP-level
        // failures. Delay so a rate-limited provider gets breathing room.
        await sleep(1500, this.abort?.signal);
        try {
          return await attempt();
        } catch (retryErr) {
          return { kind: "error", message: retryErr instanceof Error ? retryErr.message : "Agent step failed." };
        }
      }
      return { kind: "error", message: err instanceof Error ? err.message : "Agent step failed." };
    }
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

export function estimateTokens(messages: StepMessage[]): number {
  const stripped = stripImages(messages);
  let images = 0;
  for (const m of messages) {
    if ((m.role === "user" || m.role === "tool") && m.images?.length) images += m.images.length;
  }
  // ponytail: flat ~1100 tokens per image (≈ a 1024×768 vision tile); scale by
  // actual per-image pixels if small models start over/under-compacting.
  return Math.ceil(JSON.stringify(stripped).length / 4) + images * 1100;
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
    const idx = payload.messages.findIndex((m) => m.role !== "system" || m.tag !== "compact");
    if (idx < 0) break;
    payload.messages.splice(idx, 1);
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

function isRetryableStepError(err: unknown): boolean {
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

async function readStepSse(
  res: Response,
  onEvent: (e: ConductorEvent) => void
): Promise<StepResult> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let toolCall: StepToolCall | undefined;
  let errorMessage = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const eventName = /^event: (.+)$/m.exec(block)?.[1] ?? "message";
      const dataLine = /^data: (.+)$/m.exec(block)?.[1] ?? "";
      if (dataLine) {
        let data: unknown = null;
        try {
          data = JSON.parse(dataLine);
        } catch {
          data = null;
        }
        if (data && typeof data === "object") {
          const rec = data as Record<string, unknown>;
          if (eventName === "text_delta" && typeof rec.text === "string") {
            text += rec.text;
            onEvent({ kind: "text_delta", text: rec.text });
          } else if (eventName === "tool_call" && typeof rec.name === "string") {
            toolCall = {
              id: String(rec.id || `call-${Date.now()}`),
              name: rec.name,
              args: rec.args,
              extraToolCalls: typeof rec.extraToolCalls === "number" ? rec.extraToolCalls : 0,
              admissionError: typeof rec.admissionError === "string" ? rec.admissionError : undefined,
            };
          } else if (eventName === "final" && typeof rec.text === "string") {
            text = rec.text || text;
          } else if (eventName === "usage") {
            onEvent({
              kind: "usage",
              usage: {
                inputTokens: Number(rec.inputTokens || 0),
                outputTokens: Number(rec.outputTokens || 0),
              },
            });
          } else if (eventName === "error") {
            errorMessage = String(rec.message || rec.error || "Agent step failed.");
          }
        }
      }
      sep = buffer.indexOf("\n\n");
    }
  }
  if (errorMessage) return { kind: "error", message: errorMessage };
  if (toolCall) return { kind: "tool_call", toolCall, text };
  return { kind: "final", text };
}
