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
  setMode,
  setPen,
  setZoom,
} from "@/lib/state";
import { useCanvas } from "./CanvasProvider";
import { ToolManager, type ToolGestureEvent } from "@/lib/canvas/toolManager";
import { DraftManager } from "@/lib/canvas/draftStore";
import { rasterizeText, renderTextBlock } from "@/lib/canvas/textTool";
import { placeImageAt } from "@/lib/canvas/images";
import { CanvasHeader, type AiRunState } from "./CanvasHeader";
import { Conductor, type ConductorEvent } from "@/lib/ai/conductor";
import { SettingsDialog } from "./SettingsDialog";
import { ModelSelectDialog } from "./ModelSelectDialog";
import { LogsDialog } from "./LogsDialog";
import { UserManualDialog } from "./UserManualDialog";
import { CanvasFooter, type GenerationTickerState } from "./CanvasFooter";
import { WidgetManager, type WidgetItem, extractHtmlDimensions } from "@/lib/canvas/widgets";
import { ObjectManager, type ObjectItem } from "@/lib/canvas/objects";
import { diagramDocument, copyLabel } from "@/lib/canvas/diagram";
import { renderFormula, bakeFormula } from "@/lib/canvas/formulas";
import { bakePlot, plotCommand } from "@/lib/canvas/plotter";
import { unionRect } from "@/lib/canvas/engine";
import { serializeSnapshot, restoreSnapshot, saveAutosave, loadAutosave, exportPng, exportJson, importJson, renderObject, applyTiles, computeSnapshotHash } from "@/lib/canvas/persistence";
import {
  CloudSyncEngine,
  fetchCloudCanvas,
  type CloudSyncStatus,
} from "@/lib/canvas/cloudSync";
import { useSession } from "@/lib/auth-client";
import { BoardHistory } from "@/lib/canvas/history";
import { computeTidyMoves } from "@/lib/canvas/tidy";
import { resizeWidgetGeometry } from "@/lib/canvas/widgetGeometry";
import type { AiLogEntry } from "@/lib/ai/types";
import type { PlotFunctionCommand } from "@/lib/canvas/commands";
import type { Point, Rect } from "@/lib/canvas/types";
import {
  getActiveModel,
  getCachedModels,
  getProviderConfig,
  setActiveModel,
  getEnabledPlugins,
  getReasoningEffort,
  setReasoningEffort,
  type ReasoningEffort,
} from "@/lib/ai/provider";
import { Textarea } from "@/components/ui/textarea";
import {
  SyncManager,
  type SyncStatus,
  getStoredP2PSession,
  widgetNeedsHydration,
  compactWidgetForSync,
} from "@/lib/canvas/sync";
import { ConnectDialog } from "./ConnectDialog";
import { MobileOrientationPrompt } from "./MobileOrientationPrompt";
import { strokeSegment } from "@/lib/canvas/strokes";
import { eraseRegion, pasteDataUrl } from "@/lib/canvas/selection";

function findInPlaceWidget(
  wm: WidgetManager,
  opts: {
    targetId: string | null;
    lockTarget?: boolean;
  }
): WidgetItem | null {
  if (!opts.targetId) return null;
  return wm.get(opts.targetId) ?? null;
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
  const widgetResize = useRef<{
    id: string;
    mode: import("@/lib/canvas/widgetGeometry").WidgetResizeMode;
    startPoint: { x: number; y: number };
    startLayout: import("@/lib/canvas/widgets").WidgetItem;
  } | null>(null);
  const objectDrag = useRef<{ id: string; last: { x: number; y: number } } | null>(null);
  const objectResize = useRef<{
    id: string;
    mode: import("@/lib/canvas/objects").ObjectResizeMode;
    last: { x: number; y: number };
  } | null>(null);
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
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const isAuthenticatedRef = useRef(isAuthenticated);
  const cloudSync = useRef<CloudSyncEngine | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>("idle");

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    cloudSync.current?.setAuthenticated(isAuthenticated);
  }, [isAuthenticated]);

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

  async function mergeObjectToInk(id: string, opts?: { silent?: boolean }): Promise<void> {
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
    if (!opts?.silent) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MERGE", id });
    afterBoardChangeRef.current();
  }

  const addObjectRef = useRef(addObject);
  const mergeObjectToInkRef = useRef(mergeObjectToInk);
  useEffect(() => {
    addObjectRef.current = addObject;
    mergeObjectToInkRef.current = mergeObjectToInk;
  });

  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRevisionRef = useRef(0);
  const conductorRef = useRef<Conductor | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const inkBoxRef = useRef<Rect | null>(null);
  const drawingRef = useRef<Rect | null>(null);
  const lastStrokeTimeRef = useRef<number>(0);
  const activeEditTargetRef = useRef<string | null>(null);
  const lockEditTargetRef = useRef(false);

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
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(() => getReasoningEffort());
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  const [tickerState, setTickerState] = useState<GenerationTickerState>({
    status: "idle",
    currentMessage: "",
    messageId: 0,
  });
  const [manualOpen, setManualOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("theDrawvaManual") !== "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const refresh = () => {
      const nextModels = getCachedModels();
      setModels((prev) => {
        if (
          prev.length === nextModels.length &&
          prev.every((m, i) => m === nextModels[i])
        ) {
          return prev;
        }
        return nextModels;
      });
      let nextActive = getActiveModel();
      if (!nextActive && nextModels.length > 0) {
        nextActive = nextModels[0];
        setActiveModel(nextActive);
      }
      setActiveModelState((prev) => (prev === nextActive ? prev : nextActive));
      const nextEffort = getReasoningEffort();
      setReasoningEffortState((prev) => (prev === nextEffort ? prev : nextEffort));
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const handleModelChange = (model: string | null) => {
    setActiveModel(model);
    setActiveModelState(model);
  };

  const handleReasoningEffortChange = (effort: ReasoningEffort) => {
    setReasoningEffort(effort);
    setReasoningEffortState(effort);
  };

  const [aiRun, setAiRun] = useState<AiRunState>({
    phase: "idle",
    activeProvider: null,
    doneProvider: null,
  });

  const handleConductorEvent = useCallback((e: ConductorEvent) => {
    if (e.kind === "turn_start") {
      setAgentRunning(true);
      setAiStatus("thinking");
      setAiRun({
        phase: "running",
        activeProvider: getActiveModel(),
        doneProvider: null,
        durationStage: "normal",
      });
      setTickerState((prev) => ({
        status: "running",
        currentMessage: "Observing canvas & handwriting…",
        messageId: prev.messageId + 1,
      }));
    } else if (e.kind === "step_start") {
      setAiStatus("thinking");
      setTickerState((prev) => ({
        status: "running",
        currentMessage: `Reasoning step #${e.stepNumber}…`,
        messageId: prev.messageId + 1,
      }));
    } else if (e.kind === "tool_start") {
      setAiStatus("thinking");
      let label = `Executing ${e.name}…`;
      if (e.name === "canvas_apply") {
        label = e.argsSummary ? `Applying: ${e.argsSummary}` : "Applying canvas items…";
      } else if (e.name === "canvas_snapshot") {
        label = "Capturing canvas snapshot…";
      } else if (e.name === "canvas_read") {
        label = e.argsSummary ? `Reading: ${e.argsSummary}` : "Reading widget source…";
      } else if (e.name === "canvas_patch_widget") {
        label = "Patching widget diff…";
      } else if (e.name === "canvas_scan") {
        label = "Scanning canvas items…";
      } else if (e.name === "load_plugin") {
        label = e.argsSummary ? `Loading plugin: ${e.argsSummary}` : "Loading plugin…";
      }
      setTickerState((prev) => ({
        status: "running",
        currentMessage: label,
        messageId: prev.messageId + 1,
      }));
    } else if (e.kind === "tool_end") {
      const summaryText = e.ok ? `Done: ${e.summary || e.name}` : `Failed: ${e.name}`;
      setTickerState((prev) => ({
        status: "running",
        currentMessage: summaryText,
        messageId: prev.messageId + 1,
      }));
    } else if (e.kind === "text_delta") {
      setTickerState((prev) => {
        if (prev.currentMessage === "Composing response…") return prev;
        return {
          status: "running",
          currentMessage: "Composing response…",
          messageId: prev.messageId + 1,
        };
      });
    } else if (e.kind === "log") {
      setLogs((prev) => [e.entry, ...prev.slice(0, 19)]);
    } else if (e.kind === "turn_end") {
      setAgentRunning(false);
      if (e.reason === "done") {
        setAiStatus("done");
        setAiRun({
          phase: "done",
          activeProvider: null,
          doneProvider: getActiveModel(),
          durationStage: "normal",
        });
        setTickerState((prev) => ({
          status: "done",
          currentMessage: "AI generation complete",
          messageId: prev.messageId + 1,
        }));
        setTimeout(() => {
          setAiStatus("idle");
          setAiRun((prev) => (prev.phase === "done" ? { ...prev, phase: "idle" } : prev));
          setTickerState((prev) => (prev.status === "done" ? { ...prev, status: "idle" } : prev));
        }, 3500);
      } else if (e.reason === "error") {
        setAiStatus("error");
        setAiRun({
          phase: "error",
          activeProvider: null,
          doneProvider: null,
          durationStage: "normal",
        });
        setTickerState((prev) => ({
          status: "error",
          currentMessage: e.error ? `Error: ${e.error}` : "Generation failed",
          messageId: prev.messageId + 1,
        }));
        toast.error(e.error || "Agent turn failed.");
        setTimeout(() => {
          setAiStatus("idle");
          setAiRun((prev) => (prev.phase === "error" ? { ...prev, phase: "idle" } : prev));
          setTickerState((prev) => (prev.status === "error" ? { ...prev, status: "idle" } : prev));
        }, 5000);
      } else {
        setAiStatus("idle");
        setAiRun({
          phase: "idle",
          activeProvider: null,
          doneProvider: null,
          durationStage: "normal",
        });
        setTickerState((prev) => ({ ...prev, status: "idle" }));
      }
    }
  }, []);

  const handleConductorEventRef = useRef(handleConductorEvent);
  useEffect(() => {
    handleConductorEventRef.current = handleConductorEvent;
  });

  const handleAskAi = useCallback(() => {
    const agent = conductorRef.current;
    if (!agent) {
      toast.error("AI Conductor is initializing, please wait a moment.");
      return;
    }
    // Cancel and defer cloud sync so AI generation has 100% network bandwidth and 0 latency
    cloudSync.current?.cancel();
    const config = getProviderConfig();
    const model = getActiveModel();
    const isCli = config?.type === "codex" || config?.type === "antigravity";
    if (!config || !model || (!isCli && !config.apiKey)) {
      setSettingsOpen(true);
      toast.info("Please configure an AI provider and select a model.");
      return;
    }

    // Set immediate loading state for instant visual feedback on header and footer
    setAgentRunning(true);
    setAiStatus("thinking");
    setAiRun({
      phase: "running",
      activeProvider: model,
      doneProvider: null,
      durationStage: "normal",
    });
    setTickerState((prev) => ({
      status: "running",
      currentMessage: "Observing canvas & handwriting…",
      messageId: prev.messageId + 1,
    }));

    const prompt =
      "Observe the canvas handwriting, formulas, diagrams, questions, and drawings. Provide the appropriate continuation, solution, calculation, diagram, or interactive widget.";
    void agent.send(prompt);
  }, []);

  const scheduleAi = useCallback((_box: Rect | null, userPrompt?: string) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      aiTimer.current = null;
      const agent = conductorRef.current;
      if (!agent) return;
      cloudSync.current?.cancel();
      const config = getProviderConfig();
      const model = getActiveModel();
      const isCli = config?.type === "codex" || config?.type === "antigravity";
      if (!config || !model || (!isCli && !config.apiKey)) {
        return;
      }
      const prompt =
        userPrompt ||
        "Observe the new drawing or ink on the canvas and generate the appropriate continuation, answer, formula, diagram, or widget.";
      void agent.send(prompt, undefined, { headless: !userPrompt });
    }, 1200);
  }, []);

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

  function bumpRevision() {
    boardRevisionRef.current += 1;
  }

  const isCanvasBusy = useCallback((): boolean => {
    if (activePointersRef.current.size > 0) return true;
    if (tools.current?.isInteracting) return true;
    if (conductorRef.current?.isRunning() ?? false) return true;
    if (drafts.current?.hasPending) return true;
    return false;
  }, []);

  const isCanvasBusyRef = useRef(isCanvasBusy);
  useEffect(() => {
    isCanvasBusyRef.current = isCanvasBusy;
  });

  function scheduleSave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      if (isCanvasBusyRef.current()) {
        scheduleSave();
        return;
      }
      const eng = engine;
      if (eng) {
        const snapshot = serializeSnapshot(eng, widgets.current, objects.current);
        void saveAutosave(snapshot);
        if (isAuthenticated) {
          cloudSync.current?.scheduleCloudSync(snapshot, 4000);
        }
      }
    }, 1200);
  }

  function afterBoardChange() {
    bumpRevision();
    history.current?.commit();
    syncHistoryButtons();
    scheduleSave();
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
    bumpRevision();
    syncHistoryButtons();
    if (engine && syncManager.current) {
      const snapshot = serializeSnapshot(engine, widgets.current, objects.current);
      syncManager.current.broadcastSnapshot(snapshot);
    }
  }

  async function redo() {
    const tm = tools.current;
    if (tm) tm.clearSelection();
    const h = history.current;
    if (!h || !h.canRedo) return;
    await h.redo();
    bumpRevision();
    syncHistoryButtons();
    if (engine && syncManager.current) {
      const snapshot = serializeSnapshot(engine, widgets.current, objects.current);
      syncManager.current.broadcastSnapshot(snapshot);
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
    conductorRef.current?.cancel();
    setAiStatus("idle");
    setAiRun({ phase: "idle", activeProvider: null, doneProvider: null, durationStage: "normal" });
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
      if (syncManager.current) {
        syncManager.current.broadcastSnapshot(
          serializeSnapshot(engine, widgets.current, objects.current)
        );
      }
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
        },
        onDragStart: (id, e) => {
          widgetDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
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
          if (item) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
        },
        onDragEnd: (id) => {
          widgetDrag.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
          afterBoardChangeRef.current();
        },
        onResizeStart: (id, mode, e) => {
          const item = wm.get(id);
          if (!item) return;
          widgetResize.current = {
            id,
            mode,
            startPoint: { x: e.clientX, y: e.clientY },
            startLayout: { ...item },
          };
        },
        onResizeMove: (id, _mode, e) => {
          const g = widgetResize.current;
          if (!g || g.id !== id || !g.startLayout) return;
          history.current?.recordWidgets();
          const dx = (e.clientX - g.startPoint.x) / engine.camera.scale;
          const dy = (e.clientY - g.startPoint.y) / engine.camera.scale;
          const requestedW = g.startLayout.w + dx;
          const requestedH = g.startLayout.h + dy;
          const next = resizeWidgetGeometry(g.startLayout, g.mode, requestedW, requestedH);
          wm.resize(id, next.w, next.h, next.contentW, next.contentH, true, g.mode);
          const resized = wm.get(id);
          if (resized) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: resized.x, y: resized.y, w: resized.w, h: resized.h, contentW: resized.contentW, contentH: resized.contentH, userResized: resized.userResized, resizeMode: resized.resizeMode });
        },
        onResizeEnd: (id) => {
          widgetResize.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
          afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordWidgets();
          wm.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id });
          afterBoardChangeRef.current();
        },
        onAccept: (id) => {
          history.current?.recordWidgets();
          wm.setStatus(id, "accepted");
          const item = wm.get(id);
          if (item) {
            syncManager.current?.broadcast({
              type: "SYNC_WIDGET_ADD",
              widget: compactWidgetForSync(item),
            });
          }
          afterBoardChangeRef.current();
        },
        onAiRefine: (id) => {
          const item = wm.get(id);
          if (!item) return;
          const prompt = `Refine the widget titled "${item.title}" (ID: ${item.id}) using any surrounding marks, notes, or instructions around it.`;
          void conductorRef.current?.send(prompt);
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
        },
        onDragStart: (id, e) => {
          objectDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
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
        },
        onDragEnd: (id) => {
          objectDrag.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MOVE", id, x: item.x, y: item.y });
          afterBoardChangeRef.current();
        },
        onResizeStart: (id, mode, e) => {
          objectResize.current = { id, mode, last: { x: e.clientX, y: e.clientY } };
        },
        onResizeMove: (id, mode, e) => {
          const g = objectResize.current;
          if (!g || g.id !== id) return;
          history.current?.recordObjects();
          const item = om.get(id);
          if (!item) return;
          const dx = (e.clientX - g.last.x) / engine.camera.scale;
          const dy = (e.clientY - g.last.y) / engine.camera.scale;
          const effectiveMode = g.mode || mode;
          const newW = effectiveMode === "vertical" ? item.w : item.w + dx;
          const newH = effectiveMode === "horizontal" ? item.h : item.h + dy;
          om.resize(id, newW, newH);
          g.last = { x: e.clientX, y: e.clientY };
          const resized = om.get(id);
          if (resized) broadcastMove("object", { type: "SYNC_OBJECT_RESIZE", id, x: resized.x, y: resized.y, w: resized.w, h: resized.h });
        },
        onResizeEnd: (id) => {
          objectResize.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_RESIZE", id, x: item.x, y: item.y, w: item.w, h: item.h });
          afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordObjects();
          om.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id });
          afterBoardChangeRef.current();
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
        },
        onMerge: (id) => mergeObjectToInkRef.current(id),
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
          return;
        }
        if (node.kind === "widget") wm.setSelected(node.id);
        else om.setSelected(node.id);
      },
      translate: (node, dx, dy) => {
        if (node.kind === "widget") {
          history.current?.recordWidgets();
          wm.move(node.id, dx, dy);
          const item = wm.get(node.id);
          if (item) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id: node.id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
        } else {
          history.current?.recordObjects();
          om.move(node.id, dx, dy);
          const item = om.get(node.id);
          if (item) broadcastMove("object", { type: "SYNC_OBJECT_MOVE", id: node.id, x: item.x, y: item.y });
        }
      },
      endTranslate: (node) => {
        if (node.kind === "widget") {
          const item = wm.get(node.id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id: node.id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
        } else {
          const item = om.get(node.id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MOVE", id: node.id, x: item.x, y: item.y });
        }
      },
    });

    const draft = new DraftManager();
    draft.setRenderer("html_widget", (_eng, cmd) => {
      if (cmd.tool !== "html_widget") return;
      const targetId = (cmd as { targetId?: string }).targetId || activeEditTargetRef.current;
      activeEditTargetRef.current = null;
      const lockTarget = lockEditTargetRef.current;
      lockEditTargetRef.current = false;
      const oldWidget = targetId
        ? findInPlaceWidget(wm, {
            targetId,
            lockTarget,
          })
        : null;
      if (oldWidget) {
        wm.remove(oldWidget.id);
        syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: oldWidget.id });
      }
      const estimated = extractHtmlDimensions(cmd.html);
      const initialW = oldWidget ? oldWidget.w : Math.round(cmd.w || estimated?.width || 540);
      const initialH = oldWidget ? oldWidget.h : Math.round(cmd.h || estimated?.height || 360);

      const item: WidgetItem = {
        id: oldWidget?.id || `widget-${Date.now()}`,
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
      // Diagrams sync source only (html rebuilt on peer); applets chunk if large.
      syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
      setMode("select");
    });
    draft.setRenderer("write_text", (_eng, cmd) => {
      if (cmd.tool !== "write_text") return;
      const block = renderTextBlock(cmd.text, cmd.color, cmd.fontSize, cmd.maxWidth);
      addObjectRef.current({
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
        addObjectRef.current({
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
        addObjectRef.current({
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
    draft.setRenderer("animate_scene", (_eng, cmd) => {
      if (cmd.tool !== "animate_scene") return;
      const scene = (cmd as { scene?: import("@/lib/canvas/animation").AnimationScene }).scene;
      addObjectRef.current({
        id: `animation-${Date.now()}`,
        kind: "animation",
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        contentW: cmd.w,
        contentH: cmd.h,
        source: JSON.stringify(scene || cmd),
        color: "",
        fontSize: 0,
        status: "draft",
        animationScene: scene,
        paused: false,
        playheadMs: 0,
        startedAt: performance.now(),
      });
      setMode("select");
    });
    draft.setRenderer("diagram_source", async (_eng, cmd) => {
      if (cmd.tool !== "diagram_source") return;
      const targetId = (cmd as { targetId?: string }).targetId || activeEditTargetRef.current;
      activeEditTargetRef.current = null;
      const lockTarget = lockEditTargetRef.current;
      lockEditTargetRef.current = false;
      const oldWidget = targetId
        ? findInPlaceWidget(wm, {
            targetId,
            lockTarget,
          })
        : null;
      if (oldWidget) {
        wm.remove(oldWidget.id);
        syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: oldWidget.id });
      }
      const res = await diagramDocument(cmd.sourceFormat, cmd.source, cmd.diagramKind, cmd.title);
      const html = typeof res === "string" ? res : res.html;
      const fromDoc = typeof res === "object" && res ? res : null;
      const initialW = oldWidget ? oldWidget.w : Math.round(fromDoc?.width || cmd.w || 540);
      const initialH = oldWidget ? oldWidget.h : Math.round(fromDoc?.height || cmd.h || 360);

      const item: WidgetItem = {
        id: oldWidget?.id || `diagram-${Date.now()}`,
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
      syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
      setMode("select");
    });
    drafts.current = draft;

    const agent = new Conductor({
      engine,
      widgets: wm,
      objects: om,
      history: boardHistory,
      draft,
      camera: engine.camera,
      provider: () => getProviderConfig(),
      getRevision: () => boardRevisionRef.current,
      onEvent: (e) => handleConductorEventRef.current(e),
      enabledPluginIds: () => getEnabledPlugins(),
      afterBoardChange: () => afterBoardChangeRef.current(),
      getInkBox: () => inkBoxRef.current,
    });
    conductorRef.current = agent;

    let lastCamKey = "";
    let lastZoom = -1;
    let lastCx = -1;
    let lastCy = -1;
    const sync = () => {
      const cam = engine.camera;
      const camKey = `${cam.panX}|${cam.panY}|${cam.scale}`;
      if (camKey === lastCamKey) return;
      lastCamKey = camKey;

      wm.sync();
      objects.current?.sync();

      const zoom = Math.round(cam.scale * 100);
      if (zoom !== lastZoom) {
        lastZoom = zoom;
        setZoom(zoom);
      }
      const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
      const cx = Math.round(c.x);
      const cy = Math.round(c.y);
      if (cx !== lastCx || cy !== lastCy) {
        lastCx = cx;
        lastCy = cy;
        setCenter(cx, cy);
      }
    };
    const unsub = engine.onPostFrame(sync);

    const sm = new SyncManager();
    syncManager.current = sm;

    async function hydrateAndAddRemoteWidget(w: WidgetItem): Promise<void> {
      let widget = w;
      if (widgetNeedsHydration(w) && w.copyText) {
        try {
          const format = w.sourceFormat || w.pluginId || "mermaid";
          const res = await diagramDocument(format, w.copyText, w.diagramKind, w.title);
          widget = {
            ...w,
            kind: w.kind === "html" ? "html" : "diagram",
            html: typeof res === "string" ? res : res.html,
          };
        } catch (err) {
          console.warn("[P2P] Failed to hydrate remote widget HTML", w.id, err);
        }
      }
      const existing = widgets.current?.get(widget.id);
      if (existing && existing.html === widget.html && existing.title === widget.title) {
        widgets.current?.setStatus(widget.id, widget.status);
        existing.x = widget.x;
        existing.y = widget.y;
        widgets.current?.resize(
          widget.id,
          widget.w,
          widget.h,
          widget.contentW,
          widget.contentH,
          widget.userResized,
          widget.resizeMode
        );
        return;
      }
      widgets.current?.add(widget);
    }

    // AI/draft rect erases bypass strokeSegment — push them onto the wire explicitly.
    draft.setInkListener((op) => {
      if (sm.isRemote) return;
      sm.broadcast({ type: "SYNC_INK_ERASE", x: op.rect.x, y: op.rect.y, w: op.rect.w, h: op.rect.h });
    });

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
      // Snapshot restore draws tiles/images directly — do NOT hold the remote lock across awaits
      // or local strokes/AI/widgets broadcast during the restore window will be silently dropped.
      onInitState: (snapshot) => {
        if (!engine) return;
        void restoreSnapshot(engine, widgets.current, objects.current, snapshot);
      },
      onRemoteScene: (nextWidgets, nextObjects) => {
        if (!engine) return;
        // Empty SCENE = clear board (snapshot fan-out sends widgets as individual ADDs after).
        engine.tiles.clear();
        widgets.current?.clear();
        objects.current?.clear();
        void (async () => {
          for (const w of nextWidgets) {
            await hydrateAndAddRemoteWidget(w);
          }
          for (const obj of nextObjects) {
            const restored = await renderObject(engine, obj);
            if (restored) objects.current?.add(restored);
          }
          engine.requestRender();
        })();
      },
      onRemoteTiles: (tiles, done) => {
        if (!engine) return;
        void applyTiles(engine, tiles).then(() => {
          if (done) engine.requestRender();
        });
      },
      onRemoteStroke: (seg) => {
        if (!engine) return;
        // SyncManager.runRemote already wraps SYNC_STROKE_SEGMENT to suppress echo.
        strokeSegment(engine, seg.a, seg.b, {
          erase: seg.erase,
          size: seg.size,
          color: seg.color,
        });
      },
      onRemoteInkErase: (rect) => {
        if (!engine) return;
        eraseRegion(engine, rect);
      },
      onRemoteInkMove: (from, x, y, dataUrl) => {
        if (!engine) return;
        eraseRegion(engine, from);
        void pasteDataUrl(engine, dataUrl, x, y);
      },
      onRemoteObjectAdd: (obj) => {
        if (!engine || !objects.current) return;
        const existing = objects.current.get(obj.id);
        if (existing && existing.source === obj.source && existing.kind === obj.kind) {
          objects.current.setStatus(obj.id, obj.status);
          existing.x = obj.x;
          existing.y = obj.y;
          objects.current.resize(obj.id, obj.w, obj.h);
          return;
        }
        void renderObject(engine, obj).then((restored) => {
          if (restored) objects.current?.add(restored);
        });
      },
      onRemoteObjectMove: (id, x, y) => {
        const o = objects.current?.get(id);
        if (o && objects.current) {
          o.x = x;
          o.y = y;
          objects.current.sync();
        }
      },
      onRemoteObjectResize: (id, x, y, w, h) => {
        const o = objects.current?.get(id);
        if (o && objects.current) {
          o.x = x;
          o.y = y;
          objects.current.resize(id, w, h);
        }
      },
      onRemoteObjectRemove: (id) => {
        objects.current?.remove(id);
      },
      onRemoteObjectMerge: (id) => {
        void mergeObjectToInkRef.current(id, { silent: true });
      },
      onRemoteWidgetAdd: (w) => {
        void hydrateAndAddRemoteWidget(w);
      },
      onRemoteWidgetMove: (id, x, y, w, h, contentW, contentH, userResized, resizeMode) => {
        const currentItem = widgets.current?.get(id);
        if (!currentItem || !widgets.current) return;
        // Apply absolute geometry from the peer — do not interpret as a local resize gesture.
        currentItem.x = x;
        currentItem.y = y;
        widgets.current.resize(
          id,
          w,
          h,
          contentW,
          contentH,
          userResized ?? currentItem.userResized,
          resizeMode ?? currentItem.resizeMode,
        );
      },
      onRemoteWidgetRemove: (id) => {
        widgets.current?.remove(id);
      },
      onRemoteClear: () => {
        engine.tiles.clear();
        engine.requestRender();
        widgets.current?.clear();
        objects.current?.clear();
      },
    });

    tm.selection.setInkListener((op) => {
      if (sm.isRemote) return;
      if (op.kind === "erase") {
        sm.broadcast({ type: "SYNC_INK_ERASE", x: op.rect.x, y: op.rect.y, w: op.rect.w, h: op.rect.h });
      } else {
        sm.broadcast({
          type: "SYNC_INK_MOVE",
          from: op.from,
          x: op.to.x,
          y: op.to.y,
          w: op.to.w,
          h: op.to.h,
          dataUrl: op.dataUrl,
        });
      }
    });

    void sm.restoreSession().then((restored) => {
      if (restored) {
        const session = getStoredP2PSession();
        if (session?.role === "joiner") {
          toast.info(`Reconnecting to P2P session ${session.roomCode}…`);
        } else if (session?.role === "host") {
          toast.info(`Re-hosting P2P session ${session.roomCode}…`);
        }
      }
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

    const cs = new CloudSyncEngine({
      onStatusChange: (st) => setCloudStatus(st),
      isBusy: () => isCanvasBusyRef.current(),
      isAuthenticated: isAuthenticatedRef.current,
    });
    cloudSync.current = cs;

    return () => {
      unsub();
      unsubRemoteCursors();
      engine.setStrokeSegmentHook(null);
      tm.selection.setInkListener(null);
      draft.setInkListener(null);
      sm.disconnect();
      syncManager.current = null;
      cs.destroy();
      cloudSync.current = null;
      engine.setTileWriteHook(null);
      wm.destroy();
      om.destroy();
      tools.current = null;
      widgets.current = null;
      objects.current = null;
      drafts.current = null;
      history.current = null;
      agent.cancel();
      conductorRef.current = null;
      setAgentRunning(false);
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      // Joiners receive the host SCENE+TILES snapshot — applying local autosave after that
      // (or racing it) leaves peers on divergent boards.
      const session = getStoredP2PSession();
      if (session?.role === "joiner") return;

      // 1. Hot Path: Instant load from local IndexedDB cache
      const localSaved = await loadAutosave();
      if (localSaved && !cancelled) {
        await restoreSnapshot(engine, widgets.current, objects.current, localSaved);
        history.current?.reset();
      }

      // 2. Cold Path: Asynchronously check and sync with Neon Cloud DB only if authenticated
      if (isAuthenticated) {
        try {
          const cloudRes = await fetchCloudCanvas();
          if (cancelled) return;
          if (cloudRes?.data) {
            const cloudSavedAt = cloudRes.savedAt || 0;
            const localSavedAt = localSaved?.savedAt || 0;
            const cloudHash = computeSnapshotHash(cloudRes.data);
            const localHash = computeSnapshotHash(localSaved);

            if (cloudHash === localHash) {
              // Already completely in sync! Mark clean so tab switches don't trigger saves
              cloudSync.current?.setLastSyncedHash(cloudHash);
            } else if (cloudSavedAt > localSavedAt) {
              await restoreSnapshot(engine, widgets.current, objects.current, cloudRes.data);
              history.current?.reset();
              void saveAutosave(cloudRes.data);
              cloudSync.current?.setLastSyncedHash(cloudHash);
            } else if (localSaved && localSavedAt > cloudSavedAt) {
              cloudSync.current?.setLastSyncedHash(cloudHash);
              cloudSync.current?.scheduleCloudSync(localSaved, 3000);
            }
          } else if (localSaved) {
            cloudSync.current?.scheduleCloudSync(localSaved, 3000);
          }
        } catch (err) {
          console.warn("Cloud sync initial resolution:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, isAuthenticated]);


  useEffect(() => {
    tools.current?.setMode(mode);
    widgets.current?.setMode(mode);
    objects.current?.setMode(mode);
    if (mode === "hand") {
      widgets.current?.setSelected(null);
      objects.current?.setSelected(null);
    }
  }, [mode, engine]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "drawva-widget-wheel") return;
      if (engine) {
        let screenX = window.innerWidth / 2;
        let screenY = window.innerHeight / 2;
        if (typeof e.data.clientX === "number" && typeof e.data.clientY === "number") {
          screenX = e.data.clientX;
          screenY = e.data.clientY;
        }
        engine.camera.handleWheel({
          clientX: screenX,
          clientY: screenY,
          deltaX: typeof e.data.deltaX === "number" ? e.data.deltaX : 0,
          deltaY: typeof e.data.deltaY === "number" ? e.data.deltaY : 0,
          ctrlKey: !!e.data.ctrlKey,
          metaKey: !!e.data.metaKey,
          deltaMode: typeof e.data.deltaMode === "number" ? e.data.deltaMode : 0,
        });
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
    const item: WidgetItem = {
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
    };
    wm.add(item);
    syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
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
      const screenFontSize = 18;
      const fontSize = Math.max(12, Math.round(screenFontSize / scale));
      const screenMaxWidth = 540;
      const maxWidth = Math.max(fontSize * 4, Math.round(screenMaxWidth / scale));
      const block = renderTextBlock(textValue, color, fontSize, maxWidth);
      addObjectRef.current({
        id: `obj-text-${Date.now()}`,
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
      const textBox = { x: textAnchor.x, y: textAnchor.y, w: block.w, h: block.h };
      const now = Date.now();
      if (inkBoxRef.current && now - lastStrokeTimeRef.current < 25000) {
        inkBoxRef.current = unionRect(inkBoxRef.current, textBox);
      } else {
        inkBoxRef.current = textBox;
      }
      lastStrokeTimeRef.current = now;
      afterBoardChangeRef.current();
      if (appState.autoOn) scheduleAi(inkBoxRef.current);
    }
    setTextOpen(false);
    setTextValue("");
    setTextAnchor(null);
  }, [engine, textAnchor, textValue, color, scheduleAi]);

  const isTidyingRef = useRef(false);

  const handleTidy = useCallback(() => {
    if (isTidyingRef.current) return;
    if (appState.aiStatus === "thinking") return;
    if (
      widgetDrag.current !== null ||
      widgetResize.current !== null ||
      objectDrag.current !== null ||
      objectResize.current !== null ||
      textAnchor !== null
    ) {
      return;
    }

    const eng = engine;
    const wm = widgets.current;
    const om = objects.current;
    if (!eng || !wm || !om) return;

    isTidyingRef.current = true;
    try {
      const visibleRect = eng.visibleRect();
      const inkRect = inkBoxRef.current ? { ...inkBoxRef.current } : null;

      const pendingDrafts: Rect[] = [];
      if (drafts.current?.hasPending) {
        for (const cmd of drafts.current.getPending()) {
          const c = cmd as { x?: number; y?: number; w?: number; h?: number };
          if (typeof c.x === "number" && typeof c.y === "number") {
            pendingDrafts.push({
              x: Math.round(c.x),
              y: Math.round(c.y),
              w: Math.round(c.w || 200),
              h: Math.round(c.h || 100),
            });
          }
        }
      }

      const result = computeTidyMoves({
        widgets: wm.all(),
        objects: om.all(),
        visibleRect,
        inkRect,
        pendingDrafts,
      });

      if (!result || result.moves.length === 0) {
        if (result && result.skippedLocked > 0) {
          toast(result.skippedLocked === 1 ? "Skipped 1 locked item" : `Skipped ${result.skippedLocked} locked items`);
        } else {
          toast("Nothing to tidy");
        }
        return;
      }

      // Single undo entry pattern: snapshot before mutations
      history.current?.recordObjects();
      history.current?.recordWidgets();

      for (const move of result.moves) {
        if (move.kind === "widget") {
          const item = wm.get(move.id);
          if (item) {
            const dx = move.x - item.x;
            const dy = move.y - item.y;
            wm.move(move.id, dx, dy);
            syncManager.current?.broadcast({
              type: "SYNC_WIDGET_MOVE",
              id: move.id,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
              contentW: item.contentW,
              contentH: item.contentH,
              userResized: item.userResized,
              resizeMode: item.resizeMode,
            });
          }
        } else {
          const item = om.get(move.id);
          if (item) {
            const dx = move.x - item.x;
            const dy = move.y - item.y;
            om.move(move.id, dx, dy);
            syncManager.current?.broadcast({
              type: "SYNC_OBJECT_MOVE",
              id: move.id,
              x: item.x,
              y: item.y,
            });
          }
        }
      }

      eng.requestRender();
      afterBoardChangeRef.current();

      if (result.cappedAt150) {
        toast(`Tidied 150 of ${result.totalCandidates}`);
      } else {
        toast(`Tidied ${result.movedCount} item${result.movedCount > 1 ? "s" : ""}`);
      }
      if (result.skippedLocked > 0) {
        toast(result.skippedLocked === 1 ? "Skipped 1 locked item" : `Skipped ${result.skippedLocked} locked items`);
      }
      if (result.partialFailures > 0) {
        toast(`Could not place ${result.partialFailures} item${result.partialFailures > 1 ? "s" : ""} (no space)`);
      }
    } finally {
      isTidyingRef.current = false;
    }
  }, [engine, textAnchor]);

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
        const tm = tools.current;
        if (tm?.selection.hasSelection) {
          tm.deleteSelection();
        } else {
          const wid = widgets.current?.getSelectedId();
          const oid = objects.current?.getSelectedId();
          if (wid) {
            history.current?.recordWidgets();
            widgets.current?.remove(wid);
            syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: wid });
          } else if (oid) {
            history.current?.recordObjects();
            objects.current?.remove(oid);
            syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id: oid });
          }
        }
        afterBoardChangeRef.current();
        e.preventDefault();
      } else if (k === "escape") {
        tools.current?.clearSelection();
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
    }
    if (mode === "text") {
      setTextAnchor(world);
      setTextValue("");
      setTextOpen(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    tm.begin(gestureEvent(e));
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
        const eraserBox = { ...drawingRef.current };
        drawingRef.current = null;
        const hasErased = eraserBox.w > 1 || eraserBox.h > 1 || changed;
        if (hasErased && !changed) afterBoardChange();
      } else {
        const isDrawing = ["pen", "highlighter", "rect", "ellipse", "arrow"].includes(mode);
        if (isDrawing) {
          const singleStrokeBox = { ...drawingRef.current };
          drawingRef.current = null;
          const hasDrawn = singleStrokeBox.w > 1 || singleStrokeBox.h > 1 || changed;
          if (hasDrawn) {
            const now = Date.now();
            if (
              inkBoxRef.current &&
              now - lastStrokeTimeRef.current < 25000
            ) {
              inkBoxRef.current = unionRect(inkBoxRef.current, singleStrokeBox);
            } else {
              inkBoxRef.current = singleStrokeBox;
            }
            lastStrokeTimeRef.current = now;
            const currentInkBox = { ...inkBoxRef.current };
            if (!changed) afterBoardChange();
            if (appState.autoOn) scheduleAi(currentInkBox);
          }
        } else {
          drawingRef.current = null;
        }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!engine) return;
    e.preventDefault();
    engine.camera.handleWheel(e.nativeEvent);
    engine.requestRender();
  };

  const fileRef = useRef<HTMLInputElement | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (engine && f) {
      const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
      try {
        const placed = await placeImageAt(engine, f, c);
        // Paste-only ink op: empty erase rect, peers apply the bitmap at (x, y).
        syncManager.current?.broadcast({
          type: "SYNC_INK_MOVE",
          from: { x: placed.x, y: placed.y, w: 0, h: 0 },
          x: placed.x,
          y: placed.y,
          w: placed.w,
          h: placed.h,
          dataUrl: placed.dataUrl,
        });
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
        onAskAi={handleAskAi}
        agentRunning={agentRunning}
        models={models}
        activeModel={activeModel}
        onModelChange={handleModelChange}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={handleReasoningEffortChange}
        onOpenModelSelect={() => setModelSelectOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        syncStatus={syncState.status}
        syncRoomCode={syncState.roomCode}
        syncPeerCount={syncState.peerCount}
        onOpenConnect={() => setConnectOpen(true)}
        onOpenLogs={() => setLogsOpen(true)}
        onOpenManual={() => setManualOpen(true)}
        onTidy={handleTidy}
        cloudStatus={cloudStatus}
        onTriggerCloudSync={() => void cloudSync.current?.flush()}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        <div
          ref={gestureOverlayRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
            className="absolute z-30 min-w-72 max-w-xl resize border-2 border-primary/60 bg-background/95 shadow-lg rounded-lg p-3"
            style={{
              left: anchorCss.x,
              top: anchorCss.y,
              fontSize: 18,
              lineHeight: 1.4,
              color,
            }}
          />
        )}
      </div>

      <CanvasFooter
        onZoomIn={() => zoomBy(-100)}
        onZoomOut={() => zoomBy(100)}
        onReset={resetView}
        tickerState={tickerState}
        onOpenLogs={() => setLogsOpen(true)}
      />

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

      <MobileOrientationPrompt />

      <ModelSelectDialog
        open={modelSelectOpen}
        onOpenChange={setModelSelectOpen}
        models={models}
        activeModel={activeModel}
        onSelectModel={handleModelChange}
        onOpenSettings={() => {
          setModelSelectOpen(false);
          setSettingsOpen(true);
        }}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        logs={logs}
        log={logs[0] || null}
        onClearLogs={() => setLogs([])}
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
      <UserManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
      />
    </div>
  );
}
