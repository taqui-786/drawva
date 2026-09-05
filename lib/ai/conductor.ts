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
import type { ToolTargetHint } from "@/lib/canvas/agentCharacter";

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
  | { kind: "tool_start"; name: string; argsSummary: string; target?: ToolTargetHint }
  | { kind: "tool_end"; name: string; ok: boolean; summary: string; target?: ToolTargetHint }
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
  getFingerprint: () => string;
  getRevisionAudit?: () => Record<string, number>;
  onEvent: (e: ConductorEvent) => void;
  afterBoardChange: () => void;
  getInkBox?: () => Rect | null;
  getInkIntent?: () => { x: number; y: number } | null;
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
  failStreak: { name: string; count: number };
  stopped: string;
  mutated: boolean;
  createdWidgets: Map<string, string>;
  visualExplainerCreated: boolean;
}

function finiteNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function hintBoxOf(rec: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!rec || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;
  const x = finiteNum(r.x);
  const y = finiteNum(r.y);
  if (x === undefined || y === undefined) return null;
  return { x, y, w: finiteNum(r.w) ?? 0, h: finiteNum(r.h) ?? 0 };
}

export function extractToolTarget(name: string, args: unknown): ToolTargetHint | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  const hint: ToolTargetHint = {};
  const idOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

  const objectId = idOf(a.objectId) ?? idOf(a.targetId);
  if (objectId) hint.objectId = objectId;

  const region = hintBoxOf(a.region);
  if (region) hint.region = region;

  const objectIds: string[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const rows: unknown[] = [
    ...(Array.isArray(a.commands) ? a.commands : []),
    ...(Array.isArray(a.operations) ? a.operations : []),
  ];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const tid = idOf(rec.targetId) ?? idOf(rec.objectId);
    if (tid) objectIds.push(tid);
    const box = hintBoxOf(rec);
    if (box) boxes.push(box);
  }
  const planned = hintBoxOf(a.plannedWidget);
  if (planned) boxes.push(planned);
  const selfBox = hintBoxOf(a);
  if (selfBox && (selfBox.w > 0 || selfBox.h > 0)) boxes.push(selfBox);

  if (objectIds.length) hint.objectIds = objectIds;
  if (boxes.length) hint.boxes = boxes;
  if (hint.objectId === undefined && !hint.objectIds?.length && !hint.region && !hint.boxes?.length) {
    return undefined;
  }
  void name;
  return hint;
}

export function extractToolResultTarget(result: unknown): ToolTargetHint | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const hint: ToolTargetHint = {};
  const objectIds: string[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const pushBox = (v: unknown) => {
    const b = hintBoxOf(v);
    if (b) boxes.push(b);
  };

  if (Array.isArray(r.applied)) {
    for (const row of r.applied as unknown[]) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (typeof rec.objectId === "string" && rec.objectId) objectIds.push(rec.objectId);
      pushBox(rec.box);
    }
  }
  if (Array.isArray(r.operations)) {
    for (const row of r.operations as unknown[]) {
      if (row && typeof row === "object") {
        const oid = (row as Record<string, unknown>).objectId;
        if (typeof oid === "string" && oid) objectIds.push(oid);
      }
    }
  }
  if (typeof r.objectId === "string" && r.objectId) hint.objectId = r.objectId;
  pushBox(r.sourceRect);

  if (objectIds.length) hint.objectIds = objectIds;
  if (boxes.length) hint.boxes = boxes;
  if (hint.objectId === undefined && !hint.objectIds?.length && !hint.boxes?.length) {
    return undefined;
  }
  return hint;
}

function widgetTitleOf(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const rec = args as Record<string, unknown>;
  const direct = typeof rec.title === "string" ? rec.title.trim().toLowerCase() : "";
  if (direct && rec.html !== undefined && !rec.commands) return direct;
  const commands = rec.commands;
  const list = Array.isArray(commands) ? commands : [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (row.targetId) return "";
    const makesWidget = row.html !== undefined || row.source !== undefined;
    const title = typeof row.title === "string" ? row.title.trim().toLowerCase() : "";
    if (makesWidget && title) return title;
  }
  return "";
}

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
  private turnPeakInput = 0;
  private turnSteps = 0;
  private revisionFingerprints = new Map<number, string>();
  private turnRevisions = new Set<number>();
  private auditAtTurnStart: Record<string, number> = {};
  private revisionAtTurnStart = 0;
  private loadedPluginIds = new Set<string>();
  private toolCache = new Map<string, { result: unknown; isError: boolean }>();
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
    this.postCancel(true);
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
    this.messages.push({ role: "user", text: trimmed });
    this.persistConversation();
    this.postSteer(trimmed);
  }

  cancel(dispose = false): void {
    this.currentGeneration++;
    this.sendQueue = [];
    this.abort?.abort();
    this.postCancel(dispose);
    if (!this.running) return;
    this.messages.push({ role: "system", text: "[user cancelled]", tag: "cancel" });
    this.running = false;
    this.emit({ kind: "turn_end", reason: "cancelled" });
  }

  reset(): void {
    this.cancel(true);
    this.turnImageIds = [];
    this.clearHistory();
  }

  private emit(e: ConductorEvent): void {
    this.deps.onEvent(e);
    for (const fn of this.listeners) fn(e);
  }

  private turnRevisionBumps(): { total: number; byCaller: Record<string, number> } {
    const now = this.deps.getRevisionAudit?.() ?? {};
    const byCaller: Record<string, number> = {};
    for (const [caller, count] of Object.entries(now)) {
      const delta = count - (this.auditAtTurnStart[caller] ?? 0);
      if (delta > 0) byCaller[caller] = delta;
    }
    return { total: this.deps.getRevision() - this.revisionAtTurnStart, byCaller };
  }

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
      isTurnRevision: (revision) => {
        if (!this.running) return false;
        if (!this.turnRevisions.has(revision)) return false;
        const current = this.deps.getRevision();
        for (let r = revision; r <= current; r++) {
          if (!this.turnRevisions.has(r)) return false;
        }
        return true;
      },
      afterBoardChange: () => {
        const prevRev = this.deps.getRevision();
        this.deps.afterBoardChange();
        const nextRev = this.deps.getRevision();
        for (let r = prevRev; r <= nextRev; r++) {
          this.turnRevisions.add(r);
        }
      },
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
      getInkIntent: this.deps.getInkIntent,
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
    this.turnRevisions = new Set<number>([this.toolCacheRevision]);
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
        mutated: false,
        createdWidgets: new Map(),
        visualExplainerCreated: false,
      };
      const stepsLog: AiLogStep[] = [];

      const turnResult = await this.postTurn(userText, images, gen, policy, stepsLog);
      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      if (turnResult.kind === "error") {
        this.emit({ kind: "turn_end", reason: "error", error: turnResult.message || "Agent turn failed." });
        return;
      }
      finalText = turnResult.text || "";
      if (finalText.trim() && !policy.mutated) {
        await this.writeAnswerToCanvas(finalText, gen, policy, stepsLog);
        if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      }

      if (!policy.mutated && !finalText.trim()) {
        // Name the actual cause. "Empty response" used to be reported for every
        // no-answer path, including turns where the model emitted thousands of
        // reasoning tokens — which sends users looking for a provider fault that
        // is not there.
        const errorMsg = turnResult.reasoningOnly
          ? "The model finished thinking but never wrote an answer or called a tool. Retry, or pick a model with stronger tool-calling support in Settings."
          : policy.steps > 0
            ? "The model ran tools but never produced a final answer. Retry — the canvas is unchanged."
            : "The AI model returned an empty response with no output. Please try again or switch model in Settings.";
        this.emit({ kind: "turn_end", reason: "error", error: errorMsg });

        const config = this.deps.provider() ?? getProviderConfig();
        const logEntry: AiLogEntry = {
          timestamp: Date.now(),
          requestId: `turn-${Date.now()}`,
          model: getActiveModel() || "unknown",
          providerType: config?.type,
          attempts: Math.max(1, policy.steps),
          status: "error",
          errorMessage: errorMsg,
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
            peakInputTokens: this.turnPeakInput,
            billedSteps: this.turnSteps,
          },
          response: {
            message: "",
            commands: [],
          },
        };
        this.emit({ kind: "log", entry: logEntry });
        void saveAgentLog(redactLogEntry(logEntry));
        return;
      }

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
        if (s.tool === "visual_explainer" && s.args && typeof s.args === "object") {
          commandsList.push({ tool: "visual_explainer", ...(s.args as object) });
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
          peakInputTokens: this.turnPeakInput,
          billedSteps: this.turnSteps,
        },
        response: {
          message: finalText,
          commands: commandsList,
        },
      };
      this.emit({ kind: "log", entry: logEntry });
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
  ): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string; reasoningOnly?: boolean }> {
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model) {
      return { kind: "error", message: "Configure an API provider in Settings to use Drawva Agent." };
    }

    const body = {
      conversation: this.conversationSuffix(),
      connectionId: `${config.type}:${config.baseUrl || "default"}:${model}`,
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

    const attempt = async (): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string; reasoningOnly?: boolean }> => {
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

  private async pumpTurnStream(
    res: Response,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<{ kind: "final" | "cancelled" | "error"; text?: string; message?: string; reasoningOnly?: boolean }> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const sink = { text: "", sawFinal: false, reasoningOnly: false };
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
          if (outcome === "final") return { kind: "final", text: sink.text, reasoningOnly: sink.reasoningOnly };
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
    // The stream ended without a `final` or `error` frame. That is a TRUNCATED
    // turn (serverless timeout, proxy cutting an idle SSE connection, crashed
    // route), not a successful empty answer. Reporting it as `final` was the
    // root cause of "The AI model returned an empty response": the sink is reset
    // on every tool_request, so a cut after the last tool call always produced a
    // successful-looking empty string.
    if (!sink.sawFinal) {
      if (sink.text.trim()) return { kind: "final", text: sink.text };
      return {
        kind: "error",
        message:
          this.turnErrorMessage ||
          "The connection to the agent closed before it finished. Nothing was lost on the canvas — ask again to continue.",
      };
    }
    return { kind: "final", text: sink.text, reasoningOnly: sink.reasoningOnly };
  }

  private async handleTurnFrame(
    block: string,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[],
    sink: { text: string; sawFinal: boolean; reasoningOnly: boolean }
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
      this.emit({ kind: "reasoning_delta", text: rec.text });
    } else if (eventName === "tool_request" && typeof rec.name === "string") {
      // Text streamed before a tool call is a preamble ("let me check the board"),
      // never the answer, so it is dropped rather than concatenated onto the reply.
      sink.text = "";
      const toolCallId = String(rec.toolCallId || `call-${Date.now()}`);
      const answer = await this.answerToolRequest(String(rec.name), rec.args, toolCallId, gen, policy, stepsLog);
      if (gen !== this.currentGeneration || this.abort?.signal.aborted) throw new TurnAborted();
      await this.postToolResult(toolCallId, answer.result, answer.isError);
    } else if (eventName === "tool_end") {
    } else if (eventName === "agent_status") {
    } else if (eventName === "final") {
      sink.sawFinal = true;
      if (typeof rec.text === "string" && rec.text) sink.text = rec.text;
      if (rec.reasoningOnly === true) sink.reasoningOnly = true;
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
        connectionId: `${config.type}:${config.baseUrl || "default"}:${model}`,
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

  private conversationSuffix(): string {
    const raw = this.deps.canvasId?.() || "default";
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw) ? raw : "default";
  }

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

  private async writeAnswerToCanvas(
    text: string,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<void> {
    const ink = this.deps.getInkBox?.() ?? null;
    const view = this.deps.camera.visibleWorldRect();
    const anchor = ink && ink.w > 4 && ink.h > 4 ? ink : null;
    const args = {
      baseRevision: this.deps.getRevision(),
      commands: [
        {
          tool: "write_text",
          text: text.trim().slice(0, 800),
          x: Math.round(anchor ? anchor.x : view.x + view.w * 0.1),
          y: Math.round(anchor ? anchor.y + anchor.h + 60 : view.y + view.h * 0.25),
          maxWidth: Math.round(Math.max(600, Math.min(2000, view.w * 0.5))),
          placement: "below",
        },
      ],
      note: "canvas-only reply",
    };
    try {
      const result = await executeTool("canvas_apply", args, this.toolDeps());
      if (gen !== this.currentGeneration || this.abort?.signal.aborted) return;
      const ok = !isFailedResult(result);
      if (ok) policy.applies += 1;
      stepsLog.push({
        stepNumber: policy.steps + 1,
        tool: "canvas_apply",
        args,
        result,
        isError: !ok,
        summary: ok ? "wrote the reply to the canvas" : summarizeResult(result),
      });
      this.emit({
        kind: "tool_end",
        name: "canvas_apply",
        ok,
        summary: summarizeResult(result),
        target: extractToolResultTarget(result),
      });
    } catch (err) {
      console.warn("[Conductor] canvas-only reply failed:", err);
    }
  }

  private async answerToolRequest(
    name: string,
    args: unknown,
    toolCallId: string,
    gen: number,
    policy: TurnPolicy,
    stepsLog: AiLogStep[]
  ): Promise<{ result: unknown; isError: boolean }> {
    if (policy.stopped) {
      return { result: { ok: true, code: "STOPPED", message: policy.stopped }, isError: false };
    }
    policy.steps += 1;
    this.emit({ kind: "step_start", stepNumber: policy.steps });
    if (policy.steps > AGENT_MAX_STEPS_PER_TURN) {
      policy.stopped = `Step limit reached (${AGENT_MAX_STEPS_PER_TURN}). Tool use is closed for this turn: keep the best valid result and reply with a final answer now.`;
      return { result: { ok: true, code: "STEP_LIMIT_REACHED", message: policy.stopped }, isError: false };
    }
    this.emit({ kind: "tool_start", name, argsSummary: summarizeArgs(args), target: extractToolTarget(name, args) });

    let result: unknown;
    let isError = false;
    const budget: Record<string, { used: number; cap: number }> = {
      canvas_apply: { used: policy.applies, cap: AGENT_MAX_APPLIES_PER_TURN },
      visual_explainer: { used: policy.applies, cap: AGENT_MAX_APPLIES_PER_TURN },
      canvas_patch_widget: { used: policy.patches, cap: AGENT_MAX_PATCHES_PER_TURN },
      canvas_edit: { used: policy.edits, cap: AGENT_MAX_EDITS_PER_TURN },
      canvas_snapshot: { used: policy.snapshots, cap: AGENT_MAX_SNAPSHOTS_PER_TURN },
    };
    const spent = budget[name];
    const duplicateTitle = name === "canvas_apply" || name === "visual_explainer" ? widgetTitleOf(args) : "";
    const alreadyMade = duplicateTitle ? policy.createdWidgets.get(duplicateTitle) : undefined;
    if (name === "visual_explainer" && policy.visualExplainerCreated) {
          isError = true;
          result = {
            code: "VISUAL_EXPLAINER_SINGLE_WIDGET_LIMIT",
            message:
              "This turn already created a Visual Explainer. Review or canvas_patch_widget that widget — do not create another.",
          };
        } else if ((name === "canvas_patch_widget" || name === "canvas_edit") && policy.layoutReviewNeeded) {
          isError = true;
          result = {
            code: "LAYOUT_REVIEW_REQUIRED",
            message:
              "Widgets were just created or moved. Call canvas_snapshot with target=canvas, quality=basic to review the full layout before the next mutation.",
          };
        } else if (alreadyMade) {
          isError = true;
          result = {
            code: "DUPLICATE_WIDGET",
            message: `A widget titled "${duplicateTitle}" was already created this turn as ${alreadyMade}. Refine that one with canvas_patch_widget or canvas_edit, or finish — do not create a second copy.`,
            objectId: alreadyMade,
          };
        } else if (spent && spent.used >= spent.cap) {
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
          const revisionNow = this.deps.getRevision();
          if (revisionNow !== this.toolCacheRevision) {
            this.toolCache.clear();
            this.toolCacheRevision = revisionNow;
          }
          const signature = await toolSignature(name, args);
          const cached = this.toolCache.get(signature);
          if (cached) {
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
                if (rec.ok === true && (name === "canvas_apply" || name === "visual_explainer" || name === "canvas_patch_widget" || name === "canvas_edit" || name === "canvas_undo")) {
                  policy.mutated = true;
                }
                if ((name === "canvas_apply" || name === "visual_explainer") && rec.ok === true) {
                  policy.applies += 1;
                  if (name === "visual_explainer") policy.visualExplainerCreated = true;
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
        this.persistConversation();
        this.emit({
          kind: "tool_end",
          name,
          ok: !isError,
          summary: summarizeResult(result),
          target: extractToolResultTarget(result),
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
      maxWidgetSize: widgetMax,
      selectedIds: selected,
      newestInkBox: ink,
      scene,
    });
  }

  private activeImageIds(): Set<string> {
    const ids = new Set<string>(this.turnImageIds);
    if (this.latestSnapshotId) ids.add(this.latestSnapshotId);
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
