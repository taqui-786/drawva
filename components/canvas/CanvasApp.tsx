"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSnapshot } from "valtio";
import {
  appState,
  setAiStatus,
  setAutoOn,
  setCenter,
  setColor,
  setCursor,
  setGeometry,
  setMode,
  setPen,
  setZoom,
  type GeometryInfo,
} from "@/lib/state";
import { useCanvas } from "./CanvasProvider";
import { ToolManager, type ToolGestureEvent } from "@/lib/canvas/toolManager";
import { DraftManager } from "@/lib/canvas/draftStore";
import { rasterizeText, renderTextBlock } from "@/lib/canvas/textTool";
import { placeImageAt } from "@/lib/canvas/images";
import { CanvasHeader, type AiRunState } from "./CanvasHeader";
import { SettingsDialog } from "./SettingsDialog";
import { LogsDialog } from "./LogsDialog";
import { CanvasFooter } from "./CanvasFooter";
import { WidgetManager, type WidgetItem, extractHtmlDimensions } from "@/lib/canvas/widgets";
import { ObjectManager, type ObjectItem } from "@/lib/canvas/objects";
import { diagramDocument, copyLabel, detectDiagramFormat, normalizeFormat, estimateDiagramDimensions } from "@/lib/canvas/diagram";
import { renderFormula, bakeFormula } from "@/lib/canvas/formulas";
import { bakePlot, plotCommand } from "@/lib/canvas/plotter";
import { buildAtlas, buildFocusInset } from "@/lib/canvas/atlas";
import { unionRect } from "@/lib/canvas/engine";
import { buildScene } from "@/lib/canvas/scene";
import { SIZE as CANVAS_SIZE } from "@/lib/canvas/constants";
import { serializeSnapshot, restoreSnapshot, saveAutosave, loadAutosave, exportPng, exportJson, importJson, renderObject } from "@/lib/canvas/persistence";
import { BoardHistory } from "@/lib/canvas/history";
import type { AiReply, AiRequest, AgentEvent, AiLogEntry } from "@/lib/ai/types";
import type { CanvasCommand, PlotFunctionCommand } from "@/lib/canvas/commands";
import type { Point, Rect } from "@/lib/canvas/types";
import { getActiveModel, getCachedModels, getProviderConfig, setActiveModel, addTokenUsageRecord } from "@/lib/ai/provider";
import { Textarea } from "@/components/ui/textarea";
import { SyncManager, type SyncStatus } from "@/lib/canvas/sync";
import { ConnectDialog } from "./ConnectDialog";
import { strokeSegment } from "@/lib/canvas/strokes";

function parseCleanErrorMessage(raw: string): string {
  if (!raw) return "AI request failed";
  let clean = raw.trim();

  const jsonBraceIndex = clean.indexOf("{");
  if (jsonBraceIndex >= 0) {
    try {
      const jsonStr = clean.slice(jsonBraceIndex);
      const parsed = JSON.parse(jsonStr) as { error?: { message?: string } | string; message?: string };
      if (typeof parsed.error === "object" && parsed.error?.message) {
        return parsed.error.message;
      }
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {}
  }

  clean = clean.replace(/^\d{3}\s*/, "");
  return clean || "AI request failed";
}

function distanceBetweenRects(a: Rect, b: { x: number; y: number; w: number; h: number }): number {
  const dx = a.x + a.w < b.x ? b.x - (a.x + a.w) : a.x > b.x + b.w ? a.x - (b.x + b.w) : 0;
  const dy = a.y + a.h < b.y ? b.y - (a.y + a.h) : a.y > b.y + b.h ? a.y - (b.y + b.h) : 0;
  return Math.hypot(dx, dy);
}

function isSameGeometry(a: GeometryInfo | null, b: GeometryInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    a.id === b.id &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.label === b.label &&
    a.title === b.title &&
    a.kind === b.kind &&
    a.contentW === b.contentW &&
    a.contentH === b.contentH &&
    a.status === b.status &&
    a.isMarquee === b.isMarquee &&
    a.isMoving === b.isMoving
  );
}

async function readSse(
  res: Response,
  onEvent: (e: AgentEvent) => void
): Promise<AiReply & { rejected?: string[] }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: (AiReply & { rejected?: string[] }) | null = null;
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
        let data: unknown;
        try {
          data = JSON.parse(dataLine);
        } catch {
          data = null;
        }
        if (data) {
          if (eventName === "event") onEvent(data as AgentEvent);
          else if (eventName === "result") result = data as AiReply & { rejected?: string[] };
          else if (eventName === "error") {
            const errData = data as { error?: string; detail?: string };
            const rawErr = errData.detail || errData.error || "AI request failed";
            throw new Error(parseCleanErrorMessage(rawErr));
          }
        }
      }
      sep = buffer.indexOf("\n\n");
    }
  }
  if (!result) throw new Error("AI stream ended without a result");
  return result;
}

export function CanvasApp() {
  const { engine, mountRef } = useCanvas();
  const { mode, color, pen, aiStatus, autoOn } = useSnapshot(appState);
  const eraser = 18;

  const tools = useRef<ToolManager | null>(null);
  const drafts = useRef<DraftManager | null>(null);
  const widgets = useRef<WidgetManager | null>(null);
  const objects = useRef<ObjectManager | null>(null);
  const history = useRef<BoardHistory | null>(null);
  const widgetDrag = useRef<{ id: string; last: { x: number; y: number } } | null>(null);
  const widgetResize = useRef<{ id: string; last: { x: number; y: number } } | null>(null);
  const objectDrag = useRef<{ id: string; last: { x: number; y: number } } | null>(null);
  const objectResize = useRef<{ id: string; last: { x: number; y: number } } | null>(null);
  const syncManager = useRef<SyncManager | null>(null);
  const [syncState, setSyncState] = useState<{
    status: SyncStatus;
    roomCode: string | null;
    peerCount: number;
    error?: string;
  }>({
    status: "idle",
    roomCode: null,
    peerCount: 0,
  });
  const [connectOpen, setConnectOpen] = useState(false);

  const lastMoveSyncRef = useRef<Record<string, number>>({});
  function broadcastMove(kind: "widget" | "object", packet: Extract<import("@/lib/canvas/sync").SyncPacket, { id: string }>): void {
    const key = `${kind}:${packet.id}`;
    const now = performance.now();
    if (now - (lastMoveSyncRef.current[key] ?? 0) < 40) return;
    lastMoveSyncRef.current[key] = now;
    syncManager.current?.broadcast(packet);
  }

  const addObject = useCallback((item: ObjectItem): void => {
    objects.current?.add(item);
    const { image, ...cleanObject } = item;
    void image;
    syncManager.current?.broadcast({ type: "SYNC_OBJECT_ADD", object: cleanObject });
  }, []);

  function bakePlotObject(cmd: PlotFunctionCommand): HTMLCanvasElement {
    return plotCommand(cmd);
  }

  async function mergeObjectToInk(id: string): Promise<void> {
    const om = objects.current;
    const eng = engine;
    const item = om?.get(id);
    if (!om || !eng || !item) return;
    history.current?.recordObjects();
    if (item.kind === "text") {
      rasterizeText(eng, item.source, { x: item.x, y: item.y }, { color: item.color, fontSize: item.fontSize, maxWidth: item.maxWidth ?? item.w });
    } else if (item.kind === "formula") {
      const r = await renderFormula(item.source, item.fontSize, item.color);
      if (r.canvas.width > 0) bakeFormula(eng, item.x, item.y, r);
    } else if (item.kind === "plot") {
      bakePlot(eng, { tool: "plot_function", x: item.x, y: item.y, w: item.w, h: item.h, expression: item.source, color: item.color });
    }
    om.remove(id);
    syncManager.current?.broadcast({ type: "SYNC_OBJECT_MERGE", id });
    afterBoardChangeRef.current();
  }

  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const aiSeq = useRef(0);
  const aiRevision = useRef(0);
  const inkBoxRef = useRef<Rect | null>(null);
  const drawingRef = useRef<Rect | null>(null);
  const lastStrokeTimeRef = useRef<number>(0);
  const refineFocusRef = useRef<{ rect: Rect; widgetId: string } | null>(null);
  const activeEditTargetRef = useRef<string | null>(null);

  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{
    startCenter: Point;
    startDistance: number;
    startScale: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const gestureOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = gestureOverlayRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const [models, setModels] = useState<string[]>([]);
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [latestLog, setLatestLog] = useState<AiLogEntry | null>(null);

  useEffect(() => {
    const refresh = () => {
      setModels(getCachedModels());
      setActiveModelState(getActiveModel());
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const handleModelChange = (model: string | null) => {
    setActiveModel(model);
    setActiveModelState(model);
  };

  const [aiRun, setAiRun] = useState<AiRunState>({
    phase: "idle",
    activeProvider: null,
    doneProvider: null,
  });

  const handleAiEvent = (ev: AgentEvent) => {
    setAiRun((prev) => {
      switch (ev.type) {
        case "provider_start":
          return { ...prev, phase: "running", activeProvider: ev.provider };
        case "provider_failed":
          return { ...prev, activeProvider: null };
        case "provider_done":
          return { ...prev, activeProvider: null, doneProvider: ev.provider };
        default:
          return prev;
      }
    });
  };

  const fireAi = useCallback(async (box: Rect, userPrompt?: string) => {
    const engineAtCall = engine;
    const wm = widgets.current;
    const draft = drafts.current;
    if (!engineAtCall || !draft) return;

    const config = getProviderConfig();
    const model = getActiveModel() || models[0] || null;
    if (!config) {
      toast("Set up an AI provider", {
        description: "Connect your provider to use Ask AI or Auto AI.",
        action: {
          label: "Open settings",
          onClick: () => setSettingsOpen(true),
        },
      });
      return;
    }
    if (!model) {
      toast("Select a model", {
        description: "Pick one of the models fetched from your provider.",
        action: {
          label: "Open settings",
          onClick: () => setSettingsOpen(true),
        },
      });
      return;
    }

    setAiStatus("thinking");
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    const requestId = ++aiSeq.current;
    const revision = aiRevision.current;

    const viewport = engineAtCall.camera.visibleWorldRect();
    const atlas = await buildAtlas(engineAtCall, viewport, box, wm, objects.current);
    const scene = buildScene(wm, objects.current);

    let widgetEditTarget: import("@/lib/ai/types").WidgetEditContext | undefined = undefined;
    if (refineFocusRef.current && wm) {
      const targetItem = wm.get(refineFocusRef.current.widgetId);
      if (targetItem) {
        const detectedFormat = targetItem.kind === "diagram"
          ? (targetItem.sourceFormat
              ? (normalizeFormat(targetItem.sourceFormat) || targetItem.sourceFormat)
              : detectDiagramFormat(targetItem.pluginId, targetItem.copyText, targetItem.title))
          : undefined;
        widgetEditTarget = {
          id: targetItem.id,
          pluginId: detectedFormat || targetItem.pluginId || (targetItem.kind === "diagram" ? "diagram" : "general"),
          widgetType: targetItem.kind === "diagram" ? "diagram_source" : "html_widget",
          title: targetItem.title,
          sourceFormat: detectedFormat,
          source: targetItem.copyText,
          html: targetItem.html,
          box: { x: targetItem.x, y: targetItem.y, w: targetItem.w, h: targetItem.h },
        };
      }
    } else if (wm && box.w > 0 && box.h > 0 && box.w < 6000 && box.h < 6000) {
      let closestWidget: WidgetItem | null = null;
      let minDistance = Infinity;
      const allWidgets = wm.all();
      for (const w of allWidgets) {
        const dist = distanceBetweenRects(box, { x: w.x, y: w.y, w: w.w, h: w.h });
        if (dist <= 120 && dist < minDistance) {
          minDistance = dist;
          closestWidget = w;
        }
      }
      if (closestWidget) {
        const detectedFormat = closestWidget.kind === "diagram"
          ? (closestWidget.sourceFormat
              ? (normalizeFormat(closestWidget.sourceFormat) || closestWidget.sourceFormat)
              : detectDiagramFormat(closestWidget.pluginId, closestWidget.copyText, closestWidget.title))
          : undefined;
        widgetEditTarget = {
          id: closestWidget.id,
          pluginId: detectedFormat || closestWidget.pluginId || (closestWidget.kind === "diagram" ? "diagram" : "general"),
          widgetType: closestWidget.kind === "diagram" ? "diagram_source" : "html_widget",
          title: closestWidget.title,
          sourceFormat: detectedFormat,
          source: closestWidget.copyText,
          html: closestWidget.html,
          box: { x: closestWidget.x, y: closestWidget.y, w: closestWidget.w, h: closestWidget.h },
        };
      }
    }

    activeEditTargetRef.current = widgetEditTarget?.id ?? null;

    let effectiveBox = { ...box };
    const boxMargin = 20;
    if (objects.current && box.w > 0 && box.h > 0) {
      for (const o of objects.current.all()) {
        const isNear =
          box.x < o.x + o.w + boxMargin &&
          box.x + box.w > o.x - boxMargin &&
          box.y < o.y + o.h + boxMargin &&
          box.y + box.h > o.y - boxMargin;
        if (isNear) {
          effectiveBox = unionRect(effectiveBox, { x: o.x, y: o.y, w: o.w, h: o.h });
        }
      }
    }

    const focusInset = await buildFocusInset(engineAtCall, effectiveBox, wm, objects.current);

    const reqTimestamp = Date.now();
    const payload: AiRequest = {
      requestId: `req-${requestId}`,
      atlasImage: atlas.atlasImage,
      focusInset,
      visibleRect: viewport,
      captureRect: viewport,
      sourceRect: atlas.sourceRect,
      changedBox: effectiveBox,
      imageSize: atlas.imageSize,
      userPrompt,
      scene: JSON.stringify(scene),
      trigger: userPrompt ? "manual" : "user_paused",
      ...(widgetEditTarget ? { widgetEdit: widgetEditTarget } : {}),
      providerType: config.type,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
    };

    const applyReply = async (data: AiReply & { rejected?: string[] }) => {
      if (data.tokenUsage) {
        addTokenUsageRecord({
          providerType: config.type || "custom",
          modelId: model,
          inputTokens: data.tokenUsage.inputTokens,
          outputTokens: data.tokenUsage.outputTokens,
          totalTokens: data.tokenUsage.totalTokens,
          intent: data.intent,
        });
      }

      const logEntry: AiLogEntry = {
        timestamp: reqTimestamp,
        requestId: payload.requestId,
        model: payload.model || "Unknown",
        providerType: payload.providerType,
        attempts: data.attempts || 1,
        status: "success",
        atlasImage: payload.atlasImage,
        focusInset: payload.focusInset,
        systemPrompt: data.debug?.systemPrompt || "",
        userPromptText: data.debug?.userPromptText || "",
        userPromptRaw: payload.userPrompt,
        sceneJson: payload.scene,
        tokenUsage: data.tokenUsage,
        response: {
          intent: data.intent,
          message: data.message,
          observedText: data.observedText,
          commands: data.commands,
          rejected: data.rejected,
          raw: data.debug?.rawResponse || data,
        },
      };
      setLatestLog(logEntry);

      if (Array.isArray(data.commands) && data.commands.length) {
        history.current?.recordObjects();
        history.current?.recordWidgets();
        draft.setPending(data.commands as CanvasCommand[]);
        await draft.accept(engineAtCall);
        afterBoardChange();
      }
      setAiStatus("done");
      setAiRun((prev) => ({
        phase: "done",
        activeProvider: null,
        doneProvider: prev.doneProvider,
      }));
    };

    setAiStatus("thinking");
    setAiRun({ phase: "running", activeProvider: null, doneProvider: null });

    try {
      const res = await fetch("/api/canvas/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });
      const isStream = (res.headers.get("content-type") ?? "").includes("text/event-stream");
      if (!res.ok || !res.body) {
        let msg = "AI request failed";
        try {
          const d = await res.json();
          msg = d.detail || d.error || msg;
        } catch {}
        throw new Error(parseCleanErrorMessage(msg));
      }
      if (requestId !== aiSeq.current) return;
      if (aiRevision.current !== revision) return;
      if (isStream) {
        await applyReply(await readSse(res, handleAiEvent));
      } else {
        const data = (await res.json()) as AiReply & { rejected?: string[] };
        await applyReply(data);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setAiStatus("error");
      setAiRun((prev) => ({ ...prev, phase: "error" }));
      const desc = err instanceof Error ? parseCleanErrorMessage(err.message) : "AI request failed";

      const logEntry: AiLogEntry = {
        timestamp: reqTimestamp,
        requestId: payload.requestId,
        model: payload.model || "Unknown",
        providerType: payload.providerType,
        attempts: 3,
        status: "error",
        errorMessage: desc,
        atlasImage: payload.atlasImage,
        focusInset: payload.focusInset,
        systemPrompt: "",
        userPromptText: payload.userPrompt || "",
        userPromptRaw: payload.userPrompt,
        sceneJson: payload.scene,
      };
      setLatestLog(logEntry);

      toast.error("Generation failed after 3 attempts", {
        description: desc,
      });
      console.error("AI request failed:", err);
    } finally {
      if (aiAbort.current === controller) aiAbort.current = null;
      refineFocusRef.current = null;
    }
  }, [engine, models]);

  function scheduleAi(box: Rect, userPrompt?: string) {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      aiTimer.current = null;
      void fireAi(box, userPrompt);
    }, 1200);
  }

  function askAi() {
    const selected = objects.current?.getSelectedGeometry() || widgets.current?.getSelectedGeometry();
    let box = selected
      ? { x: selected.x, y: selected.y, w: selected.w, h: selected.h }
      : inkBoxRef.current;
    if ((!box || box.w <= 0 || box.h <= 0) && engine) {
      const view = engine.camera.visibleWorldRect();
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      let best: { x: number; y: number; w: number; h: number } | null = null;
      let bestD = Infinity;
      for (const o of objects.current?.all() ?? []) {
        if (o.x + o.w < view.x || o.x > view.x + view.w || o.y + o.h < view.y || o.y > view.y + view.h) continue;
        const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best) box = { x: best.x, y: best.y, w: best.w, h: best.h };
    }
    if (!box || box.w <= 0 || box.h <= 0) {
      const visible = engine?.camera.visibleWorldRect();
      if (visible && engine) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        engine.tiles.forTiles(visible, (_canvas, tx, ty) => {
          minX = Math.min(minX, tx * 512);
          minY = Math.min(minY, ty * 512);
          maxX = Math.max(maxX, (tx + 1) * 512);
          maxY = Math.max(maxY, (ty + 1) * 512);
        }, false);
        if (minX !== Infinity && maxX > minX && maxY > minY) {
          box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        } else {
          const center = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
          box = { x: Math.round(center.x - 300), y: Math.round(center.y - 200), w: 600, h: 400 };
        }
      } else {
        box = { x: 0, y: 0, w: 600, h: 400 };
      }
    }
    void fireAi(box, undefined);
  }

  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const [canUndoState, setCanUndo] = useState(false);
  const [canRedoState, setCanRedo] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function syncHistoryButtons() {
    const h = history.current;
    setCanUndo(!!h && h.canUndo);
    setCanRedo(!!h && h.canRedo);
  }

  const syncGeometry = useCallback(() => {
    const tm = tools.current;
    let geom: GeometryInfo | null = null;

    if (tm) {
      const activeShape = tm.shapes.getLiveGeometry();
      if (activeShape) {
        geom = {
          type: "shape",
          label: `Shape (${activeShape.kind})`,
          kind: activeShape.kind,
          x: Math.round(activeShape.x),
          y: Math.round(activeShape.y),
          w: Math.round(activeShape.w),
          h: Math.round(activeShape.h),
        };
      } else {
        const activeSel = tm.selection.getGeometry();
        if (activeSel) {
          geom = {
            type: "selection",
            label: activeSel.isMarquee ? "Marquee Selection" : activeSel.isMoving ? "Moving Selection" : "Ink Selection",
            isMarquee: activeSel.isMarquee,
            isMoving: activeSel.isMoving,
            x: Math.round(activeSel.x),
            y: Math.round(activeSel.y),
            w: Math.round(activeSel.w),
            h: Math.round(activeSel.h),
          };
        }
      }
    }

    if (!geom && drawingRef.current && (drawingRef.current.w > 0 || drawingRef.current.h > 0)) {
      const d = drawingRef.current;
      geom = {
        type: "stroke",
        label: `Drawing (${appState.mode})`,
        x: Math.round(d.x),
        y: Math.round(d.y),
        w: Math.round(d.w),
        h: Math.round(d.h),
      };
    }

    if (!geom && widgets.current) {
      const wGeom = widgets.current.getSelectedGeometry();
      if (wGeom) {
        geom = {
          type: "widget",
          id: wGeom.id,
          label: `Widget (${wGeom.pluginId || wGeom.kind})`,
          title: wGeom.title,
          kind: wGeom.kind,
          status: wGeom.status,
          x: Math.round(wGeom.x),
          y: Math.round(wGeom.y),
          w: Math.round(wGeom.w),
          h: Math.round(wGeom.h),
          contentW: Math.round(wGeom.contentW),
          contentH: Math.round(wGeom.contentH),
        };
      }
    }

    if (!geom && objects.current) {
      const oGeom = objects.current.getSelectedGeometry();
      if (oGeom) {
        geom = {
          type: "object",
          id: oGeom.id,
          label: `Object (${oGeom.kind})`,
          kind: oGeom.kind,
          status: oGeom.status,
          x: Math.round(oGeom.x),
          y: Math.round(oGeom.y),
          w: Math.round(oGeom.w),
          h: Math.round(oGeom.h),
          contentW: Math.round(oGeom.contentW),
          contentH: Math.round(oGeom.contentH),
        };
      }
    }

    if (!isSameGeometry(appState.geometry, geom)) {
      setGeometry(geom);
    }
  }, []);

  const syncGeometryRef = useRef(syncGeometry);
  useEffect(() => {
    syncGeometryRef.current = syncGeometry;
  });

  function afterBoardChange() {
    history.current?.commit();
    syncHistoryButtons();
    syncGeometryRef.current();
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      const eng = engine;
      if (eng) void saveAutosave(serializeSnapshot(eng, widgets.current, objects.current));
    }, 800);
  }
  const afterBoardChangeRef = useRef(afterBoardChange);
  useEffect(() => {
    afterBoardChangeRef.current = afterBoardChange;
  });

  async function undo() {
    const tm = tools.current;
    if (tm) tm.clearSelection();
    const h = history.current;
    if (!h || !h.canUndo) return;
    await h.undo();
    syncHistoryButtons();
    if (engine && syncManager.current) {
      const snapshot = serializeSnapshot(engine, widgets.current, objects.current);
      syncManager.current.broadcast({ type: "SYNC_INIT_STATE", snapshot });
    }
  }

  async function redo() {
    const tm = tools.current;
    if (tm) tm.clearSelection();
    const h = history.current;
    if (!h || !h.canRedo) return;
    await h.redo();
    syncHistoryButtons();
    if (engine && syncManager.current) {
      const snapshot = serializeSnapshot(engine, widgets.current, objects.current);
      syncManager.current.broadcast({ type: "SYNC_INIT_STATE", snapshot });
    }
  }

  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });

  function clearBoard() {
    if (!engine) return;
    history.current?.captureWholeBoard();
    engine.tiles.clear();
    engine.requestRender();
    widgets.current?.clear();
    objects.current?.clear();
    inkBoxRef.current = null;
    aiRevision.current++;
    syncManager.current?.broadcast({ type: "SYNC_CLEAR" });
    afterBoardChange();
  }

  function doExportPng() {
    if (engine) void exportPng(engine, widgets.current, objects.current);
  }

  function doExportJson() {
    if (engine) exportJson(engine, widgets.current, objects.current);
  }

  const jsonFileRef = useRef<HTMLInputElement | null>(null);
  async function doImportJson(file: File) {
    if (!engine) return;
    try {
      history.current?.reset();
      await importJson(engine, widgets.current, objects.current, file);
      afterBoardChange();
    } catch (err) {
      console.error("Import failed:", err);
    }
  }

  useEffect(() => {
    if (!engine) return;
    const tm = new ToolManager(engine, () => ({ color: appState.color, pen: appState.pen, eraser }), "hand");
    tools.current = tm;

    const wm = new WidgetManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {
        onSelect: () => {
          om.setSelected(null);
          syncGeometryRef.current();
        },
        onDragStart: (id, e) => {
          widgetDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
          syncGeometryRef.current();
        },
        onDragMove: (id, e) => {
          const g = widgetDrag.current;
          if (!g || g.id !== id) return;
          history.current?.recordWidgets();
          const dx = (e.clientX - g.last.x) / engine.camera.scale;
          const dy = (e.clientY - g.last.y) / engine.camera.scale;
          wm.move(id, dx, dy);
          g.last = { x: e.clientX, y: e.clientY };
          const item = wm.get(id);
          if (item) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h });
          syncGeometryRef.current();
        },
        onDragEnd: (id) => {
          widgetDrag.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onResizeStart: (id, e) => {
          widgetResize.current = { id, last: { x: e.clientX, y: e.clientY } };
          syncGeometryRef.current();
        },
        onResizeMove: (id, e) => {
          const g = widgetResize.current;
          if (!g || g.id !== id) return;
          history.current?.recordWidgets();
          const item = wm.get(id);
          if (!item) return;
          wm.resize(id, item.w + (e.clientX - g.last.x) / engine.camera.scale, item.h + (e.clientY - g.last.y) / engine.camera.scale);
          g.last = { x: e.clientX, y: e.clientY };
          const resized = wm.get(id);
          if (resized) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: resized.x, y: resized.y, w: resized.w, h: resized.h });
          syncGeometryRef.current();
        },
        onResizeEnd: (id) => {
          widgetResize.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onRemove: (id) => {
          history.current?.recordWidgets();
          wm.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onAccept: (id) => {
          history.current?.recordWidgets();
          wm.setStatus(id, "accepted");
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: item });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onAiRefine: (id) => {
          const item = wm.get(id);
          if (!item || !engine) return;
          const margin = 600;
          const focused: Rect = {
            x: Math.max(0, item.x - margin),
            y: Math.max(0, item.y - margin),
            w: Math.min(CANVAS_SIZE, item.w + margin * 2),
            h: Math.min(CANVAS_SIZE, item.h + margin * 2),
          };
          refineFocusRef.current = { rect: focused, widgetId: item.id };
          setAiStatus("thinking");
          void fireAi(focused, `Refine the widget titled "${item.title}" using any marks around it.`);
          setAutoOn(false);
        },
      },
    });
    widgets.current = wm;

    const om = new ObjectManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {
        onSelect: () => {
          wm.setSelected(null);
          syncGeometryRef.current();
        },
        onDragStart: (id, e) => {
          objectDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
          syncGeometryRef.current();
        },
        onDragMove: (id, e) => {
          const g = objectDrag.current;
          if (!g || g.id !== id) return;
          history.current?.recordObjects();
          const dx = (e.clientX - g.last.x) / engine.camera.scale;
          const dy = (e.clientY - g.last.y) / engine.camera.scale;
          om.move(id, dx, dy);
          g.last = { x: e.clientX, y: e.clientY };
          const item = om.get(id);
          if (item) broadcastMove("object", { type: "SYNC_OBJECT_MOVE", id, x: item.x, y: item.y });
          syncGeometryRef.current();
        },
        onDragEnd: (id) => {
          objectDrag.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MOVE", id, x: item.x, y: item.y });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onResizeStart: (id, e) => {
          objectResize.current = { id, last: { x: e.clientX, y: e.clientY } };
          syncGeometryRef.current();
        },
        onResizeMove: (id, e) => {
          const g = objectResize.current;
          if (!g || g.id !== id) return;
          history.current?.recordObjects();
          const item = om.get(id);
          if (!item) return;
          om.resize(id, item.w + (e.clientX - g.last.x) / engine.camera.scale, item.h + (e.clientY - g.last.y) / engine.camera.scale);
          g.last = { x: e.clientX, y: e.clientY };
          const resized = om.get(id);
          if (resized) broadcastMove("object", { type: "SYNC_OBJECT_RESIZE", id, w: resized.w, h: resized.h });
          syncGeometryRef.current();
        },
        onResizeEnd: (id) => {
          objectResize.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_RESIZE", id, w: item.w, h: item.h });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onRemove: (id) => {
          history.current?.recordObjects();
          om.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id });
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onAccept: (id) => {
          history.current?.recordObjects();
          om.setStatus(id, "accepted");
          const item = om.get(id);
          if (item) {
            const { image, ...cleanObject } = item;
            void image;
            syncManager.current?.broadcast({ type: "SYNC_OBJECT_ADD", object: cleanObject });
          }
          afterBoardChangeRef.current();
          syncGeometryRef.current();
        },
        onMerge: (id) => mergeObjectToInk(id),
      },
    });
    objects.current = om;

    const boardHistory = new BoardHistory();
    boardHistory.bind(engine, wm, om);
    history.current = boardHistory;
    engine.setTileWriteHook((tx, ty) => boardHistory.recordTileBefore(tx, ty));

    tm.setPicker({
      pick: (w) => {
        const wmHit = wm.hitTest(w);
        if (wmHit) return { kind: "widget", id: wmHit.id };
        const omHit = om.hitTest(w);
        if (omHit) return { kind: "object", id: omHit.id };
        return null;
      },
      focus: (node) => {
        if (!node) {
          wm.setSelected(null);
          om.setSelected(null);
          syncGeometryRef.current();
          return;
        }
        if (node.kind === "widget") wm.setSelected(node.id);
        else om.setSelected(node.id);
        syncGeometryRef.current();
      },
      translate: (node, dx, dy) => {
        if (node.kind === "widget") {
          history.current?.recordWidgets();
          wm.move(node.id, dx, dy);
          const item = wm.get(node.id);
          if (item) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id: node.id, x: item.x, y: item.y, w: item.w, h: item.h });
        } else {
          history.current?.recordObjects();
          om.move(node.id, dx, dy);
          const item = om.get(node.id);
          if (item) broadcastMove("object", { type: "SYNC_OBJECT_MOVE", id: node.id, x: item.x, y: item.y });
        }
        syncGeometryRef.current();
      },
      endTranslate: (node) => {
        if (node.kind === "widget") {
          const item = wm.get(node.id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id: node.id, x: item.x, y: item.y, w: item.w, h: item.h });
        } else {
          const item = om.get(node.id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MOVE", id: node.id, x: item.x, y: item.y });
        }
        syncGeometryRef.current();
      },
    });

    const draft = new DraftManager();
    draft.setRenderer("html_widget", (_eng, cmd) => {
      if (cmd.tool !== "html_widget") return;
      const targetId = activeEditTargetRef.current;
      let oldWidget = targetId ? wm.get(targetId) : null;
      if (!oldWidget && cmd.title) {
        for (const w of wm.all()) {
          if (w.title === cmd.title && distanceBetweenRects({ x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h }, w) < 200) {
            oldWidget = w;
            break;
          }
        }
      }
      if (oldWidget) {
        wm.remove(oldWidget.id);
      } else {
        for (const w of wm.all()) {
          if (w.status === "draft" && w.kind === "html") wm.remove(w.id);
        }
      }
      activeEditTargetRef.current = null;
      const estimated = extractHtmlDimensions(cmd.html);
      const initialW = oldWidget ? oldWidget.w : Math.round(estimated?.width || cmd.w);
      const initialH = oldWidget ? oldWidget.h : Math.round(estimated?.height || cmd.h);

      const item: WidgetItem = {
        id: oldWidget?.id || targetId || `widget-${Date.now()}`,
        kind: "html",
        pluginId: cmd.pluginId,
        sourceFormat: cmd.sourceFormat,
        diagramKind: cmd.diagramKind,
        x: oldWidget ? oldWidget.x : cmd.x,
        y: oldWidget ? oldWidget.y : cmd.y,
        w: initialW,
        h: initialH,
        contentW: oldWidget ? oldWidget.contentW : initialW,
        contentH: oldWidget ? oldWidget.contentH : initialH,
        title: cmd.title,
        html: cmd.html,
        copyText: cmd.copyText,
        copyLabel: cmd.copyLabel,
        status: "draft",
        userResized: oldWidget ? (oldWidget.userResized ?? true) : false,
      };
      wm.add(item);
      syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: item });
      setMode("select");
    });
    draft.setRenderer("write_text", (_eng, cmd) => {
      if (cmd.tool !== "write_text") return;
      const block = renderTextBlock(cmd.text, cmd.color, cmd.fontSize, cmd.maxWidth);
      addObject({
        id: `text-${Date.now()}`,
        kind: "text",
        x: cmd.x,
        y: cmd.y,
        w: block.w,
        h: block.h,
        contentW: block.w,
        contentH: block.h,
        source: cmd.text,
        color: cmd.color,
        fontSize: cmd.fontSize,
        maxWidth: cmd.maxWidth,
        status: "draft",
        image: block.canvas,
      });
      setMode("select");
    });
    draft.setRenderer("draw_formula", async (_eng, cmd) => {
      if (cmd.tool !== "draw_formula") return;
      const rendered = await renderFormula(cmd.latex, cmd.fontSize, cmd.color);
      if (rendered.canvas.width > 0 && rendered.canvas.height > 0) {
        addObject({
          id: `formula-${Date.now()}`,
          kind: "formula",
          x: cmd.x,
          y: cmd.y,
          w: rendered.canvas.width,
          h: rendered.canvas.height,
          contentW: rendered.canvas.width,
          contentH: rendered.canvas.height,
          source: cmd.latex,
          color: cmd.color,
          fontSize: cmd.fontSize,
          status: "draft",
          image: rendered.canvas,
        });
        setMode("select");
      }
    });
    draft.setRenderer("plot_function", (_eng, cmd) => {
      if (cmd.tool !== "plot_function") return;
      const canvas = bakePlotObject(cmd);
      if (canvas.width > 0 && canvas.height > 0) {
        addObject({
          id: `plot-${Date.now()}`,
          kind: "plot",
          x: cmd.x,
          y: cmd.y,
          w: cmd.w,
          h: cmd.h,
          contentW: canvas.width,
          contentH: canvas.height,
          source: cmd.expression,
          color: cmd.color,
          fontSize: 0,
          status: "draft",
          image: canvas,
        });
        setMode("select");
      }
    });
    draft.setRenderer("diagram_source", async (_eng, cmd) => {
      if (cmd.tool !== "diagram_source") return;
      const targetId = activeEditTargetRef.current;
      let oldWidget = targetId ? wm.get(targetId) : null;
      if (!oldWidget && cmd.title) {
        for (const w of wm.all()) {
          if (w.title === cmd.title && distanceBetweenRects({ x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h }, w) < 200) {
            oldWidget = w;
            break;
          }
        }
      }
      if (oldWidget) {
        wm.remove(oldWidget.id);
      }
      activeEditTargetRef.current = null;
      const res = await diagramDocument(cmd.sourceFormat, cmd.source, cmd.diagramKind, cmd.title);
      const html = typeof res === "string" ? res : res.html;
      const estimated =
        typeof res === "object" && res.width && res.height
          ? { width: res.width, height: res.height }
          : estimateDiagramDimensions(cmd.sourceFormat, cmd.source, cmd.diagramKind);
      const initialW = oldWidget ? oldWidget.w : Math.round(estimated.width || cmd.w);
      const initialH = oldWidget ? oldWidget.h : Math.round(estimated.height || cmd.h);

      const item: WidgetItem = {
        id: oldWidget?.id || targetId || `diagram-${Date.now()}`,
        kind: "diagram",
        pluginId: cmd.pluginId || cmd.sourceFormat || "diagram",
        sourceFormat: cmd.sourceFormat,
        diagramKind: cmd.diagramKind,
        x: oldWidget ? oldWidget.x : cmd.x,
        y: oldWidget ? oldWidget.y : cmd.y,
        w: initialW,
        h: initialH,
        contentW: oldWidget ? oldWidget.contentW : initialW,
        contentH: oldWidget ? oldWidget.contentH : initialH,
        title: cmd.title,
        html,
        copyText: cmd.source,
        copyLabel: copyLabel(cmd.sourceFormat),
        status: "draft",
        userResized: oldWidget ? (oldWidget.userResized ?? true) : false,
      };
      wm.add(item);
      syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: item });
      setMode("select");
    });
    drafts.current = draft;

    const sync = () => {
      setZoom(Math.round(engine.camera.scale * 100));
      const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
      const cx = Math.round(c.x);
      const cy = Math.round(c.y);
      if (appState.center.x !== cx || appState.center.y !== cy) {
        setCenter(cx, cy);
      }
      wm.sync();
      objects.current?.sync();
      syncGeometryRef.current();
    };
    const unsub = engine.onPostFrame(sync);

    const sm = new SyncManager();
    syncManager.current = sm;
    sm.setHandlers({
      onStatusChange: (status, roomCode, peerCount, error) => {
        setSyncState({ status, roomCode, peerCount, error });
      },
      onPeerConnect: (_peerId, isHost) => {
        if (isHost) {
          toast.success("User connected to session!");
          setConnectOpen(false);
        }
      },
      onRequestInitialState: () => {
        if (!engine) return null;
        return serializeSnapshot(engine, widgets.current, objects.current);
      },
      onInitState: async (snapshot) => {
        if (!engine) return;
        await restoreSnapshot(engine, widgets.current, objects.current, snapshot);
        syncGeometryRef.current();
      },
      onRemoteStroke: (seg) => {
        if (!engine) return;
        strokeSegment(engine, seg.a, seg.b, {
          erase: seg.erase,
          size: seg.size,
          color: seg.color,
        });
      },
      onRemoteObjectAdd: async (obj) => {
        if (!engine || !objects.current) return;
        const restored = await renderObject(engine, obj);
        if (restored) objects.current.add(restored);
        syncGeometryRef.current();
      },
      onRemoteObjectMove: (id, x, y) => {
        const o = objects.current?.get(id);
        if (o && objects.current) {
          o.x = x;
          o.y = y;
          objects.current.sync();
          syncGeometryRef.current();
        }
      },
      onRemoteObjectResize: (id, w, h) => {
        objects.current?.resize(id, w, h);
        syncGeometryRef.current();
      },
      onRemoteObjectRemove: (id) => {
        objects.current?.remove(id);
        syncGeometryRef.current();
      },
      onRemoteObjectMerge: (id) => {
        void mergeObjectToInk(id);
        syncGeometryRef.current();
      },
      onRemoteWidgetAdd: (w) => {
        widgets.current?.add(w);
        syncGeometryRef.current();
      },
      onRemoteWidgetMove: (id, x, y, w, h) => {
        if (widgets.current?.has(id)) {
          const currentItem = widgets.current.get(id)!;
          widgets.current.move(id, x - currentItem.x, y - currentItem.y);
          widgets.current.resize(id, w, h);
          syncGeometryRef.current();
        }
      },
      onRemoteWidgetRemove: (id) => {
        widgets.current?.remove(id);
        syncGeometryRef.current();
      },
      onRemoteClear: () => {
        if (!engine) return;
        engine.tiles.clear();
        engine.requestRender();
        widgets.current?.clear();
        objects.current?.clear();
        syncGeometryRef.current();
      },
    });

    engine.setStrokeSegmentHook((a, b, opts) => {
      if (!sm.isRemote) {
        sm.broadcast({
          type: "SYNC_STROKE_SEGMENT",
          a,
          b,
          erase: opts.erase,
          size: opts.size,
          color: opts.color,
        });
      }
    });

    const unsubRemoteCursors = engine.onInteractionFrame((ctx) => {
      const cursors = sm.getRemoteCursors();
      for (const c of cursors) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = c.color;
        ctx.fillText(c.name, c.x + 10, c.y + 4);
        ctx.restore();
      }
    });

    return () => {
      unsub();
      unsubRemoteCursors();
      engine.setStrokeSegmentHook(null);
      sm.disconnect();
      syncManager.current = null;
      engine.setTileWriteHook(null);
      wm.destroy();
      om.destroy();
      tools.current = null;
      widgets.current = null;
      objects.current = null;
      drafts.current = null;
      history.current = null;
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      const saved = await loadAutosave();
      if (saved && !cancelled) {
        await restoreSnapshot(engine, widgets.current, objects.current, saved);
        history.current?.reset();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    tools.current?.setMode(mode);
    widgets.current?.setMode(mode);
    objects.current?.setMode(mode);
    syncGeometryRef.current();
  }, [mode, engine]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "drawva-widget-wheel") return;
      if (engine) {
        let screenX = window.innerWidth / 2;
        let screenY = window.innerHeight / 2;
        const iframes = document.querySelectorAll<HTMLIFrameElement>(".drawva-widget-shell iframe");
        for (const iframe of iframes) {
          if (iframe.contentWindow === e.source) {
            const rect = iframe.getBoundingClientRect();
            screenX = rect.left + (typeof e.data.clientX === "number" ? e.data.clientX : rect.width / 2);
            screenY = rect.top + (typeof e.data.clientY === "number" ? e.data.clientY : rect.height / 2);
            break;
          }
        }
        engine.camera.zoomAt(screenX, screenY, e.data.deltaY);
        engine.requestRender();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [engine]);

  const addDemoWidget = () => {
    const wm = widgets.current;
    if (!wm || !engine) return;
    const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
    const demoHtml = `<!doctype html><html><head><style>body{font-family:system-ui;padding:24px;background:#f3f4f6;margin:0}button{font-size:28px;padding:12px 20px;border-radius:8px;border:0;background:#2679b8;color:#fff;cursor:pointer}</style></head><body><h2>Mini Counter</h2><button id="b">0</button><script>let n=0;document.getElementById('b').onclick=()=>{document.getElementById('b').textContent=++n};<\/script></body></html>`;
    const estimated = extractHtmlDimensions(demoHtml) || { width: 320, height: 220 };
    wm.add({
      id: `demo-${Date.now()}`,
      kind: "html",
      pluginId: "general",
      x: Math.max(0, c.x),
      y: Math.max(0, c.y),
      w: estimated.width,
      h: estimated.height,
      contentW: estimated.width,
      contentH: estimated.height,
      title: "Counter",
      html: demoHtml,
      status: "draft",
    });
    setMode("select");
  };

  const addDemoDiagram = () => {
    const draft = drafts.current;
    const wm = widgets.current;
    if (!draft || !wm || !engine) return;
    const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
    history.current?.recordWidgets();
    draft.setPending([
      {
        tool: "diagram_source",
        widgetType: "diagram_source",
        pluginId: "flowchart",
        x: Math.max(0, c.x),
        y: Math.max(0, c.y),
        w: 1000,
        h: 560,
        title: "Login flow",
        refreshSeconds: 0,
        sourceFormat: "mermaid",
        source: "flowchart LR\n  A[Start] --> B{Valid login?}\n  B -- No --> C[Show error]\n  B -- Yes --> D[Dashboard]\n  C --> A\n  D --> E[End]",
      },
    ]);
    draft.accept(engine).then(afterBoardChange).catch(console.error);
  };

  const addDemoFormula = () => {
    const draft = drafts.current;
    if (!draft || !engine) return;
    const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
    history.current?.recordObjects();
    draft.setPending([
      {
        tool: "draw_formula",
        x: Math.max(0, c.x),
        y: Math.max(0, c.y),
        latex: "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}",
        fontSize: 180,
        color: "#2563eb",
      },
    ]);
    draft.accept(engine).then(afterBoardChange).catch(console.error);
  };

  const addDemoPlot = () => {
    const draft = drafts.current;
    if (!draft || !engine) return;
    const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
    history.current?.recordObjects();
    draft.setPending([
      {
        tool: "plot_function",
        x: Math.max(0, c.x),
        y: Math.max(0, c.y),
        w: 700,
        h: 480,
        expression: "sin(x)",
        color: "#2563eb",
      },
    ]);
    draft.accept(engine).then(afterBoardChange).catch(console.error);
  };

  const [textOpen, setTextOpen] = useState(false);
  const [textAnchor, setTextAnchor] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const commitText = useCallback(() => {
    if (engine && textAnchor && textValue.trim()) {
      const scale = Math.max(0.01, engine.camera.scale);
      const screenFontSize = Math.max(16, pen * 4);
      const fontSize = Math.max(12, Math.round(screenFontSize / scale));
      const screenMaxWidth = 600;
      const maxWidth = Math.max(100, Math.round(screenMaxWidth / scale));
      const block = renderTextBlock(textValue, color, fontSize, maxWidth);
      addObject({
        id: `text-${Date.now()}`,
        kind: "text",
        x: textAnchor.x,
        y: textAnchor.y,
        w: block.w,
        h: block.h,
        contentW: block.w,
        contentH: block.h,
        source: textValue,
        color,
        fontSize,
        maxWidth,
        status: "accepted",
        image: block.canvas,
      });
      inkBoxRef.current = { x: textAnchor.x, y: textAnchor.y, w: block.w, h: block.h };
      afterBoardChangeRef.current();
      if (appState.autoOn) scheduleAi(inkBoxRef.current);
    }
    setTextOpen(false);
    setTextValue("");
    setTextAnchor(null);
  }, [engine, textAnchor, textValue, color, pen, addObject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "TEXTAREA" || t === "INPUT") return;
      const k = e.key.toLowerCase();
      if (e.shiftKey && k === "h") setMode("highlighter");
      else if (k === "v") setMode("select");
      else if (k === "h") setMode("hand");
      else if (k === "p") setMode("pen");
      else if (k === "e") setMode("eraser");
      else if (k === "t") setMode("text");
      else if (k === "r") setMode("rect");
      else if (k === "o") setMode("ellipse");
      else if (k === "a") setMode("arrow");
      else if ((e.ctrlKey || e.metaKey) && k === "z" && e.shiftKey) {
        redoRef.current();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && k === "z") {
        undoRef.current();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && k === "y") {
        redoRef.current();
        e.preventDefault();
      } else if (k === "delete" || k === "backspace") {
        tools.current?.deleteSelection();
        afterBoardChangeRef.current();
        syncGeometryRef.current();
        e.preventDefault();
      } else if (k === "escape") {
        tools.current?.clearSelection();
        syncGeometryRef.current();
        setTextOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const screenToWorld = (e: React.PointerEvent): Point => {
    const rect = engine!.canvas("screen").getBoundingClientRect();
    return engine!.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  };

  const gestureEvent = (e: React.PointerEvent): ToolGestureEvent => {
    const rect = engine!.canvas("screen").getBoundingClientRect();
    return {
      pointerId: e.pointerId,
      world: screenToWorld(e),
      screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      button: e.button,
      pressure: e.pressure,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!engine || textOpen) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size >= 2) {
      if (drawingRef.current) {
        drawingRef.current = null;
      }
      const tm = tools.current;
      if (tm) {
        for (const pid of activePointersRef.current.keys()) {
          tm.cancel(pid);
        }
      }

      const pts = Array.from(activePointersRef.current.values());
      const target = gestureOverlayRef.current || (e.currentTarget as HTMLElement);
      const rect = target.getBoundingClientRect();
      const p1 = { x: pts[0].x - rect.left, y: pts[0].y - rect.top };
      const p2 = { x: pts[1].x - rect.left, y: pts[1].y - rect.top };

      const startCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const startDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const cam = engine.camera;

      pinchRef.current = {
        startCenter,
        startDistance,
        startScale: cam.scale,
        startPanX: cam.panX,
        startPanY: cam.panY,
      };
      return;
    }

    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    const tm = tools.current;
    if (!tm) return;
    const middle = e.button === 1;
    if (middle || mode === "hand") {
      e.preventDefault();
      widgets.current?.setSelected(null);
      objects.current?.setSelected(null);
      tm.begin(gestureEvent(e));
      syncGeometryRef.current();
      return;
    }
    if (e.button !== 0) return;
    const world = screenToWorld(e);
    const isDrawing = ["pen", "highlighter", "eraser", "rect", "ellipse", "arrow"].includes(mode);
    if (isDrawing) {
      drawingRef.current = { x: world.x, y: world.y, w: 0, h: 0 };
      if (aiTimer.current) {
        clearTimeout(aiTimer.current);
        aiTimer.current = null;
      }
      aiAbort.current?.abort();
      aiRevision.current++;
    }
    if (mode === "text") {
      setTextAnchor(world);
      setTextValue("");
      setTextOpen(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      syncGeometryRef.current();
      return;
    }
    tm.begin(gestureEvent(e));
    syncGeometryRef.current();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!engine) return;

    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const target = gestureOverlayRef.current || (e.currentTarget as HTMLElement);
      const rect = target.getBoundingClientRect();
      const p1 = { x: pts[0].x - rect.left, y: pts[0].y - rect.top };
      const p2 = { x: pts[1].x - rect.left, y: pts[1].y - rect.top };

      const currentCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      const p = pinchRef.current;
      engine.camera.pinchZoom(
        currentCenter,
        p.startCenter,
        p.startDistance,
        currentDistance,
        p.startScale,
        p.startPanX,
        p.startPanY
      );
      engine.requestRender();
      return;
    }

    const tm = tools.current;
    if (!tm) return;
    const world = screenToWorld(e);
    const cx = Math.round(world.x);
    const cy = Math.round(world.y);
    if (!appState.cursor || appState.cursor.x !== cx || appState.cursor.y !== cy) {
      setCursor({ x: cx, y: cy });
    }
    syncManager.current?.sendCursor(world.x, world.y, mode);
    tm.move(gestureEvent(e));
    if (drawingRef.current) {
      const d = drawingRef.current;
      const x1 = Math.min(d.x, world.x);
      const y1 = Math.min(d.y, world.y);
      const x2 = Math.max(d.x + d.w, world.x);
      const y2 = Math.max(d.y + d.h, world.y);
      drawingRef.current = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    syncGeometryRef.current();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    const tm = tools.current;
    if (!tm) return;
    const changed = tm.end(e.pointerId);
    if (changed) afterBoardChange();
    if (drawingRef.current) {
      if (mode === "eraser") {
        if (aiTimer.current) {
          clearTimeout(aiTimer.current);
          aiTimer.current = null;
        }
        drawingRef.current = null;
        afterBoardChange();
      } else {
        const isDrawing = ["pen", "highlighter", "rect", "ellipse", "arrow"].includes(mode);
        if (isDrawing) {
          const singleStrokeBox = { ...drawingRef.current };
          drawingRef.current = null;
          const now = Date.now();
          if (
            inkBoxRef.current &&
            now - lastStrokeTimeRef.current < 20000 &&
            Math.abs(singleStrokeBox.x - inkBoxRef.current.x) < 3000 &&
            Math.abs(singleStrokeBox.y - inkBoxRef.current.y) < 3000
          ) {
            inkBoxRef.current = unionRect(inkBoxRef.current, singleStrokeBox);
          } else {
            inkBoxRef.current = singleStrokeBox;
          }
          lastStrokeTimeRef.current = now;
          const currentInkBox = { ...inkBoxRef.current };
          aiRevision.current++;
          afterBoardChange();
          if (appState.autoOn) scheduleAi(currentInkBox);
        } else {
          drawingRef.current = null;
        }
      }
    }
    syncGeometryRef.current();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!engine) return;
    e.preventDefault();
    engine.camera.zoomAt(e.clientX, e.clientY, e.deltaY);
    engine.requestRender();
  };

  const fileRef = useRef<HTMLInputElement | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (engine && f) {
      const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
      try {
        await placeImageAt(engine, f, c);
        afterBoardChange();
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  const importImage = () => fileRef.current?.click();

  const anchorCss = textAnchor && engine
    ? engine.camera.worldToScreen(textAnchor.x, textAnchor.y)
    : null;

  const zoomBy = (delta: number) => {
    if (!engine) return;
    engine.camera.zoomAt(engine.cssWidth / 2, engine.cssHeight / 2, delta);
    engine.requestRender();
  };
  const resetView = () => {
    if (!engine) return;
    engine.camera.reset();
    engine.requestRender();
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <CanvasHeader
        mode={mode}
        onMode={setMode}
        color={color}
        onColor={setColor}
        pen={pen}
        onPen={setPen}
        onImportImage={importImage}
        onUndo={() => undoRef.current?.()}
        onRedo={() => redoRef.current?.()}
        onClear={clearBoard}
        canUndo={canUndoState}
        canRedo={canRedoState}
        onExportPng={doExportPng}
        onExportJson={doExportJson}
        onImportJson={() => jsonFileRef.current?.click()}
        onInsertWidget={addDemoWidget}
        onInsertDiagram={addDemoDiagram}
        onInsertFormula={addDemoFormula}
        onInsertPlot={addDemoPlot}
        aiStatus={aiStatus}
        aiRun={aiRun}
        autoOn={autoOn}
        onAutoChange={setAutoOn}
        onAskAi={askAi}
        models={models}
        activeModel={activeModel}
        onModelChange={handleModelChange}
        onOpenSettings={() => setSettingsOpen(true)}
        syncStatus={syncState.status}
        syncRoomCode={syncState.roomCode}
        syncPeerCount={syncState.peerCount}
        onOpenConnect={() => setConnectOpen(true)}
        onOpenLogs={() => setLogsOpen(true)}
        hasLogs={!!latestLog}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        <div
          ref={gestureOverlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setCursor(null)}
          onWheel={onWheel}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            pointerEvents: "auto",
            userSelect: "none",
            touchAction: "none",
            cursor:
              mode === "select"
                ? "default"
                : mode === "hand"
                ? "grab"
                : mode === "text"
                ? "text"
                : "crosshair",
          }}
        />

        {textOpen && anchorCss && (
          <Textarea
            ref={textareaRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setTextOpen(false);
                setTextValue("");
                setTextAnchor(null);
              }
            }}
            placeholder="Type text…"
            className="absolute z-30 min-w-56 max-w-2xl resize border-2 border-primary/50 bg-background/95 shadow-md"
            style={{
              left: anchorCss.x,
              top: anchorCss.y,
              fontSize: Math.max(12, pen * 4),
            }}
          />
        )}
      </div>

      <CanvasFooter onZoomIn={() => zoomBy(-100)} onZoomOut={() => zoomBy(100)} onReset={resetView} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
      />
      <input
        ref={jsonFileRef}
        type="file"
        accept="application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImportJson(f);
          e.target.value = "";
        }}
        className="hidden"
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        log={latestLog}
        onClearLogs={() => setLatestLog(null)}
      />
      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        status={syncState.status}
        roomCode={syncState.roomCode}
        peerCount={syncState.peerCount}
        errorMessage={syncState.error}
        onHost={() => syncManager.current!.hostSession()}
        onJoin={(code) => syncManager.current!.joinSession(code)}
        onDisconnect={() => syncManager.current!.disconnect()}
      />
    </div>
  );
}
