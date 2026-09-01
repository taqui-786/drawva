"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Analytics01Icon,
  Copy01Icon,
  Tick01Icon,
  CodeIcon,
  Target01Icon,
  TextIcon,
  MathIcon,
  FunctionIcon,
  SquareIcon,
  GitGraphIcon,
  CursorIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

export interface ElementGeometryData {
  id: string;
  sourceType: "widget" | "object" | "selection";
  tool: string;
  x: number;
  y: number;
  w: number;
  h: number;
  contentW?: number;
  contentH?: number;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  color?: string;
  title?: string;
  pluginId?: string;
  sourceFormat?: string;
  status?: string;
  payload?: string;
  timestamp?: number;
}

export interface GeometryInspectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedElement: ElementGeometryData | null;
  allElements?: ElementGeometryData[];
  onSelectElement?: (id: string, sourceType: "widget" | "object" | "selection") => void;
  onFocusElement?: (element: ElementGeometryData) => void;
}

function getToolIcon(tool: string) {
  switch (tool) {
    case "write_text":
    case "text":
      return TextIcon;
    case "draw_formula":
    case "formula":
      return MathIcon;
    case "plot_function":
    case "plot":
      return FunctionIcon;
    case "diagram_source":
    case "diagram":
      return GitGraphIcon;
    case "html_widget":
    case "html":
      return CodeIcon;
    case "draw":
    case "ink":
    case "ink_cluster":
    case "selection":
      return CursorIcon;
    default:
      return SquareIcon;
  }
}

function getToolBadgeVariant(tool: string): "default" | "secondary" | "outline" {
  switch (tool) {
    case "html_widget":
    case "html":
      return "default";
    case "draw_formula":
    case "write_text":
      return "secondary";
    default:
      return "outline";
  }
}

function StatCard({
  label,
  value,
  unit = "px",
  onCopy,
}: {
  label: string;
  value: number | string;
  unit?: string;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
    } else {
      void navigator.clipboard.writeText(String(value));
      toast.success(`${label} copied: ${value}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={handleCopy}
      className="group relative flex flex-col justify-between rounded-lg border bg-card p-2.5 sm:p-3 transition-all hover:border-primary/50 hover:bg-accent/40 cursor-pointer select-none"
    >
      <div className="flex items-center justify-between text-muted-foreground text-[11px] font-medium">
        <span>{label}</span>
        <HugeiconsIcon
          icon={copied ? Tick01Icon : Copy01Icon}
          className="size-3 opacity-60 group-hover:opacity-100 transition-opacity"
        />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-base sm:text-lg font-semibold tracking-tight text-foreground">
          {typeof value === "number" ? Math.round(value).toLocaleString() : value}
        </span>
        {unit && <span className="font-mono text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function GeometryInspectorDialog({
  open,
  onOpenChange,
  selectedElement,
  allElements = [],
  onSelectElement,
  onFocusElement,
}: GeometryInspectorDialogProps) {
  const [activeTab, setActiveTab] = useState<"geometry" | "payload" | "json" | "elements">("geometry");
  const [selectedIdOverride, setSelectedIdOverride] = useState<{ forPropId: string | null; id: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const currentPropId = selectedElement?.id ?? null;
  const activeId =
    selectedIdOverride && selectedIdOverride.forPropId === currentPropId
      ? selectedIdOverride.id
      : currentPropId ?? (allElements.length > 0 ? allElements[allElements.length - 1].id : null);

  // Resolve currentElement: prioritize activeId match, then selectedElement, then latest in allElements
  const currentElement = useMemo(() => {
    if (activeId) {
      if (selectedElement && selectedElement.id === activeId) return selectedElement;
      const found = allElements.find((e) => e.id === activeId);
      if (found) return found;
    }
    if (selectedElement) return selectedElement;
    return allElements[allElements.length - 1] || allElements[0] || null;
  }, [activeId, allElements, selectedElement]);

  const jsonCommand = useMemo(() => {
    if (!currentElement) return "{}";
    const cmd: Record<string, unknown> = {
      tool: currentElement.tool,
      x: currentElement.x,
      y: currentElement.y,
      w: currentElement.w,
      h: currentElement.h,
    };
    if (currentElement.contentW && currentElement.contentW !== currentElement.w) {
      cmd.contentW = currentElement.contentW;
    }
    if (currentElement.contentH && currentElement.contentH !== currentElement.h) {
      cmd.contentH = currentElement.contentH;
    }
    if (currentElement.fontSize) cmd.fontSize = currentElement.fontSize;
    if (currentElement.maxWidth) cmd.maxWidth = currentElement.maxWidth;
    if (currentElement.lineHeight) cmd.lineHeight = currentElement.lineHeight;
    if (currentElement.title) cmd.title = currentElement.title;
    if (currentElement.pluginId) cmd.pluginId = currentElement.pluginId;
    if (currentElement.sourceFormat) cmd.sourceFormat = currentElement.sourceFormat;

    if (currentElement.payload) {
      if (currentElement.tool === "html_widget" || currentElement.sourceType === "widget") {
        cmd.html = currentElement.payload;
      } else if (currentElement.tool === "write_text") {
        cmd.text = currentElement.payload;
      } else if (currentElement.tool === "draw_formula") {
        cmd.latex = currentElement.payload;
      } else if (currentElement.tool === "plot_function") {
        cmd.expression = currentElement.payload;
      } else if (currentElement.tool === "diagram_source") {
        cmd.source = currentElement.payload;
      }
    }
    return JSON.stringify(cmd, null, 2);
  }, [currentElement]);

  const handleCopyJson = () => {
    void navigator.clipboard.writeText(jsonCommand);
    setCopiedJson(true);
    toast.success("Command JSON copied to clipboard");
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyPayload = () => {
    if (!currentElement?.payload) return;
    void navigator.clipboard.writeText(currentElement.payload);
    setCopiedCode(true);
    toast.success("Content payload copied to clipboard");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyCoords = () => {
    if (!currentElement) return;
    const str = `x: ${currentElement.x}, y: ${currentElement.y}, w: ${currentElement.w}, h: ${currentElement.h}`;
    void navigator.clipboard.writeText(str);
    toast.success(`Copied coordinates (${str})`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Element Geometry & AI Inspector</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Inspect exact whiteboard coordinates and AI output payloads
                </DialogDescription>
              </div>
            </div>

            {allElements.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs font-medium">
                {allElements.length} {allElements.length === 1 ? "element" : "elements"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Element Selection Picker bar */}
        {allElements.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-muted/40 border-b overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">Inspect:</span>
            {allElements.map((el) => {
              const isSelected = (currentElement?.id === el.id);
              const ToolIcon = getToolIcon(el.tool);
              return (
                <button
                  key={el.id}
                  onClick={() => {
                    setSelectedIdOverride({ forPropId: currentPropId, id: el.id });
                    onSelectElement?.(el.id, el.sourceType);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "bg-background/80 hover:bg-background border border-border/60 text-foreground"
                  }`}
                >
                  <HugeiconsIcon icon={ToolIcon} className="size-3 shrink-0" />
                  <span className="max-w-[120px] truncate">{el.title || el.tool || el.id}</span>
                  <span className="text-[10px] opacity-75">
                    ({Math.round(el.x)}, {Math.round(el.y)})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        {currentElement ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as never)} className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="h-8">
                  <TabsTrigger value="geometry" className="text-xs px-3">
                    Geometry
                  </TabsTrigger>
                  <TabsTrigger value="payload" className="text-xs px-3">
                    Content Payload
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs px-3">
                    AI JSON Command
                  </TabsTrigger>
                  {allElements.length > 0 && (
                    <TabsTrigger value="elements" className="text-xs px-3">
                      All Items ({allElements.length})
                    </TabsTrigger>
                  )}
                </TabsList>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCoords}
                    className="h-7 text-xs gap-1 font-mono cursor-pointer"
                    title="Copy x, y, w, h"
                  >
                    <HugeiconsIcon icon={Copy01Icon} className="size-3" />
                    <span>Copy Coords</span>
                  </Button>
                  {onFocusElement && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onFocusElement(currentElement)}
                      className="h-7 text-xs gap-1 cursor-pointer"
                      title="Focus Camera on this element"
                    >
                      <HugeiconsIcon icon={Target01Icon} className="size-3" />
                      <span>Focus</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* TAB 1: GEOMETRY */}
              <TabsContent value="geometry" className="space-y-4 m-0 focus-visible:outline-none">
                {/* 4 Coordinate Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatCard label="X Coordinate" value={currentElement.x} />
                  <StatCard label="Y Coordinate" value={currentElement.y} />
                  <StatCard label="Width (W)" value={currentElement.w} />
                  <StatCard label="Height (H)" value={currentElement.h} />
                </div>

                {/* Secondary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {currentElement.contentW !== undefined && (
                    <StatCard label="Content Width" value={currentElement.contentW} />
                  )}
                  {currentElement.contentH !== undefined && (
                    <StatCard label="Content Height" value={currentElement.contentH} />
                  )}
                  <StatCard
                    label="Aspect Ratio"
                    value={`${(currentElement.w / Math.max(1, currentElement.h)).toFixed(2)} : 1`}
                    unit=""
                  />
                  {currentElement.fontSize !== undefined && (
                    <StatCard label="Font Size" value={currentElement.fontSize} />
                  )}
                  {currentElement.maxWidth !== undefined && (
                    <StatCard label="Max Width" value={currentElement.maxWidth} />
                  )}
                  {currentElement.lineHeight !== undefined && (
                    <StatCard label="Line Height" value={currentElement.lineHeight} unit="" />
                  )}
                </div>

                {/* Metadata Details Card */}
                <div className="rounded-lg border bg-muted/20 p-3.5 space-y-2.5">
                  <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Element Properties</span>
                    <Badge variant={getToolBadgeVariant(currentElement.tool)} className="font-mono text-[11px] capitalize">
                      {currentElement.tool}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex items-center justify-between p-2 rounded bg-background/60 border">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-semibold text-foreground truncate max-w-[200px]" title={currentElement.id}>
                        {currentElement.id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background/60 border">
                      <span className="text-muted-foreground">Source Layer:</span>
                      <span className="font-semibold text-foreground capitalize">{currentElement.sourceType}</span>
                    </div>
                    {currentElement.title && (
                      <div className="flex items-center justify-between p-2 rounded bg-background/60 border">
                        <span className="text-muted-foreground">Title:</span>
                        <span className="font-semibold text-foreground truncate max-w-[200px]">{currentElement.title}</span>
                      </div>
                    )}
                    {currentElement.pluginId && (
                      <div className="flex items-center justify-between p-2 rounded bg-background/60 border">
                        <span className="text-muted-foreground">Plugin:</span>
                        <span className="font-semibold text-foreground">{currentElement.pluginId}</span>
                      </div>
                    )}
                    {currentElement.status && (
                      <div className="flex items-center justify-between p-2 rounded bg-background/60 border">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="font-semibold text-foreground capitalize">{currentElement.status}</span>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: CONTENT PAYLOAD */}
              <TabsContent value="payload" className="space-y-3 m-0 focus-visible:outline-none">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Raw AI-generated content string rendered on canvas
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyPayload}
                    disabled={!currentElement.payload}
                    className="h-7 text-xs gap-1 cursor-pointer"
                  >
                    <HugeiconsIcon icon={copiedCode ? Tick01Icon : Copy01Icon} className="size-3" />
                    <span>{copiedCode ? "Copied" : "Copy Payload"}</span>
                  </Button>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 max-h-[360px] overflow-auto font-mono text-xs select-text">
                  <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground">
                    {currentElement.payload || "(No text or HTML payload available)"}
                  </pre>
                </div>
              </TabsContent>

              {/* TAB 3: JSON COMMAND */}
              <TabsContent value="json" className="space-y-3 m-0 focus-visible:outline-none">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Equivalent standard Drawva AI tool command
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyJson}
                    className="h-7 text-xs gap-1 cursor-pointer"
                  >
                    <HugeiconsIcon icon={copiedJson ? Tick01Icon : Copy01Icon} className="size-3" />
                    <span>{copiedJson ? "Copied" : "Copy JSON"}</span>
                  </Button>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3 max-h-[360px] overflow-auto font-mono text-xs select-text">
                  <pre className="whitespace-pre text-[11px] leading-relaxed text-foreground">
                    {jsonCommand}
                  </pre>
                </div>
              </TabsContent>

              {/* TAB 4: ALL ELEMENTS LIST */}
              <TabsContent value="elements" className="space-y-2 m-0 focus-visible:outline-none">
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/60 text-[11px] font-semibold text-muted-foreground border-b">
                    <span className="col-span-3">Tool / Kind</span>
                    <span className="col-span-4">ID / Title</span>
                    <span className="col-span-3">Coordinates (X, Y)</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto divide-y">
                    {allElements.map((el) => {
                      const isSel = (currentElement.id === el.id);
                      const ToolIcon = getToolIcon(el.tool);
                      return (
                        <div
                          key={el.id}
                          className={`grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs font-mono transition-colors ${
                            isSel ? "bg-primary/10 font-semibold" : "hover:bg-muted/30"
                          }`}
                        >
                          <div className="col-span-3 flex items-center gap-1.5 truncate">
                            <HugeiconsIcon icon={ToolIcon} className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="capitalize truncate">{el.tool}</span>
                          </div>
                          <div className="col-span-4 truncate text-muted-foreground" title={el.title || el.id}>
                            {el.title || el.id}
                          </div>
                          <div className="col-span-3 text-[11px] text-muted-foreground">
                            {Math.round(el.x)}, {Math.round(el.y)} ({Math.round(el.w)}×{Math.round(el.h)})
                          </div>
                          <div className="col-span-2 flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={isSel ? "default" : "ghost"}
                              onClick={() => {
                                setSelectedIdOverride({ forPropId: currentPropId, id: el.id });
                                onSelectElement?.(el.id, el.sourceType);
                              }}
                              className="h-6 px-2 text-[10px] cursor-pointer"
                            >
                              {isSel ? "Inspecting" : "Select"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground space-y-3">
            <div className="p-3 rounded-full bg-muted">
              <HugeiconsIcon icon={CursorIcon} className="size-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No Element Selected</p>
              <p className="text-xs max-w-sm">
                Click or select any text, formula, diagram, HTML widget, or shape on the whiteboard to inspect its exact live coordinates.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
