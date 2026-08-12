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
import { SettingsDialog } from "./SettingsDialog";
import { CanvasFooter } from "./CanvasFooter";
import { WidgetManager, type WidgetItem } from "@/lib/canvas/widgets";
import { ObjectManager, type ObjectItem } from "@/lib/canvas/objects";
import { diagramDocument, copyLabel } from "@/lib/canvas/diagram";
import { renderFormula, bakeFormula } from "@/lib/canvas/formulas";
import { bakePlot, plotCommand } from "@/lib/canvas/plotter";
import { buildAtlas, buildFocusInset } from "@/lib/canvas/atlas";
import { buildScene } from "@/lib/canvas/scene";
import { SIZE as CANVAS_SIZE } from "@/lib/canvas/constants";
import { serializeSnapshot, restoreSnapshot, saveAutosave, loadAutosave, exportPng, exportJson, importJson } from "@/lib/canvas/persistence";
import { BoardHistory } from "@/lib/canvas/history";
import type { AiReply, AiRequest, AgentEvent } from "@/lib/ai/types";
import type { CanvasCommand, PlotFunctionCommand } from "@/lib/canvas/commands";
import type { Point, Rect } from "@/lib/canvas/types";
import { getActiveModel, getCachedModels, getProviderConfig, setActiveModel } from "@/lib/ai/provider";
import { Textarea } from "@/components/ui/textarea";

/** Parse the SSE stream from POST /api/canvas/ai. */
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
          else if (eventName === "error")
            throw new Error((data as { error?: string }).error || "AI request failed");
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
  // Global shared state (Penecho-style): mode/color/pen/zoom/aiStatus/autoOn.
  // Reading only these fields means CanvasApp re-renders ONLY when they change,
  // never on every pan/zoom frame (the footer subscribes to zoom on its own).
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

  // ---- living object helpers (#3): create + merge-back-to-ink ----
  function addObject(item: ObjectItem): void {
    objects.current?.add(item);
  }

  function bakePlotObject(cmd: PlotFunctionCommand): HTMLCanvasElement {
    return plotCommand(cmd);
  }

  async function mergeObjectToInk(id: string): Promise<void> {
    const om = objects.current;
    const eng = engine;
    const item = om?.get(id);
    if (!om || !eng || !item) return;
    history.current?.recordObjects(); // remove-from-history is a board change
    if (item.kind === "text") {
      rasterizeText(eng, item.source, { x: item.x, y: item.y }, { color: item.color, fontSize: item.fontSize, maxWidth: item.maxWidth ?? item.w });
    } else if (item.kind === "formula") {
      const r = await renderFormula(item.source, item.fontSize, item.color);
      if (r.canvas.width > 0) bakeFormula(eng, item.x, item.y, r);
    } else if (item.kind === "plot") {
      bakePlot(eng, { tool: "plot_function", x: item.x, y: item.y, w: item.w, h: item.h, expression: item.source, color: item.color });
    }
    om.remove(id);
    afterBoardChangeRef.current();
  }

  // ---- AI auto loop (Part 8) ----
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const aiSeq = useRef(0); // monotonic request id
  const aiRevision = useRef(0); // bump on every user ink commit
  const inkBoxRef = useRef<Rect | null>(null);
  const drawingRef = useRef<Rect | null>(null);
  const refineFocusRef = useRef<{ rect: Rect; widgetId: string } | null>(null);
  const activeEditTargetRef = useRef<string | null>(null);

  // ---- AI provider config (localStorage-driven; dialog writes, we react) ----
  const [models, setModels] = useState<string[]>([]);
  const [activeModel, setActiveModelState] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // ---- live state surfaced in the header badge ----
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

  async function fireAi(box: Rect, userPrompt?: string) {
    const engineAtCall = engine;
    const wm = widgets.current;
    const draft = drafts.current;
    if (!engineAtCall || !draft) return;

    // Read the live provider config + active model at request time.
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
    // Supersede any in-flight request.
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    const requestId = ++aiSeq.current;
    const revision = aiRevision.current;

    const viewport = engineAtCall.camera.visibleWorldRect();
    const atlas = buildAtlas(engineAtCall, viewport, box);
    const scene = buildScene(wm, objects.current);

    // Build widgetEdit target if refine focus set or ink drawn over/near an existing widget
    let widgetEditTarget: import("@/lib/ai/types").WidgetEditContext | undefined = undefined;
    if (refineFocusRef.current && wm) {
      const targetItem = wm.get(refineFocusRef.current.widgetId);
      if (targetItem) {
        widgetEditTarget = {
          id: targetItem.id,
          pluginId: targetItem.pluginId,
          widgetType: targetItem.kind === "diagram" ? "diagram_source" : "html_widget",
          title: targetItem.title,
          sourceFormat: (targetItem as unknown as { sourceFormat?: string }).sourceFormat || (targetItem.kind === "diagram" ? "mermaid" : undefined),
          source: targetItem.copyText,
          html: targetItem.html,
          box: { x: targetItem.x, y: targetItem.y, w: targetItem.w, h: targetItem.h },
        };
      }
    } else if (wm) {
      // Proximity-based target detection: find widget intersecting or nearest to changedBox within 450px margin
      const margin = 450;
      let nearestItem: WidgetItem | null = null;
      let minDistance = Infinity;
      const boxCenterX = box.x + box.w / 2;
      const boxCenterY = box.y + box.h / 2;

      for (const w of wm.all()) {
        const widgetCenterX = w.x + w.w / 2;
        const widgetCenterY = w.y + w.h / 2;
        const isNear =
          box.x < w.x + w.w + margin &&
          box.x + box.w > w.x - margin &&
          box.y < w.y + w.h + margin &&
          box.y + box.h > w.y - margin;

        if (isNear) {
          const dist = Math.hypot(boxCenterX - widgetCenterX, boxCenterY - widgetCenterY);
          if (dist < minDistance) {
            minDistance = dist;
            nearestItem = w;
          }
        }
      }

      if (nearestItem) {
        widgetEditTarget = {
          id: nearestItem.id,
          pluginId: nearestItem.pluginId,
          widgetType: nearestItem.kind === "diagram" ? "diagram_source" : "html_widget",
          title: nearestItem.title,
          sourceFormat: (nearestItem as unknown as { sourceFormat?: string }).sourceFormat || (nearestItem.kind === "diagram" ? "mermaid" : undefined),
          source: nearestItem.copyText,
          html: nearestItem.html,
          box: { x: nearestItem.x, y: nearestItem.y, w: nearestItem.w, h: nearestItem.h },
        };
      }
    }

    activeEditTargetRef.current = widgetEditTarget?.id ?? null;

    const focusInset = buildFocusInset(engineAtCall, box);

    const payload: AiRequest = {
      requestId: `req-${requestId}`,
      atlasImage: atlas.atlasImage,
      focusInset,
      visibleRect: viewport,
      captureRect: viewport,
      sourceRect: atlas.sourceRect,
      changedBox: box,
      imageSize: atlas.imageSize,
      userPrompt,
      scene: JSON.stringify(scene),
      trigger: userPrompt ? "manual" : "user_paused",
      ...(widgetEditTarget ? { widgetEdit: widgetEditTarget } : {}),
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
    };

    const applyReply = async (data: AiReply & { rejected?: string[] }) => {
      if (Array.isArray(data.commands) && data.commands.length) {
        // An accepted AI batch can spawn objects/widgets — capture the pre-state
        // so the accept is a single undoable gesture (Penecho pendingBefore).
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
          msg = d.error || d.detail || msg;
        } catch {}
        throw new Error(msg);
      }
      // Late-response discard: ignore stale replies (request-id guard).
      if (requestId !== aiSeq.current) return;
      if (aiRevision.current !== revision) return; // user drew again mid-flight
      if (isStream) {
        await applyReply(await readSse(res, handleAiEvent));
      } else {
        const data = (await res.json()) as AiReply & { rejected?: string[] };
        await applyReply(data);
      }
    } catch (err) {
      if (controller.signal.aborted) return; // superseded — clean drop
      setAiStatus("error");
      setAiRun((prev) => ({ ...prev, phase: "error" }));
      toast.error("Generation failed after 3 attempts", {
        description: err instanceof Error ? err.message : undefined,
      });
      console.error("AI request failed:", err);
    } finally {
      if (aiAbort.current === controller) aiAbort.current = null;
      refineFocusRef.current = null;
    }
  }

  function scheduleAi(box: Rect, userPrompt?: string) {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      aiTimer.current = null;
      void fireAi(box, userPrompt);
    }, 1200);
  }

  function askAi() {
    const box = inkBoxRef.current ?? engine?.camera.visibleWorldRect() ?? { x: 0, y: 0, w: 100, h: 100 };
    void fireAi(box, undefined);
  }

  // ---- undo / redo / clear + autosave + project file (Part 11) ----
  // #5: diff-based history (Penecho) — the BoardHistory journal records only
  // touched tiles + widget/object records, not a full-board snapshot per change.
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

  function afterBoardChange() {
    history.current?.commit();
    syncHistoryButtons();
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
    if (tm) tm.clearSelection(); // drop any stale floating selection (no tile writes)
    const h = history.current;
    if (!h || !h.canUndo) return;
    await h.undo();
    syncHistoryButtons();
  }

  async function redo() {
    const tm = tools.current;
    if (tm) tm.clearSelection();
    const h = history.current;
    if (!h || !h.canRedo) return;
    await h.redo();
    syncHistoryButtons();
  }

  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });

  function clearBoard() {
    if (!engine) return;
    history.current?.captureWholeBoard(); // Clear is itself an undoable diff
    engine.tiles.clear();
    engine.requestRender();
    widgets.current?.clear();
    objects.current?.clear();
    inkBoxRef.current = null;
    aiRevision.current++;
    afterBoardChange();
  }

  function doExportPng() {
    if (engine) exportPng(engine);
  }

  function doExportJson() {
    if (engine) exportJson(engine, widgets.current, objects.current);
  }

  const jsonFileRef = useRef<HTMLInputElement | null>(null);
  async function doImportJson(file: File) {
    if (!engine) return;
    try {
      // A loaded project replaces the whole board — start a fresh history.
      history.current?.reset();
      await importJson(engine, widgets.current, objects.current, file);
      afterBoardChange();
    } catch (err) {
      console.error("Import failed:", err);
    }
  }

  // ---- engine + tool lifecycle ----
  useEffect(() => {
    if (!engine) return;
    const tm = new ToolManager(engine, () => ({ color: appState.color, pen: appState.pen, eraser }), "pen");
    tools.current = tm;

    const wm = new WidgetManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {
        onDragStart: (id, e) => {
          widgetDrag.current = { id, last: { x: e.clientX, y: e.clientY } };
        },
        onDragMove: (id, e) => {
          const g = widgetDrag.current;
          if (!g || g.id !== id) return;
          history.current?.recordWidgets(); // first real move = before-capture
          const dx = (e.clientX - g.last.x) / engine.camera.scale;
          const dy = (e.clientY - g.last.y) / engine.camera.scale;
          wm.move(id, dx, dy);
          g.last = { x: e.clientX, y: e.clientY };
        },
        onDragEnd: () => {
          widgetDrag.current = null;
          afterBoardChangeRef.current(); // widget move is an undoable change
        },
        onResizeStart: (id, e) => {
          widgetResize.current = { id, last: { x: e.clientX, y: e.clientY } };
        },
        onResizeMove: (id, e) => {
          const g = widgetResize.current;
          if (!g || g.id !== id) return;
          history.current?.recordWidgets();
          const item = wm.get(id);
          if (!item) return;
          wm.resize(id, item.w + (e.clientX - g.last.x) / engine.camera.scale, item.h + (e.clientY - g.last.y) / engine.camera.scale);
          g.last = { x: e.clientX, y: e.clientY };
        },
        onResizeEnd: () => {
          widgetResize.current = null;
          afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordWidgets();
          wm.remove(id);
          afterBoardChangeRef.current();
        },
        onAccept: (id) => {
          history.current?.recordWidgets();
          wm.setStatus(id, "accepted");
          afterBoardChangeRef.current();
        },
        onAiRefine: (id) => {
          const item = wm.get(id);
          if (!item || !engine) return;
          // PenEcho-style: scope the next AI pass to the widget's neighbourhood.
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

    // Living objects (text/formula/plot) — the #3 divergence fix. These stay
    // as DOM-chromed attachments with source data instead of baking to pixels.
    const om = new ObjectManager({
      engineContainer: engine.rootElement,
      camera: engine.camera,
      callbacks: {
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
        },
        onDragEnd: () => {
          objectDrag.current = null;
          afterBoardChangeRef.current();
        },
        onResizeStart: (id, e) => {
          objectResize.current = { id, last: { x: e.clientX, y: e.clientY } };
        },
        onResizeMove: (id, e) => {
          const g = objectResize.current;
          if (!g || g.id !== id) return;
          history.current?.recordObjects();
          const item = om.get(id);
          if (!item) return;
          om.resize(id, item.w + (e.clientX - g.last.x) / engine.camera.scale, item.h + (e.clientY - g.last.y) / engine.camera.scale);
          g.last = { x: e.clientX, y: e.clientY };
        },
        onResizeEnd: () => {
          objectResize.current = null;
          afterBoardChangeRef.current();
        },
        onRemove: (id) => {
          history.current?.recordObjects();
          om.remove(id);
          afterBoardChangeRef.current();
        },
        onMerge: (id) => mergeObjectToInk(id),
      },
    });
    objects.current = om;

    // #5: diff-based undo/redo journal (Penecho recordBefore/save). The engine's
    // tile-write hook journals the "before" bitmaps lazily; every board change
    // afterBoardChange() then folds them into a single history entry.
    const boardHistory = new BoardHistory();
    boardHistory.bind(engine, wm, om);
    history.current = boardHistory;
    engine.setTileWriteHook((tx, ty) => boardHistory.recordTileBefore(tx, ty));

    // Route select-tool shell picking/moving through the ToolManager so every
    // gesture (pan / shell-drag / selection / drawing) shares one router.
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
          history.current?.recordWidgets(); // first translate = before-capture
          wm.move(node.id, dx, dy);
        } else {
          history.current?.recordObjects();
          om.move(node.id, dx, dy);
        }
      },
    });

    const draft = new DraftManager();
    draft.setRenderer("html_widget", (_eng, cmd) => {
      if (cmd.tool !== "html_widget") return;
      const targetId = activeEditTargetRef.current;
      if (targetId && wm.has(targetId)) {
        const oldWidget = wm.get(targetId);
        if (oldWidget) {
          cmd.x = oldWidget.x;
          cmd.y = oldWidget.y;
          cmd.w = oldWidget.w;
          cmd.h = oldWidget.h;
        }
        wm.remove(targetId);
      }
      activeEditTargetRef.current = null;
      const item: WidgetItem = {
        id: targetId || `widget-${Date.now()}`,
        kind: "html",
        pluginId: cmd.pluginId,
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        contentW: cmd.w,
        contentH: cmd.h,
        title: cmd.title,
        html: cmd.html,
        copyText: cmd.copyText,
        copyLabel: cmd.copyLabel,
        status: "draft",
      };
      wm.add(item);
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
        status: "accepted",
        image: block.canvas,
      });
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
          status: "accepted",
          image: rendered.canvas,
        });
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
          status: "accepted",
          image: canvas,
        });
      }
    });
    draft.setRenderer("diagram_source", async (_eng, cmd) => {
      if (cmd.tool !== "diagram_source") return;
      const targetId = activeEditTargetRef.current;
      if (targetId && wm.has(targetId)) {
        const oldWidget = wm.get(targetId);
        if (oldWidget) {
          cmd.x = oldWidget.x;
          cmd.y = oldWidget.y;
          cmd.w = oldWidget.w;
          cmd.h = oldWidget.h;
        }
        wm.remove(targetId);
      }
      activeEditTargetRef.current = null;
      const html = await diagramDocument(cmd.sourceFormat, cmd.source);
      const item: WidgetItem = {
        id: targetId || `diagram-${Date.now()}`,
        kind: "diagram",
        pluginId: "flowchart",
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        contentW: cmd.w,
        contentH: cmd.h,
        title: cmd.title,
        html,
        copyText: cmd.source,
        copyLabel: copyLabel(cmd.sourceFormat),
        status: "draft",
      };
      wm.add(item);
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
    };
    const unsub = engine.onPostFrame(sync);
    return () => {
      unsub();
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

  // ---- restore autosave on mount (after managers exist so objects/widgets
  // come back from JSON source data, not just ink) ----
  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    (async () => {
      const saved = await loadAutosave();
      if (saved && !cancelled) {
        await restoreSnapshot(engine, widgets.current, objects.current, saved);
        history.current?.reset(); // restored board ≠ user's edit history
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
  }, [mode, engine]);

  // Forward wheel gestures occurring inside widget iframes so the canvas still zooms.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "drawva-widget-wheel") return;
      if (engine) {
        engine.camera.zoomAt(e.data.clientX, e.data.clientY, e.data.deltaY);
        engine.requestRender();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [engine]);

  // ---- inject a demo interactive widget (Part 4 manual verification) ----
  const addDemoWidget = () => {
    const wm = widgets.current;
    if (!wm || !engine) return;
    const c = engine.camera.screenToWorld(engine.cssWidth / 2, engine.cssHeight / 2);
    wm.add({
      id: `demo-${Date.now()}`,
      kind: "html",
      pluginId: "general",
      x: Math.max(0, c.x),
      y: Math.max(0, c.y),
      w: 700,
      h: 420,
      contentW: 1200,
      contentH: 800,
      title: "Counter",
      html: `<!doctype html><html><head><style>body{font-family:system-ui;padding:24px;background:#f3f4f6;margin:0}button{font-size:28px;padding:12px 20px;border-radius:8px;border:0;background:#2679b8;color:#fff;cursor:pointer}</style></head><body><h2>Mini Counter</h2><button id="b">0</button><script>let n=0;document.getElementById('b').onclick=()=>{document.getElementById('b').textContent=++n};<\/script></body></html>`,
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

  // ---- text editor overlay ----
  const [textOpen, setTextOpen] = useState(false);
  const [textAnchor, setTextAnchor] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const commitText = useCallback(() => {
    if (engine && textAnchor && textValue.trim()) {
      rasterizeText(engine, textValue, textAnchor, { color, fontSize: Math.max(8, pen * 6), maxWidth: 360 });
      afterBoardChangeRef.current(); // text commit is an undoable change
    }
    setTextOpen(false);
    setTextValue("");
    setTextAnchor(null);
  }, [engine, textAnchor, textValue, color, pen]);

  // ---- keyboard shortcuts ----
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
        e.preventDefault();
      } else if (k === "escape") {
        tools.current?.clearSelection();
        setTextOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- pointer dispatch ----
  const screenToWorld = (e: React.PointerEvent): Point => {
    const rect = engine!.canvas("screen").getBoundingClientRect();
    return engine!.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  };

  // Normalize a pointer event into the ToolManager's gesture payload.
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
    // penecho: capture the pointer for EVERY gesture, so strokes survive moving
    // over widget iframes or off the canvas element.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {}
    const tm = tools.current;
    if (!tm) return;
    const middle = e.button === 1;
    if (middle || mode === "hand") {
      // Pan owns the pointer for the whole gesture; ToolManager routes it.
      e.preventDefault();
      tm.begin(gestureEvent(e));
      return;
    }
    if (e.button !== 0) return;
    const world = screenToWorld(e);
    const isDrawing = ["pen", "highlighter", "eraser", "rect", "ellipse", "arrow"].includes(mode);
    if (isDrawing) {
      drawingRef.current = { x: world.x, y: world.y, w: 0, h: 0 };
      // New user ink supersedes any pending/in-flight AI.
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
      return;
    }
    // Select/hand/pen/shape/etc. all route through the single gesture router.
    tm.begin(gestureEvent(e));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!engine) return;
    const tm = tools.current;
    if (!tm) return;
    const world = screenToWorld(e);
    // Passive moves with no active gesture still update live marquee/ink previews.
    tm.move(gestureEvent(e));
    // Expand the live ink bbox during a drawing gesture.
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
    const tm = tools.current;
    if (!tm) return;
    const changed = tm.end(e.pointerId);
    if (changed) afterBoardChange();
    // On commit of a drawing gesture, record the ink box, bump revision, and
    // schedule the auto-AI request.
    if (drawingRef.current) {
      const isDrawing = ["pen", "highlighter", "eraser", "rect", "ellipse", "arrow"].includes(mode);
      if (isDrawing) {
        const box = { ...drawingRef.current };
        drawingRef.current = null;
        inkBoxRef.current = box;
        aiRevision.current++;
        afterBoardChange();
        if (appState.autoOn) scheduleAi(box);
      } else {
        drawingRef.current = null;
      }
    }
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
      />

      {/* Playground: engine root + one deterministic gesture target above it.
          Widget shells raise themselves only for their interactive chrome
          (select/hand); the rest of the canvas must always receive input. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" />
        <div
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
            className="absolute z-30 w-44 resize-none"
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
    </div>
  );
}
