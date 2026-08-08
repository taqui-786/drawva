"use client";

import { PropertyPanel } from "@/components/PropertyPanel";
import { createCanvasEditor, type Editor } from "@canvas/core/Editor";
import { TOOL_SHORTCUTS } from "@canvas/constants/shortcuts";
import type { ToolType } from "@/canvas/model/types";
import {
  ArrowUpRight01Icon,
  DiamondIcon,
  DownloadIcon,
  FolderOpenIcon,
  GridIcon,
  HandIcon,
  Maximize04Icon,
  MinusSignIcon,
  PencilEdit01Icon,
  PlusSignIcon,
  Redo02Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

/**
 * React bridge (§1, §105): owns the two canvas elements, initializes the
 * engine after mount, and renders toolbars that talk to the editor API only.
 * No pointer or scene state ever touches React state (§91).
 */

// Text-labelled fallback icons for tools without a direct HugeIcons glyph.
const TOOL_LABEL: Partial<Record<ToolType, string>> = {
  select: "V",
  rectangle: "R",
  ellipse: "O",
  line: "L",
  arrow: "A",
  freedraw: "P",
};

export default function CanvasApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);

  useEffect(() => {
    if (!staticRef.current || !overlayRef.current) return;
    const instance = createCanvasEditor({
      staticCanvas: staticRef.current,
      overlayCanvas: overlayRef.current,
    });
    instance.attach();
    editorRef.current = instance;
    setEditor(instance);

    const unsubs = [
      instance.on("toolChange", () => setActiveTool(instance.getActiveToolType())),
      instance.on("historyChange", () => {
        setCanUndo(instance.history.canUndo());
        setCanRedo(instance.history.canRedo());
      }),
      instance.on("cameraChange", () => setZoom(instance.camera.get().zoom)),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
      instance.destroy();
      editorRef.current = null;
      setEditor(null);
    };
  }, []);

  const setTool = (tool: ToolType) => () => editorRef.current?.setActiveTool(tool);
  const undo = () => editorRef.current?.undo();
  const redo = () => editorRef.current?.redo();
  const zoomIn = () => editorRef.current?.zoomIn();
  const zoomOut = () => editorRef.current?.zoomOut();

  const tools: { type: ToolType; label: string; icon?: IconSvgElement }[] = [
    { type: "select", label: "Select (V)" },
    { type: "hand", label: "Hand (H)", icon: HandIcon },
    { type: "rectangle", label: "Rectangle (R)" },
    { type: "diamond", label: "Diamond (D)", icon: DiamondIcon },
    { type: "ellipse", label: "Ellipse (O)" },
    { type: "arrow", label: "Arrow (A)", icon: ArrowUpRight01Icon },
    { type: "line", label: "Line (L)" },
    { type: "freedraw", label: "Draw (P)", icon: PencilEdit01Icon },
  ];

  return (
    <div ref={containerRef} className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* stacked canvases — engine owns these absolutely (§21) */}
      <canvas ref={staticRef} className="absolute inset-0 z-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 z-10 touch-none outline-none"
        tabIndex={0}
      />

      {/* contextual property panel */}
      <PropertyPanel editor={editor} />

      {/* tool toolbar */}
      <div className="absolute left-1/2 bottom-5 z-20 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-xl border bg-background/90 p-1.5 shadow-lg backdrop-blur">
          {tools.map((t) => (
            <button
              key={t.type}
              type="button"
              title={t.label}
              onClick={setTool(t.type)}
              className={
                "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors " +
                (activeTool === t.type
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted")
              }
            >
              {t.icon ? (
                <HugeiconsIcon icon={t.icon} size={18} />
              ) : (
                (TOOL_LABEL[t.type] ?? t.label[0])
              )}
              <span className="sr-only">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* top-left: history commands */}
      <div className="absolute left-4 top-4 z-20 flex gap-1 rounded-xl border bg-background/90 p-1.5 shadow-lg backdrop-blur">
        <IconAction icon={Undo02Icon} label="Undo" disabled={!canUndo} onClick={undo} />
        <IconAction icon={Redo02Icon} label="Redo" disabled={!canRedo} onClick={redo} />
        <Separator />
        <IconAction
          icon={FolderOpenIcon}
          label="Open"
          onClick={() => editorRef.current?.openFile()}
        />
        <IconAction
          icon={DownloadIcon}
          label="Save"
          onClick={() => editorRef.current?.saveToFile()}
        />
      </div>

      {/* top-right: view commands */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border bg-background/90 p-1.5 shadow-lg backdrop-blur">
        <IconAction icon={MinusSignIcon} label="Zoom out" onClick={zoomOut} />
        <button
          type="button"
          className="min-w-14 rounded-md px-2 py-1 text-center text-xs tabular-nums hover:bg-muted"
          onClick={() => editorRef.current?.resetZoom()}
          title="Reset zoom — Ctrl+0"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconAction icon={PlusSignIcon} label="Zoom in" onClick={zoomIn} />
        <Separator />
        <IconAction
          icon={Maximize04Icon}
          label="Zoom to fit"
          onClick={() => editorRef.current?.zoomToFit()}
        />
        <IconAction
          icon={GridIcon}
          label="Toggle grid"
          onClick={() => {
            const next = !grid;
            setGrid(next);
            editorRef.current?.setGridEnabled(next);
          }}
          active={grid}
        />
      </div>

      {/* subtle keyboard hint — read-only text derived from the registry */}
      <div className="pointer-events-none absolute bottom-5 left-4 z-20 hidden text-xs text-muted-foreground lg:block">
        {TOOL_SHORTCUTS.slice(0, 5)
          .map((t) => `${t.tool} ${t.keys[0].toUpperCase()}`)
          .join(" · ")}
      </div>
    </div>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-40 " +
        (active ? "bg-primary text-primary-foreground" : "hover:bg-muted")
      }
    >
      <HugeiconsIcon icon={icon} size={18} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function Separator() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}