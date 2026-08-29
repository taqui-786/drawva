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
  getEnabledPlugins,
  getProviderConfig,
  getReasoningEffort,
  type ProviderConfig,
} from "@/lib/ai/provider";
import { buildAtlas } from "@/lib/canvas/atlas";
import { buildScene } from "@/lib/canvas/scene";
import { SIZE } from "@/lib/canvas/constants";
import {
  AGENT_CONVERSATION_MAX_BYTES,
  AGENT_HISTORY_TOKEN_TRIGGER,
  AGENT_MAX_APPLIES_PER_TURN,
  AGENT_MAX_PATCHES_PER_TURN,
  AGENT_MAX_STEPS_PER_TURN,
  AGENT_MAX_TURN_IMAGES,
  AGENT_SCENE_JSON_MAX,
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
  onEvent: (e: ConductorEvent) => void;
  enabledPluginIds: () => string[];
  afterBoardChange: () => void;
  getInkBox?: () => Rect | null;
  canvasId?: () => string | undefined;
}

interface StepToolCall {
  id: string;
  name: string;
  args: unknown;
  extraToolCalls?: number;
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
  private listeners = new Set<(e: ConductorEvent) => void>();
  private turnUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(private deps: ConductorDeps) {
    this.messages = loadConversation(this.deps.canvasId?.());
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
    clearConversation(this.deps.canvasId?.());
  }

  private emit(e: ConductorEvent): void {
    this.deps.onEvent(e);
    for (const fn of this.listeners) fn(e);
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
      afterBoardChange: this.deps.afterBoardChange,
      enabledPluginIds: this.deps.enabledPluginIds,
      registerImage: (img) => {
        this.images.set(img.id, img);
        this.latestSnapshotId = img.id;
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
    this.turnUsage = { inputTokens: 0, outputTokens: 0 };
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
          }
        } catch (err) {
          console.warn("[Conductor] Failed to capture canvas snapshot:", err);
        }
      }

      const host = this.hostRefs(atlasMeta);
      userText = [text.trim(), host].filter(Boolean).join("\n\n");
      this.messages.push({ role: "user", text: userText, images: images.length ? images : undefined });

      let applies = 0;
      let patches = 0;
      const stepsLog: AiLogStep[] = [];

      while (steps < AGENT_MAX_STEPS_PER_TURN) {
        if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
        this.flushSteer();
        if (estimateTokens(this.messages) > AGENT_HISTORY_TOKEN_TRIGGER) {
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
          break;
        }

        const call = step.toolCall!;
        steps += 1;
        this.emit({ kind: "tool_start", name: call.name, argsSummary: summarizeArgs(call.args) });

        let result: unknown;
        let isError = false;
        if (call.name === "canvas_apply" && applies >= AGENT_MAX_APPLIES_PER_TURN) {
          result = {
            code: "LIMIT_EXCEEDED",
            message: "Apply budget reached; finish or undo.",
          };
          isError = true;
        } else if (call.name === "canvas_patch_widget" && patches >= AGENT_MAX_PATCHES_PER_TURN) {
          result = {
            code: "LIMIT_EXCEEDED",
            message: "Patch budget reached; finish or undo.",
          };
          isError = true;
        } else {
          try {
            result = await executeTool(call.name, call.args, this.toolDeps());
            if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
            if (call.name === "canvas_apply" && result && typeof result === "object" && (result as { ok?: boolean }).ok) {
              applies += 1;
            }
            if (call.name === "canvas_patch_widget" && result && typeof result === "object" && (result as { ok?: boolean }).ok) {
              patches += 1;
            }
          } catch (err) {
            isError = true;
            result = {
              code: "INTERNAL",
              message: err instanceof Error ? err.message : "Tool failed.",
            };
          }
        }

        isError = isError || isFailedResult(result);
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
        this.emit({
          kind: "tool_end",
          name: call.name,
          ok: !isError,
          summary: summarizeResult(result),
        });
        if ((call.extraToolCalls ?? 0) > 0) {
          this.messages.push({
            role: "system",
            text: `One tool call per step. ${call.extraToolCalls} extra call(s) were not executed.`,
          });
        }
      }

      if (gen !== this.currentGeneration || this.abort.signal.aborted) return;
      if (finished) {
        this.emit({ kind: "turn_end", reason: "done" });
      } else {
        this.emit({ kind: "turn_end", reason: "error", error: "Step limit reached (24/24)." });
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
        errorMessage: finished ? undefined : "Step limit reached (24/24).",
        atlasImage: this.images.get(this.latestSnapshotId || "")?.dataUrl || "",
        systemPrompt: AGENT_SYSTEM_PROMPT,
        userPromptText: userText,
        steps: stepsLog,
        tokenUsage: {
          inputTokens: this.turnUsage.inputTokens,
          outputTokens: this.turnUsage.outputTokens,
          totalTokens: this.turnUsage.inputTokens + this.turnUsage.outputTokens,
        },
        response: {
          message: stepsLog.filter((s) => s.text).map((s) => s.text).join("\n\n"),
          commands: commandsList,
        },
      };
      this.emit({ kind: "log", entry: logEntry });
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
          saveConversation(this.messages, this.deps.canvasId?.());
          this.pruneImages();
        }
      }
    }
  }

  private flushSteer(): void {
    if (this.pendingSteer.length === 0) return;
    const text = this.pendingSteer.splice(0).join("\n");
    this.messages.push({ role: "user", text, images: undefined });
  }

  private hostRefs(atlasMeta?: { sourceRect: Rect; imageScale: number; changedBox?: Rect }): string {
    const selected = [
      this.deps.widgets.getSelectedId(),
      this.deps.objects.getSelectedId(),
    ].filter((id): id is string => Boolean(id));
    const viewport = this.deps.camera.visibleWorldRect();
    const ink = atlasMeta?.changedBox || (this.deps.getInkBox?.() ?? null);
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
    return this.messages.map((m) => {
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

  private async compactHistory(): Promise<void> {
    if (this.messages.length <= 12) return;
    const config = this.deps.provider() ?? getProviderConfig();
    const model = getActiveModel();
    if (!config || !model || config.type === "codex" || config.type === "antigravity") return;
    this.emit({ kind: "compact" });
    const keep = this.messages.slice(-12);
    // Providers require tool results to follow their assistant tool call, and
    // most require the post-system conversation to open with a user turn — so
    // drop any leading orphaned tool/assistant messages after slicing.
    while (keep.length && keep[0].role !== "user" && keep[0].role !== "system") keep.shift();
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
        this.messages = keep;
        saveConversation(this.messages, this.deps.canvasId?.());
        return;
      }
      const data = (await res.json()) as { summary?: string };
      const summary = (data.summary || "").trim();
      if (!summary) {
        this.messages = keep;
        saveConversation(this.messages, this.deps.canvasId?.());
        return;
      }
      this.messages = [{ role: "system", text: summary, tag: "compact" }, ...keep];
      saveConversation(this.messages, this.deps.canvasId?.());
    } catch {
      this.messages = keep;
      saveConversation(this.messages, this.deps.canvasId?.());
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
      enabledPluginIds: this.deps.enabledPluginIds().length ? this.deps.enabledPluginIds() : getEnabledPlugins(),
      messages: this.serializeMessages(),
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
        }
        this.emit(e);
      });
    };

    try {
      return await attempt();
    } catch (err) {
      if (this.abort?.signal.aborted) throw err;
      if (isRetryableStepError(err)) {
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

export function estimateTokens(messages: StepMessage[]): number {
  const stripped = stripImages(messages);
  return Math.ceil(JSON.stringify(stripped).length / 4);
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

function loadConversation(canvasId?: string): StepMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getConversationKey(canvasId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: StepMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function saveConversation(messages: StepMessage[], canvasId?: string): void {
  if (typeof window === "undefined") return;
  const key = getConversationKey(canvasId);
  const stripped = stripImages(messages);
  let payload = { messages: stripped, createdAt: Date.now(), updatedAt: Date.now() };
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
