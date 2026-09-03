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
import { AGENT_MAX_STEPS_PER_TURN } from "@/lib/ai/agentTools";
import { SettingsDialog } from "./SettingsDialog";
import { ModelSelectDialog } from "./ModelSelectDialog";
import { LogsDialog } from "./LogsDialog";
import { UserManualDialog } from "./UserManualDialog";
import { CanvasFooter, type GenerationTickerState } from "./CanvasFooter";
import { WidgetManager, type WidgetItem } from "@/lib/canvas/widgets";
import { ObjectManager, type ObjectItem } from "@/lib/canvas/objects";
import { diagramDocument, copyLabel } from "@/lib/canvas/diagram";
import { renderFormula, bakeFormula } from "@/lib/canvas/formulas";
import { bakePlot, plotCommand } from "@/lib/canvas/plotter";
import { unionRect } from "@/lib/canvas/engine";
import { serializeSnapshot, restoreSnapshot, saveAutosave, loadAutosave, exportPng, exportJson, importJson, renderObject, applyTiles, computeSnapshotHash, loadAgentLogs, clearAgentLogs, getAutosaveEnabled } from "@/lib/canvas/persistence";
import {
  CloudSyncEngine,
  fetchCloudCanvas,
  type CloudSyncStatus,
} from "@/lib/canvas/cloudSync";
import { useSession } from "@/lib/auth-client";
import { BoardHistory } from "@/lib/canvas/history";
import { boardFingerprint } from "@/lib/canvas/fingerprint";
import { computeTidyMoves } from "@/lib/canvas/tidy";
import { resizeWidgetGeometry } from "@/lib/canvas/widgetGeometry";
import type { AiLogEntry } from "@/lib/ai/types";
import type { PlotFunctionCommand, EraseCommand } from "@/lib/canvas/commands";
import type { Point, Rect, CanvasMode } from "@/lib/canvas/types";
import {
  getActiveModel,
  getCachedModels,
  getProviderConfig,
  setActiveModel,
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
import { GeometryInspectorDialog, type ElementGeometryData } from "./GeometryInspectorDialog";
import { MobileOrientationPrompt } from "./MobileOrientationPrompt";
import { strokeSegment } from "@/lib/canvas/strokes";
import { eraseRegion, eraseContainedInk, pasteDataUrl, captureRegion, pasteRegion } from "@/lib/canvas/selection";
import {
  buildRefinementManifest,
  validateRefinementTarget,
  canvasFromDataUrl,
  encodeCanvas,
  markSelectionOnCanvas,
  samplePalette,
} from "@/lib/canvas/refinement";
import { applyWidgetPatch } from "@/lib/canvas/widgetPatch";
import { buildAtlas } from "@/lib/canvas/atlas";
import { resolveThemeColor } from "@/lib/canvas/theme";
import type { RefinementManifest } from "@/lib/canvas/refinement";

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

function fnv1aHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Bound a live stream tail for ticker state: collapse whitespace, keep the newest ~320 chars. */
function tickerTail(text: string, max = 320): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(-max) : clean;
}

function computeOptimalTextFontSize(
  text: string,
  rect: { w: number; h: number },
  requestedFontSize?: number
): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const numLines = Math.max(1, lines.length);
  const maxChars = Math.max(1, ...lines.map((l) => l.length));

  // Natural font size to fit handwriting proportionally within selection bounds:
  const heightBased = (rect.h * 0.68) / (numLines * 1.35);
  const widthBased = (rect.w * 0.92) / (maxChars * 0.62);
  const naturalSize = Math.max(18, Math.min(heightBased, widthBased));

  // If LLM returned a tiny generic size (< 24), use naturalSize:
  if (!requestedFontSize || requestedFontSize < 24) {
    return Math.round(naturalSize);
  }

  // If LLM specified a custom size, clamp it to fit the box without overflowing:
  return Math.round(Math.min(requestedFontSize, naturalSize * 1.25));
}

interface RefineStroke {
  points: { x: number; y: number }[];
  color?: string;
  width?: number;
}
interface RefineText {
  text: string;
  normX?: number;
  normY?: number;
  fontSize?: number;
  color?: string;
}
interface RefineFormula {
  latex: string;
  normX?: number;
  normY?: number;
  fontSize?: number;
  color?: string;
}
type RefineResult =
  | { kind: "widget_patch"; targetId: string; expectedContentHash: string; patch: string }
  | { kind: "native_canvas"; strokes?: RefineStroke[]; texts?: RefineText[]; formulas?: RefineFormula[] }
  | { kind: "diagram_widget"; sourceFormat: string; source: string; title: string }
  | { kind: "html_widget"; html: string; title: string }
  | { kind: "reject"; reason: string };

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

  const mergeObjectToInk = useCallback(async (id: string, opts?: { silent?: boolean }): Promise<void> => {
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
  }, [engine]);

  const buildElementData = useCallback((id: string, sourceType?: "widget" | "object"): ElementGeometryData | null => {
    if (!sourceType || sourceType === "widget") {
      const w = widgets.current?.get(id);
      if (w) {
        return {
          id: w.id,
          sourceType: "widget",
          tool: w.kind === "diagram" ? "diagram_source" : "html_widget",
          x: Math.round(w.x),
          y: Math.round(w.y),
          w: Math.round(w.w),
          h: Math.round(w.h),
          contentW: Math.round(w.contentW || w.w),
          contentH: Math.round(w.contentH || w.h),
          title: w.title,
          pluginId: w.pluginId,
          sourceFormat: w.sourceFormat,
          status: w.status,
          payload: w.html || w.copyText || "",
          timestamp: w.createdAt || Date.now(),
        };
      }
    }
    if (!sourceType || sourceType === "object") {
      const o = objects.current?.get(id);
      if (o) {
        const toolMap: Record<string, string> = {
          text: "write_text",
          formula: "draw_formula",
          plot: "plot_function",
          animation: "animate_scene",
        };
        return {
          id: o.id,
          sourceType: "object",
          tool: toolMap[o.kind] || o.kind,
          x: Math.round(o.x),
          y: Math.round(o.y),
          w: Math.round(o.w),
          h: Math.round(o.h),
          contentW: Math.round(o.contentW || o.w),
          contentH: Math.round(o.contentH || o.h),
          fontSize: o.fontSize,
          maxWidth: o.maxWidth,
          color: o.color,
          status: o.status,
          payload: o.source,
          timestamp: Date.now(),
        };
      }
    }
    return null;
  }, []);

  const addObjectRef = useRef(addObject);
  const mergeObjectToInkRef = useRef(mergeObjectToInk);
  const buildElementDataRef = useRef<(id: string, sourceType?: "widget" | "object") => ElementGeometryData | null>(() => null);
  const setSelectedElementRef = useRef<React.Dispatch<React.SetStateAction<ElementGeometryData | null>>>(() => {});
  useEffect(() => {
    addObjectRef.current = addObject;
    mergeObjectToInkRef.current = mergeObjectToInk;
    buildElementDataRef.current = buildElementData;
    setSelectedElementRef.current = setSelectedElement;
  }, [addObject, mergeObjectToInk, buildElementData]);

  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Random epoch seed: a reload must never collide with revision numbers
  // referenced by the persisted agent conversation (stale refs then conflict
  // loudly instead of silently passing).
  const boardRevisionRef = useRef(Math.floor(Math.random() * 1e9));
  // Raster-mutation counter. The revision counter cannot tell "ink changed"
  // from "a handler fired"; this one only advances on real tile writes, so the
  // board fingerprint can detect ink edits without hashing every tile bitmap.
  const inkEpochRef = useRef(0);
  /** caller frame → bump count, cumulative for the session. See bumpRevision(). */
  const revisionAuditRef = useRef(new Map<string, number>());
  const conductorRef = useRef<Conductor | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);

  // --- Refine feature state ---
  const [refineRect, setRefineRect] = useState<Rect | null>(null);
  const [refineState, setRefineState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const refineStateRef = useRef(refineState);
  useEffect(() => {
    refineStateRef.current = refineState;
  }, [refineState]);
  const refineOpRef = useRef<{ id: string; abort: AbortController } | null>(null);
  const inkSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const refreshRefineRectRef = useRef<() => void>(() => {});
  const inkBoxRef = useRef<Rect | null>(null);
  /** Trigger-cause box captured at scheduleAi time — the live ref may be stale by turn start. */
  const scheduledInkBoxRef = useRef<Rect | null>(null);
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
  // Reload durable (redacted) agent traces from IndexedDB so debugging
  // survives reloads; fresh turns from this session unshift on top.
  useEffect(() => {
    let cancelled = false;
    void loadAgentLogs().then((saved) => {
      if (!cancelled && saved && saved.length > 0) {
        setLogs((prev) => (prev.length > 0 ? [...saved, ...prev].slice(0, 20) : saved.slice(0, 20)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementGeometryData | null>(null);
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

  const getAllElements = useCallback((): ElementGeometryData[] => {
    const list: ElementGeometryData[] = [];
    if (widgets.current) {
      for (const w of widgets.current.getAll()) {
        list.push({
          id: w.id,
          sourceType: "widget",
          tool: w.kind === "diagram" ? "diagram_source" : "html_widget",
          x: Math.round(w.x),
          y: Math.round(w.y),
          w: Math.round(w.w),
          h: Math.round(w.h),
          contentW: Math.round(w.contentW || w.w),
          contentH: Math.round(w.contentH || w.h),
          title: w.title,
          pluginId: w.pluginId,
          sourceFormat: w.sourceFormat,
          status: w.status,
          payload: w.html || w.copyText || "",
          timestamp: w.createdAt || Date.now(),
        });
      }
    }
    if (objects.current) {
      const toolMap: Record<string, string> = {
        text: "write_text",
        formula: "draw_formula",
        plot: "plot_function",
        animation: "animate_scene",
      };
      for (const o of objects.current.getAll()) {
        list.push({
          id: o.id,
          sourceType: "object",
          tool: toolMap[o.kind] || o.kind,
          x: Math.round(o.x),
          y: Math.round(o.y),
          w: Math.round(o.w),
          h: Math.round(o.h),
          contentW: Math.round(o.contentW || o.w),
          contentH: Math.round(o.contentH || o.h),
          fontSize: o.fontSize,
          maxWidth: o.maxWidth,
          color: o.color,
          status: o.status,
          payload: o.source,
          timestamp: Date.now(),
        });
      }
    }
    if (selectedElement && selectedElement.sourceType === "selection") {
      list.push(selectedElement);
    }
    return list;
  }, [selectedElement]);

  const handleSelectElement = useCallback((id: string, sourceType?: "widget" | "object" | "selection") => {
    setMode("select");
    const effSourceType = sourceType ?? (widgets.current?.get(id) ? "widget" : objects.current?.get(id) ? "object" : "selection");
    if (effSourceType === "widget") {
      widgets.current?.setMode("select");
      objects.current?.setSelected(null);
      widgets.current?.setSelected(id);
      const data = buildElementData(id, "widget");
      if (data) setSelectedElement(data);
    } else if (effSourceType === "object") {
      objects.current?.setMode("select");
      widgets.current?.setSelected(null);
      objects.current?.setSelected(id);
      const data = buildElementData(id, "object");
      if (data) setSelectedElement(data);
    } else {
      widgets.current?.setSelected(null);
      objects.current?.setSelected(null);
      const all = getAllElements();
      const found = all.find((e) => e.id === id);
      if (found) setSelectedElement(found);
    }
  }, [buildElementData, getAllElements]);

  const handleFocusElement = useCallback((el: ElementGeometryData) => {
    if (!engine) return;
    engine.camera.centerOnBox({ x: el.x, y: el.y, w: el.w, h: el.h }, 100);
    engine.requestRender();
    handleSelectElement(el.id, el.sourceType);
  }, [engine, handleSelectElement]);

  const [aiRun, setAiRun] = useState<AiRunState>({
    phase: "idle",
    activeProvider: null,
    doneProvider: null,
  });

  const handleConductorEvent = useCallback((e: ConductorEvent) => {
    if (e.kind === "turn_start") {
      // Fold the schedule-time trigger box into the live ref (consumed once so
      // mid-turn applies keep reading fresh unions, not a stale snapshot).
      if (scheduledInkBoxRef.current) {
        inkBoxRef.current = inkBoxRef.current
          ? unionRect(inkBoxRef.current, scheduledInkBoxRef.current)
          : scheduledInkBoxRef.current;
        scheduledInkBoxRef.current = null;
      }
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
        detail: undefined,
      }));
    } else if (e.kind === "step_start") {
      setAiStatus("thinking");
      setTickerState((prev) => ({
        status: "running",
        currentMessage: `Reasoning step ${e.stepNumber}/${AGENT_MAX_STEPS_PER_TURN}…`,
        messageId: prev.messageId + 1,
        detail: undefined,
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
        detail: e.argsSummary ? tickerTail(e.argsSummary) : undefined,
      }));
    } else if (e.kind === "tool_end") {
      const summaryText = e.ok ? `Done: ${e.summary || e.name}` : `Failed: ${e.name}`;
      setTickerState((prev) => ({
        status: "running",
        currentMessage: summaryText,
        messageId: prev.messageId + 1,
        detail: undefined,
      }));
    } else if (e.kind === "text_delta" || e.kind === "reasoning_delta") {
      const label = e.kind === "text_delta" ? "Composing response…" : "Reasoning…";
      setTickerState((prev) => ({
        status: "running",
        currentMessage: label,
        messageId: prev.currentMessage === label ? prev.messageId : prev.messageId + 1,
        detail: tickerTail(`${prev.currentMessage === label ? prev.detail || "" : ""}${e.text}`),
      }));
    } else if (e.kind === "compact") {
      setTickerState((prev) => ({
        status: "running",
        currentMessage: "Compacting context…",
        messageId: prev.messageId + 1,
        detail: undefined,
      }));
    } else if (e.kind === "compact_failed") {
      setTickerState((prev) => ({
        status: "running",
        currentMessage: `Context compaction failed — history kept intact (${e.message.slice(0, 80)})`,
        messageId: prev.messageId + 1,
      }));
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
          detail: e.message ? tickerTail(e.message) : undefined,
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
          detail: undefined,
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
    if (!config || !model || !config.apiKey) {
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
      detail: undefined,
    }));

    const prompt =
      "Observe the canvas handwriting, formulas, diagrams, questions, and drawings. Provide the appropriate continuation, solution, calculation, diagram, or interactive widget.";
    void agent.send(prompt);
  }, []);

  const captureRegionForRefine = useCallback(
    (rect: Rect): HTMLCanvasElement | null => {
      if (!engine) return null;
      return captureRegion(engine, rect);
    },
    [engine]
  );
  const captureRegionRef = useRef(captureRegionForRefine);
  useEffect(() => {
    captureRegionRef.current = captureRegionForRefine;
  });

  const runRefine = useCallback(async () => {
    const eng = engine;
    const tm = tools.current;
    if (!eng || !tm) return;
    const selRect = refineRect;
    if (!selRect || refineState === "loading") return;

    const config = getProviderConfig();
    const model = getActiveModel();
    if (!config || !model || !config.apiKey) {
      setSettingsOpen(true);
      toast.info("Please configure an AI provider and select a model.");
      return;
    }

    const inkSnapshot = inkSnapshotRef.current;
    const manifest = buildRefinementManifest(
      selRect,
      boardRevisionRef.current,
      widgets.current,
      objects.current,
      inkSnapshot
    );
    const targetError = validateRefinementTarget(manifest);
    if (targetError) {
      toast.error(targetError);
      return;
    }
    if (!manifest.inkPresent && manifest.containedWidgets.length === 0) {
      toast.error("Nothing to refine in this selection.");
      return;
    }

    const opId = `refine-${Date.now()}`;
    const abort = new AbortController();
    refineOpRef.current = { id: opId, abort };
    setRefineState("loading");

    const timeoutTimer = setTimeout(() => {
      if (refineOpRef.current?.id === opId) {
        abort.abort();
        toast.error("Refinement timed out (45s). Your AI provider took too long to respond.");
      }
    }, 45000);

    try {
      // 1. Capture crop with padding (context, not mutation area).
      const pad = Math.min(160, Math.max(selRect.w, selRect.h) * 0.25);
      const cropRect: Rect = {
        x: selRect.x - pad,
        y: selRect.y - pad,
        w: selRect.w + pad * 2,
        h: selRect.h + pad * 2,
      };
      const atlas = await buildAtlas(eng, cropRect, null, widgets.current, objects.current, {
        captureFullViewport: true,
      });
      if (refineOpRef.current?.id !== opId) return;
      const raw = await canvasFromDataUrl(atlas.atlasImage);
      if (refineOpRef.current?.id !== opId) return;
      markSelectionOnCanvas(raw, atlas.sourceRect, selRect, atlas.imageScale);
      const cropDataUrl = encodeCanvas(raw);

      // 2. Build request body.
      const targetWidget = manifest.containedWidgets[0];
      let target: Record<string, unknown> | undefined;
      if (targetWidget) {
        const source = targetWidget.kind === "diagram" ? targetWidget.copyText || "" : targetWidget.html || "";
        target = {
          id: targetWidget.id,
          kind: targetWidget.kind,
          sourceFormat: targetWidget.sourceFormat,
          box: { x: targetWidget.x, y: targetWidget.y, w: targetWidget.w, h: targetWidget.h },
          source: source.slice(0, 8000),
          html: targetWidget.kind === "html" ? (targetWidget.html || "").slice(0, 8000) : undefined,
          contentHash: fnv1aHash(source),
        };
      } else if (manifest.containedObjects.length > 0 && !manifest.inkPresent) {
        const o = manifest.containedObjects[0];
        target = {
          id: o.id,
          kind: o.kind,
          box: { x: o.x, y: o.y, w: o.w, h: o.h },
          source: (o.source || "").slice(0, 4000),
        };
      }
      const palette = samplePalette(inkSnapshot);

      // 3. Call refine API.
      const res = await fetch("/api/canvas/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerType: config.type,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          cropDataUrl,
          selectionRect: selRect,
          imageScale: atlas.imageScale,
          baseRevision: boardRevisionRef.current,
          fingerprint: manifest.fingerprint,
          target,
          containedItems: [
            ...manifest.containedWidgets.map((w) => ({ id: w.id, kind: w.kind, x: w.x, y: w.y, w: w.w, h: w.h })),
            ...manifest.containedObjects.map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h })),
          ],
          nearbyItems: manifest.contextItems.slice(0, 10),
          palette,
        }),
        signal: abort.signal,
      });
      if (refineOpRef.current?.id !== opId) return;
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Refine request failed (${res.status}).`);
      }
      const data = (await res.json()) as { ok: boolean; result?: RefineResult; error?: string };
      if (!data.ok || !data.result) throw new Error(data.error || "Refinement returned no result.");
      const result = data.result;

      // 4. Preflight & apply.
      const applied = await applyRefinement(manifest, result, opId);
      if (applied) {
        setRefineState("success");
        setTimeout(() => setRefineState((prev) => (prev === "success" ? "idle" : prev)), 2000);
      } else if (refineOpRef.current?.id === opId) {
        setRefineState("idle");
      }
    } catch (err) {
      if (refineOpRef.current?.id !== opId) return;
      if (abort.signal.aborted) {
        setRefineState("idle");
        return;
      }
      setRefineState("error");
      toast.error(err instanceof Error ? err.message : "Refinement failed.");
      setTimeout(() => setRefineState((prev) => (prev === "error" ? "idle" : prev)), 3000);
    } finally {
      clearTimeout(timeoutTimer);
      if (refineOpRef.current?.id === opId) refineOpRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, refineRect, refineState]);

  const cancelRefine = useCallback(() => {
    refineOpRef.current?.abort.abort();
    refineOpRef.current = null;
    setRefineState("idle");
  }, []);

  /** Preflight all fallible work, then mutate the board in one pass. Returns true if applied. */
  const applyRefinement = useCallback(
    async (manifest: RefinementManifest, result: RefineResult, opId: string): Promise<boolean> => {
      const eng = engine;
      const wm = widgets.current;
      const om = objects.current;
      const hist = history.current;
      if (!eng || !wm || !om || !hist) return false;

      if (result.kind === "reject") {
        toast.info(result.reason || "AI could not refine this selection.");
        return false;
      }

      // Rebuild manifest and verify the region hasn't changed mid-request.
      const fresh = buildRefinementManifest(
        manifest.rect,
        boardRevisionRef.current,
        widgets.current,
        objects.current,
        inkSnapshotRef.current
      );
      if (fresh.fingerprint !== manifest.fingerprint) {
        toast.error("This selection changed while it was being refined. Nothing was replaced.");
        return false;
      }

      // --- Preflight per result kind (all fallible work BEFORE any mutation). ---
      let preparedHtml: string | null = null;
      let preparedCopyText: string | undefined;
      let widgetToPatch: WidgetItem | null = null;

      if (result.kind === "widget_patch") {
        if (manifest.containedWidgets.length !== 1 || manifest.containedWidgets[0].id !== result.targetId) {
          toast.error("Refinement target mismatch. Nothing was replaced.");
          return false;
        }
        widgetToPatch = manifest.containedWidgets[0];
        const source = widgetToPatch.kind === "diagram" ? widgetToPatch.copyText || widgetToPatch.html || "" : widgetToPatch.html || "";
        if (result.expectedContentHash && result.expectedContentHash !== fnv1aHash(source)) {
          toast.error("Widget content changed since capture. Nothing was replaced.");
          return false;
        }
        const patchResult = applyWidgetPatch(source, result.patch);
        if (!patchResult.ok) {
          toast.error(`Patch failed: ${patchResult.message}`);
          return false;
        }
        if (widgetToPatch.kind === "diagram" && widgetToPatch.sourceFormat) {
          try {
            const doc = await diagramDocument(widgetToPatch.sourceFormat, patchResult.content, widgetToPatch.diagramKind, widgetToPatch.title);
            preparedHtml = typeof doc === "string" ? doc : doc.html;
            preparedCopyText = patchResult.content;
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Diagram rebuild failed. Nothing was replaced.");
            return false;
          }
        } else {
          preparedHtml = patchResult.content;
        }
      }

      // Final cancellation check before mutating.
      if (refineOpRef.current?.id !== opId) return false;

      // --- Apply (one history transaction via afterBoardChange). ---
      const rect = manifest.rect;
      hist.captureRect(rect);
      if (widgetToPatch) hist.recordWidgets();
      if (manifest.containedObjects.length > 0) hist.recordObjects();

      // A. Erase ink in the rect (selective: preserves touching outside context/arrows).
      eraseContainedInk(eng, rect);
      syncManager.current?.broadcast({ type: "SYNC_INK_ERASE", ...rect });

      // B. Remove contained items only for non-patch kinds.
      const removeWidgetIds: string[] = [];
      const removeObjectIds: string[] = [];
      if (result.kind !== "widget_patch") {
        for (const o of manifest.containedObjects) removeObjectIds.push(o.id);
        for (const w of manifest.containedWidgets) removeWidgetIds.push(w.id);
      }

      // C. Add replacement content.
      try {
        if (result.kind === "widget_patch" && widgetToPatch && preparedHtml) {
          const next: WidgetItem = {
            ...widgetToPatch,
            html: preparedHtml,
            ...(preparedCopyText !== undefined ? { copyText: preparedCopyText } : {}),
          };
          wm.add(next);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(next) });
      } else if (result.kind === "native_canvas") {
        const strokes = result.strokes || [];
        const texts = result.texts || [];
        const formulas = result.formulas || [];
        if (strokes.length === 0 && texts.length === 0 && formulas.length === 0) {
          toast.error("AI returned empty refinement. Nothing was replaced.");
          return false;
        }
        // Raster paths cannot resolve var(), so the theme ink color is resolved
        // to a concrete value here and used whenever the model omits a color.
        const inkColor = resolveThemeColor("foreground", "#0f172a");
        for (const s of strokes) {
          const pts = s.points.map((p) => ({
            x: rect.x + p.x * rect.w,
            y: rect.y + p.y * rect.h,
          }));
          const strokeColor = s.color || inkColor;
          const strokeSize = s.width || 2;
          for (let i = 1; i < pts.length; i++) {
            strokeSegment(eng, pts[i - 1], pts[i], { erase: false, size: strokeSize, color: strokeColor });
          }
        }
        for (const t of texts) {
          const fontSize = computeOptimalTextFontSize(t.text, rect, t.fontSize);
          const textColor = t.color || inkColor;
          const block = renderTextBlock(t.text, textColor, fontSize, rect.w);
          let tx = Math.round(rect.x + (t.normX ?? 0) * rect.w);
          let ty = Math.round(rect.y + (t.normY ?? 0) * rect.h);
          if (t.normX === undefined || t.normX < 0.05) {
            tx = Math.round(rect.x + Math.max(0, (rect.w - block.w) / 2));
          }
          if (t.normY === undefined || t.normY < 0.05) {
            ty = Math.round(rect.y + Math.max(0, (rect.h - block.h) / 2));
          }
          pasteRegion(eng, block.canvas, tx, ty);
        }
        for (const f of formulas) {
          const fontSize = computeOptimalTextFontSize(f.latex, rect, f.fontSize);
          const formulaColor = f.color || inkColor;
          const rendered = await renderFormula(f.latex, fontSize, formulaColor);
          let fx = Math.round(rect.x + (f.normX ?? 0) * rect.w);
          let fy = Math.round(rect.y + (f.normY ?? 0) * rect.h);
          if (f.normX === undefined || f.normX < 0.05) {
            fx = Math.round(rect.x + Math.max(0, (rect.w - rendered.logicalWidth) / 2));
          }
          if (f.normY === undefined || f.normY < 0.05) {
            fy = Math.round(rect.y + Math.max(0, (rect.h - rendered.logicalHeight) / 2));
          }
          pasteRegion(eng, rendered.canvas, fx, fy);
        }
      } else if (result.kind === "diagram_widget") {
          const doc = await diagramDocument(result.sourceFormat, result.source, undefined, result.title);
          const html = typeof doc === "string" ? doc : doc.html;
          const base = manifest.containedWidgets[0] || manifest.containedObjects[0];
          const item: WidgetItem = {
            id: base?.id || `diagram-${Date.now()}`,
            kind: "diagram",
            pluginId: result.sourceFormat,
            sourceFormat: result.sourceFormat,
            x: base?.x ?? rect.x,
            y: base?.y ?? rect.y,
            w: base?.w ?? rect.w,
            h: base?.h ?? rect.h,
            contentW: base?.contentW ?? rect.w,
            contentH: base?.contentH ?? rect.h,
            title: result.title,
            html,
            copyText: result.source,
            copyLabel: copyLabel(result.sourceFormat),
            status: "draft",
            userResized: base && "userResized" in base ? base.userResized : false,
          };
          for (const id of removeWidgetIds) {
            wm.remove(id);
            syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id });
          }
          wm.add(item);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
        } else if (result.kind === "html_widget") {
          const base = manifest.containedWidgets[0] || manifest.containedObjects[0];
          const item: WidgetItem = {
            id: base?.id || `widget-${Date.now()}`,
            kind: "html",
            pluginId: "html",
            x: base?.x ?? rect.x,
            y: base?.y ?? rect.y,
            w: base?.w ?? rect.w,
            h: base?.h ?? rect.h,
            contentW: base?.contentW ?? rect.w,
            contentH: base?.contentH ?? rect.h,
            title: result.title,
            html: result.html,
            status: "draft",
            userResized: false,
          };
          for (const id of removeWidgetIds) {
            wm.remove(id);
            syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id });
          }
          wm.add(item);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
        }

        for (const id of removeObjectIds) {
          om.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id });
        }

        // Drop the selection so the old ink snapshot stops rendering over the new content.
        tools.current?.clearSelection();

        afterBoardChangeRef.current();
        return true;
      } catch (err) {
        // ponytail: best-effort undo rollback; if it fails, the committed entry stays
        // on the undo stack so manual Ctrl+Z still recovers.
        console.error("[refine] apply failed:", err);
        try {
          await hist.undo();
        } catch {}
        toast.error("Refinement failed to apply. Original content restored.");
        return false;
      }
    },
    [engine]
  );

  const scheduleAi = useCallback((box: Rect | null, userPrompt?: string) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    scheduledInkBoxRef.current = box ? { ...box } : null;
    aiTimer.current = setTimeout(() => {
      aiTimer.current = null;
      const agent = conductorRef.current;
      if (!agent) return;
      cloudSync.current?.cancel();
      const config = getProviderConfig();
      const model = getActiveModel();
      if (!config || !model || !config.apiKey) {
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
    // Attribution for the revision counter. Static reading of this file never
    // explained the +8/+17 bursts that appear between two agent steps with no
    // user input, so every bump tallies its caller frame; the turn log carries
    // the breakdown as `revisionBumps`.
    try {
      const frames = (new Error().stack ?? "").split("\n").slice(1);
      const caller = frames.find((f) => !f.includes("bumpRevision")) ?? "unknown";
      const key = caller.trim().replace(/^at\s+/, "").slice(0, 120);
      revisionAuditRef.current.set(key, (revisionAuditRef.current.get(key) ?? 0) + 1);
    } catch {}
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
    if (!getAutosaveEnabled()) return;
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      if (!getAutosaveEnabled()) return;
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

  useEffect(() => {
    const onStorage = () => {
      if (!getAutosaveEnabled() && autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    // Undo/redo restore tile bitmaps directly, bypassing the tile write hook.
    inkEpochRef.current += 1;
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
    inkEpochRef.current += 1;
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
    conductorRef.current?.clearHistory();
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
      conductorRef.current?.cancel();
      conductorRef.current?.clearHistory();
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
        onSelect: (id) => {
          om.setSelected(null);
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
        },
        onDragStart: (id, e) => {
          history.current?.recordWidgets();
          widgetDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
        },
        onDragMove: (id, e) => {
          const g = widgetDrag.current;
          if (!g || g.id !== id) return;
          const dx = (e.clientX - g.last.x) / engine.camera.scale;
          const dy = (e.clientY - g.last.y) / engine.camera.scale;
          wm.move(id, dx, dy);
          g.last = { x: e.clientX, y: e.clientY };
          const item = wm.get(id);
          if (item) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
        },
        onDragEnd: (id) => {
          // pointerup/pointercancel on the drag bar fires even when no drag was
          // in flight; bumping the revision there rejects the agent's next
          // mutation for a change that never happened.
          const wasDragging = widgetDrag.current?.id === id;
          widgetDrag.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
          if (wasDragging) afterBoardChangeRef.current();
        },
        onResizeStart: (id, mode, e) => {
          const item = wm.get(id);
          if (!item) return;
          history.current?.recordWidgets();
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
          const dx = (e.clientX - g.startPoint.x) / engine.camera.scale;
          const dy = (e.clientY - g.startPoint.y) / engine.camera.scale;
          const requestedW = g.startLayout.w + dx;
          const requestedH = g.startLayout.h + dy;
          const next = resizeWidgetGeometry(g.startLayout, g.mode, requestedW, requestedH);
          wm.resize(id, next.w, next.h, next.contentW, next.contentH, true, g.mode);
          const resized = wm.get(id);
          if (resized) broadcastMove("widget", { type: "SYNC_WIDGET_MOVE", id, x: resized.x, y: resized.y, w: resized.w, h: resized.h, contentW: resized.contentW, contentH: resized.contentH, userResized: resized.userResized, resizeMode: resized.resizeMode });
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
        },
        onResizeEnd: (id) => {
          const wasResizing = widgetResize.current?.id === id;
          widgetResize.current = null;
          const item = wm.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_WIDGET_MOVE", id, x: item.x, y: item.y, w: item.w, h: item.h, contentW: item.contentW, contentH: item.contentH, userResized: item.userResized, resizeMode: item.resizeMode });
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
          if (wasResizing) afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordWidgets();
          wm.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id });
          setSelectedElementRef.current((prev) => (prev?.id === id ? null : prev));
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
          setSelectedElementRef.current(buildElementDataRef.current(id, "widget"));
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
        onSelect: (id) => {
          wm.setSelected(null);
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
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
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
        },
        onDragEnd: (id) => {
          const wasDragging = objectDrag.current?.id === id;
          objectDrag.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_MOVE", id, x: item.x, y: item.y });
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
          if (wasDragging) afterBoardChangeRef.current();
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
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
        },
        onResizeEnd: (id) => {
          const wasResizing = objectResize.current?.id === id;
          objectResize.current = null;
          const item = om.get(id);
          if (item) syncManager.current?.broadcast({ type: "SYNC_OBJECT_RESIZE", id, x: item.x, y: item.y, w: item.w, h: item.h });
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
          if (wasResizing) afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordObjects();
          om.remove(id);
          syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id });
          setSelectedElementRef.current((prev) => (prev?.id === id ? null : prev));
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
          setSelectedElementRef.current(buildElementDataRef.current(id, "object"));
          afterBoardChangeRef.current();
        },
        onMerge: (id) => mergeObjectToInkRef.current(id),
      },
    });
    objects.current = om;

    const boardHistory = new BoardHistory();
    boardHistory.bind(engine, wm, om);
    history.current = boardHistory;
    engine.setTileWriteHook((tx, ty) => {
      inkEpochRef.current += 1;
      boardHistory.recordTileBefore(tx, ty);
    });

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
          setSelectedElementRef.current(null);
          return;
        }
        if (node.kind === "widget") {
          om.setSelected(null);
          wm.setSelected(node.id);
          setSelectedElementRef.current(buildElementDataRef.current(node.id, "widget"));
        } else {
          wm.setSelected(null);
          om.setSelected(node.id);
          setSelectedElementRef.current(buildElementDataRef.current(node.id, "object"));
        }
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

    tm.setSelectionListener((rect) => {
      if (!rect) {
        if (refineStateRef.current === "loading") {
          // Keep active refinement frame and request intact
          return;
        }
        if (!wm.getSelectedId() && !om.getSelectedId()) {
          setSelectedElementRef.current(null);
        }
        setRefineRect(null);
        inkSnapshotRef.current = null;
        lastRefinePosRef.current = "";
        setRefineBtnPos(null);
        if (refineOpRef.current) {
          refineOpRef.current.abort.abort();
          refineOpRef.current = null;
        }
        setRefineState("idle");
        return;
      }
      if (refineStateRef.current === "loading") return;
      setRefineState((prev) => (prev === "loading" ? prev : "idle"));
      setRefineRect(rect);
      const sel = tm.selection;
      inkSnapshotRef.current =
        sel && sel.rect ? captureRegionRef.current(sel.rect) : null;
      // Show the button immediately — endMarquee only triggers the dirty-interaction
      // render path, which never reaches postFrame listeners.
      const p = engine.camera.worldToScreen(rect.x + rect.w, rect.y);
      lastRefinePosRef.current = `${Math.round(p.x)}|${Math.round(p.y)}`;
      setRefineBtnPos({ x: p.x, y: p.y });
      wm.setSelected(null);
      om.setSelected(null);
      const roundedX = Math.round(rect.x);
      const roundedY = Math.round(rect.y);
      const roundedW = Math.round(rect.w);
      const roundedH = Math.round(rect.h);
      setSelectedElementRef.current({
        id: `ink-${roundedX}-${roundedY}`,
        sourceType: "selection",
        tool: "draw",
        x: roundedX,
        y: roundedY,
        w: roundedW,
        h: roundedH,
        contentW: roundedW,
        contentH: roundedH,
        title: `Ink Selection (${roundedW}×${roundedH})`,
        status: "selected",
        payload: `Handwritten stroke cluster at (${roundedX}, ${roundedY}) with box dimensions ${roundedW}×${roundedH} px`,
        timestamp: Date.now(),
      });
    });

    const draft = new DraftManager();
    draft.setRenderer("erase", (_eng, cmd) => {
      if (cmd.tool !== "erase") return;
      const ec = cmd as EraseCommand & { objectId?: string; targetId?: string };
      const targetId = ec.objectId || ec.targetId;
      if (targetId) {
        if (om.get(targetId)) {
          om.remove(targetId);
          syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id: targetId });
        }
        if (wm.get(targetId)) {
          wm.remove(targetId);
          syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: targetId });
        }
      }

      if (ec.mode === "rect" && ec.x !== undefined && ec.y !== undefined && ec.w !== undefined && ec.h !== undefined && (ec.w > 0 || ec.h > 0)) {
        const rect = { x: ec.x, y: ec.y, w: ec.w, h: ec.h };
        eraseRegion(_eng, rect);
        draft.notifyInkErase(rect);
        syncManager.current?.broadcast({ type: "SYNC_INK_ERASE", ...rect });

        for (const o of om.getAll()) {
          if (rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y) {
            om.remove(o.id);
            syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id: o.id });
          }
        }
        for (const w of wm.getAll()) {
          if (rect.x < w.x + w.w && rect.x + rect.w > w.x && rect.y < w.y + w.h && rect.y + rect.h > w.y) {
            wm.remove(w.id);
            syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: w.id });
          }
        }
      } else if (ec.mode === "path" && ec.points && ec.points.length > 0) {
        const size = ec.size ?? 80;
        for (let i = 1; i < ec.points.length; i++) {
          const p1 = { x: ec.points[i - 1][0], y: ec.points[i - 1][1] };
          const p2 = { x: ec.points[i][0], y: ec.points[i][1] };
          strokeSegment(_eng, p1, p2, { erase: true, size, color: "#000" });
        }
        const xs = ec.points.map((p) => p[0]);
        const ys = ec.points.map((p) => p[1]);
        const minX = Math.min(...xs) - size;
        const maxX = Math.max(...xs) + size;
        const minY = Math.min(...ys) - size;
        const maxY = Math.max(...ys) + size;
        const pathBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        for (const o of om.getAll()) {
          if (pathBox.x < o.x + o.w && pathBox.x + pathBox.w > o.x && pathBox.y < o.y + o.h && pathBox.y + pathBox.h > o.y) {
            om.remove(o.id);
            syncManager.current?.broadcast({ type: "SYNC_OBJECT_REMOVE", id: o.id });
          }
        }
        for (const w of wm.getAll()) {
          if (pathBox.x < w.x + w.w && pathBox.x + pathBox.w > w.x && pathBox.y < w.y + w.h && pathBox.y + pathBox.h > w.y) {
            wm.remove(w.id);
            syncManager.current?.broadcast({ type: "SYNC_WIDGET_REMOVE", id: w.id });
          }
        }
      }
    });

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
      const initialW = oldWidget ? oldWidget.w : Math.round(cmd.w || 640);
      const initialH = oldWidget ? oldWidget.h : Math.round(cmd.h || 420);

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
      om.setSelected(null);
      wm.setSelected(item.id);
      setSelectedElementRef.current(buildElementDataRef.current(item.id, "widget"));
      // Diagrams sync source only (html rebuilt on peer); applets chunk if large.
      syncManager.current?.broadcast({ type: "SYNC_WIDGET_ADD", widget: compactWidgetForSync(item) });
      setMode("select");
    });
    draft.setRenderer("write_text", (_eng, cmd) => {
      if (cmd.tool !== "write_text") return;
      const block = renderTextBlock(cmd.text, cmd.color, cmd.fontSize, cmd.maxWidth, cmd.lineHeight);
      const textId = `text-${Date.now()}`;
      addObjectRef.current({
        id: textId,
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
      wm.setSelected(null);
      om.setSelected(textId);
      setSelectedElementRef.current(buildElementDataRef.current(textId, "object"));
      setMode("select");
    });
    draft.setRenderer("draw_formula", async (_eng, cmd) => {
      if (cmd.tool !== "draw_formula") return;
      const rendered = await renderFormula(cmd.latex, cmd.fontSize, cmd.color);
      if (rendered.canvas.width > 0 && rendered.canvas.height > 0) {
        const formulaId = `formula-${Date.now()}`;
        addObjectRef.current({
          id: formulaId,
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
        wm.setSelected(null);
        om.setSelected(formulaId);
        setSelectedElementRef.current(buildElementDataRef.current(formulaId, "object"));
        setMode("select");
      }
    });
    draft.setRenderer("plot_function", (_eng, cmd) => {
      if (cmd.tool !== "plot_function") return;
      const canvas = bakePlotObject(cmd);
      if (canvas.width > 0 && canvas.height > 0) {
        const plotId = `plot-${Date.now()}`;
        addObjectRef.current({
          id: plotId,
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
        wm.setSelected(null);
        om.setSelected(plotId);
        setSelectedElementRef.current(buildElementDataRef.current(plotId, "object"));
        setMode("select");
      }
    });
    draft.setRenderer("animate_scene", (_eng, cmd) => {
      if (cmd.tool !== "animate_scene") return;
      const scene = (cmd as { scene?: import("@/lib/canvas/animation").AnimationScene }).scene;
      const animId = `animation-${Date.now()}`;
      addObjectRef.current({
        id: animId,
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
      wm.setSelected(null);
      om.setSelected(animId);
      setSelectedElementRef.current(buildElementDataRef.current(animId, "object"));
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
      om.setSelected(null);
      wm.setSelected(item.id);
      setSelectedElementRef.current(buildElementDataRef.current(item.id, "widget"));
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
      getFingerprint: () =>
        boardFingerprint(engine, widgets.current, objects.current, inkEpochRef.current),
      getRevisionAudit: () => Object.fromEntries(revisionAuditRef.current),
      onEvent: (e) => handleConductorEventRef.current(e),
      afterBoardChange: () => afterBoardChangeRef.current(),
      getInkBox: () => scheduledInkBoxRef.current ?? inkBoxRef.current,
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
    if (mode !== "select") {
      widgets.current?.setSelected(null);
      objects.current?.setSelected(null);
      setSelectedElement(null);
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
    const demoW = 480;
    const demoH = 320;
    const demoHtml = `<!doctype html><html><head><style>body{font-family:system-ui;padding:24px;background:#f3f4f6;margin:0}button{font-size:28px;padding:12px 20px;border-radius:8px;border:0;background:#2679b8;color:#fff;cursor:pointer}</style></head><body><h2>Mini Counter</h2><button id="b">0</button><script>let n=0;document.getElementById('b').onclick=()=>{document.getElementById('b').textContent=++n};<\/script></body></html>`;
    const item: WidgetItem = {
      id: `demo-${Date.now()}`,
      kind: "html",
      pluginId: "general",
      x: Math.max(0, c.x),
      y: Math.max(0, c.y),
      w: demoW,
      h: demoH,
      contentW: demoW,
      contentH: demoH,
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
      if (refineStateRef.current === "loading") return;
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
        widgets.current?.setSelected(null);
        objects.current?.setSelected(null);
        setSelectedElementRef.current(null);
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

  // Refine overlay position follows the selection rect through camera changes.
  const [refineBtnPos, setRefineBtnPos] = useState<{ x: number; y: number } | null>(null);
  const lastRefinePosRef = useRef("");
  useEffect(() => {
    refreshRefineRectRef.current = () => {
      const r = tools.current?.selection.rect;
      if (r && mode === "select") {
        setRefineRect((prev) =>
          prev && prev.x === r.x && prev.y === r.y && prev.w === r.w && prev.h === r.h ? prev : { ...r }
        );
        const p = engine?.camera.worldToScreen(r.x + r.w, r.y);
        if (p) {
          const key = `${Math.round(p.x)}|${Math.round(p.y)}`;
          if (key !== lastRefinePosRef.current) {
            lastRefinePosRef.current = key;
            setRefineBtnPos({ x: p.x, y: p.y });
          }
        }
      } else if (!tools.current?.selection.hasSelection) {
        lastRefinePosRef.current = "";
        setRefineBtnPos((prev) => (prev === null ? prev : null));
      }
    };
  });
  useEffect(() => {
    if (!engine) return;
    const unsub = engine.onPostFrame(() => refreshRefineRectRef.current());
    return unsub;
  }, [engine]);

  const handleModeChange = useCallback((newMode: CanvasMode) => {
    if (refineStateRef.current === "loading") {
      toast.info("Refinement in progress. Please wait or cancel before switching tools.");
      return;
    }
    setMode(newMode);
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <CanvasHeader
        mode={mode}
        onMode={handleModeChange}
        toolsLocked={refineState === "loading"}
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
        onOpenInspector={() => setInspectorOpen(true)}
        selectedElement={mode === "select" ? selectedElement : null}
        onTidy={handleTidy}
        cloudStatus={cloudStatus}
         onTriggerCloudSync={() => {
           const sync = cloudSync.current;
           if (!engine || !isAuthenticated || !sync) {
             toast.info("Sign in to sync this canvas to the cloud.");
             return;
           }
           const snapshot = serializeSnapshot(engine, widgets.current, objects.current);
           void sync.syncNow(snapshot).then((synced) => {
             if (!synced) toast.error("Cloud sync failed. Please try again.");
           });
         }}
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

        {refineRect && mode === "select" && refineBtnPos && (
          <div
            className="absolute z-40 flex items-center gap-1"
            style={{
              left: refineBtnPos.x,
              top: refineBtnPos.y,
              transform: "translate(8px, -44px)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {refineState === "loading" ? (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/40 bg-background/95 px-3 text-sm shadow-lg"
                onClick={cancelRefine}
              >
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Refining… Cancel
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/40 bg-background/95 px-3 text-sm font-medium shadow-lg hover:bg-accent"
                onClick={runRefine}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.993 6.36 2.64L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {refineState === "error" ? "Retry Refine" : refineState === "success" ? "Refined ✓" : "Refine"}
              </button>
            )}
          </div>
        )}

        {refineRect && refineState === "loading" && engine && (
          <div
            className="pointer-events-none absolute z-30 animate-pulse rounded-md border-2 border-primary/50 bg-primary/5"
            style={{
              left: engine.camera.worldToScreen(refineRect.x, refineRect.y).x,
              top: engine.camera.worldToScreen(refineRect.x, refineRect.y).y,
              width: refineRect.w * engine.camera.scale,
              height: refineRect.h * engine.camera.scale,
            }}
          />
        )}

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
        onClearLogs={() => {
          setLogs([]);
          void clearAgentLogs();
        }}
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
      <GeometryInspectorDialog
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        selectedElement={selectedElement}
        allElements={getAllElements()}
        onSelectElement={handleSelectElement}
        onFocusElement={handleFocusElement}
      />
    </div>
  );
}
