"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { useCanvas } from "./CanvasProvider";
import { ToolType } from "@/lib/canvas/types";
import { exportCanvasPng } from "@/lib/canvas/exportPng";
import { exportCanvasJson, importCanvasJson } from "@/lib/canvas/persistence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PaintBrush01Icon,
  Cursor01Icon,
  HandIcon,
  PencilEdit01Icon,
  HighlighterIcon,
  Eraser01Icon,
  TextIcon,
  SquareIcon,
  CircleIcon,
  ArrowUpRight01Icon,
  FloppyDiskIcon,
  Folder01Icon,
  FileDownloadIcon,
  SparklesIcon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Home01Icon,
  ZoomIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";

const COLORS = ["#1e293b", "#ef4444", "#2563eb", "#10b981", "#f59e0b", "#8b5cf6"];
const SIZES = [2, 4, 8, 12];

export function CanvasHeader() {
  const {
    engine,
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    activeSize,
    setActiveSize,
    zoom,
    setZoom,
    isAutoMode,
    setAutoMode,
    isAiThinking,
    triggerAiAnalysis,
    hasDraft,
    acceptDraft,
    discardDraft,
    alertState,
    showAlert,
    closeAlert,
  } = useCanvas();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toolButtons: Array<{ id: ToolType; label: string; shortcut: string; icon: React.ReactNode }> = [
    {
      id: "select",
      label: "Select",
      shortcut: "V",
      icon: <HugeiconsIcon icon={Cursor01Icon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "lasso",
      label: "Lasso Select",
      shortcut: "L",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M7 10c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6c-1.2 0-2.3-.4-3.2-1L7 17c-1.1 1.1-1.1 2.9 0 4s2.9 1.1 4 0l1-1" strokeDasharray="3 3" />
        </svg>
      ),
    },
    {
      id: "hand",
      label: "Pan Hand",
      shortcut: "H",
      icon: <HugeiconsIcon icon={HandIcon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "pen",
      label: "Vector Pen",
      shortcut: "P",
      icon: <HugeiconsIcon icon={PencilEdit01Icon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "highlighter",
      label: "Highlighter",
      shortcut: "Shift+H",
      icon: <HugeiconsIcon icon={HighlighterIcon} className="w-4 h-4 text-primary" aria-hidden="true" />,
    },
    {
      id: "eraser",
      label: "Eraser",
      shortcut: "E",
      icon: <HugeiconsIcon icon={Eraser01Icon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "text",
      label: "Text",
      shortcut: "T",
      icon: <HugeiconsIcon icon={TextIcon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "rect",
      label: "Rectangle",
      shortcut: "R",
      icon: <HugeiconsIcon icon={SquareIcon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "ellipse",
      label: "Ellipse",
      shortcut: "O",
      icon: <HugeiconsIcon icon={CircleIcon} className="w-4 h-4" aria-hidden="true" />,
    },
    {
      id: "arrow",
      label: "Arrow",
      shortcut: "A",
      icon: <HugeiconsIcon icon={ArrowUpRight01Icon} className="w-4 h-4" aria-hidden="true" />,
    },
  ];

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engine) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        try {
          importCanvasJson(engine, content);
        } catch {
          showAlert("Import Error", "Failed to parse canvas file. Ensure it is a valid Drawva JSON document.");
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json,.drawva" className="hidden" />

      {/* Floating Main Header Bar */}
      <header className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-between gap-3 w-[calc(100%-2rem)] max-w-7xl pointer-events-none">
        {/* Left Brand Badge */}
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-card/90 backdrop-blur-md rounded-lg border border-border shadow-md">
          <Link
            href="/"
            className="flex items-center gap-2 group focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <div className="size-7 rounded bg-primary flex items-center justify-center text-primary-foreground shadow-sm group-hover:scale-105 transition-transform">
              <HugeiconsIcon icon={PaintBrush01Icon} className="size-4" aria-hidden="true" />
            </div>
            <span className="font-bold text-sm tracking-tight text-foreground hidden sm:inline">
              Drawva
            </span>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" aria-hidden="true" />
          {/* Status Pill Badge (PenEcho style) */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-muted/80 rounded-full border border-border text-xs font-medium text-muted-foreground select-none">
            {isAiThinking ? (
              <>
                <div className="size-2 rounded-full bg-blue-500 animate-ping" />
                <span className="text-foreground font-semibold">Observing...</span>
              </>
            ) : hasDraft ? (
              <>
                <div className="size-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Review draft suggestion</span>
              </>
            ) : (
              <>
                <div className="size-2 rounded-full bg-muted-foreground/40" />
                <span>{isAutoMode ? "Auto AI Active" : "Ready"}</span>
              </>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  render={<Link href="/" />}
                  aria-label="Return to landing page"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <HugeiconsIcon icon={Home01Icon} className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Home</TooltipContent>
          </Tooltip>
        </div>

        {/* Center Tool Dock */}
        <nav
          aria-label="Canvas Drawing Tools"
          className="pointer-events-auto flex items-center gap-1 p-1 bg-card/90 backdrop-blur-md rounded-lg border border-border shadow-md"
        >
          {toolButtons.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger
                  render={
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="icon"
                      aria-label={`${tool.label} (${tool.shortcut})`}
                      onClick={() => setActiveTool(tool.id)}
                      className={`transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {tool.icon}
                    </Button>
                  }
                />
                <TooltipContent side="bottom" className="text-xs">
                  {tool.label} <span className="text-muted-foreground">({tool.shortcut})</span>
                </TooltipContent>
              </Tooltip>
            );
          })}

          <div className="h-5 w-px bg-border mx-0.5" aria-hidden="true" />

          {/* Color Palette Popover */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Select stroke color"
                  className="hover:bg-muted"
                >
                  <span
                    className="size-5 rounded-full border border-border shadow-inner transition-transform hover:scale-110"
                    style={{ backgroundColor: activeColor }}
                  />
                </Button>
              }
            />
            <PopoverContent side="bottom" className="w-auto p-2 bg-popover text-popover-foreground border-border">
              <div className="flex items-center gap-1.5">
                {COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Color ${col}`}
                    onClick={() => setActiveColor(col)}
                    className={`size-6 rounded-full border transition-all ${
                      activeColor === col
                        ? "scale-125 border-foreground ring-2 ring-primary"
                        : "border-transparent hover:scale-110"
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Stroke Width Selector */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Select stroke width"
                  className="font-mono font-medium text-foreground hover:bg-muted"
                >
                  {activeSize}px
                </Button>
              }
            />
            <PopoverContent side="bottom" className="w-auto p-2 bg-popover border-border">
              <div className="flex items-center gap-1">
                {SIZES.map((sz) => (
                  <Button
                    key={sz}
                    variant={activeSize === sz ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveSize(sz)}
                    className="font-mono"
                  >
                    {sz}px
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </nav>

        {/* Right Actions & AI Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Document File Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Document export and file options"
                  className="bg-card/90 backdrop-blur border-border text-foreground hover:bg-muted gap-1.5"
                >
                  <HugeiconsIcon icon={FloppyDiskIcon} className="size-4" aria-hidden="true" />
                  <span className="hidden md:inline">File</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground w-44">
              <DropdownMenuItem
                onClick={() => engine && exportCanvasPng(engine)}
                className="gap-2 hover:bg-muted cursor-pointer"
              >
                <HugeiconsIcon icon={FileDownloadIcon} className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>Export PNG Image</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => engine && exportCanvasJson(engine)}
                className="gap-2 hover:bg-muted cursor-pointer"
              >
                <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>Save JSON Snapshot</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 hover:bg-muted cursor-pointer"
              >
                <HugeiconsIcon icon={Folder01Icon} className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>Open JSON File</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* AI Auto Mode & AI Trigger */}
          <div className="flex items-center gap-1.5 p-1 bg-card/90 backdrop-blur border border-border rounded-lg shadow-md">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant={isAutoMode ? "default" : "secondary"}
                    onClick={() => setAutoMode(!isAutoMode)}
                    className={`cursor-pointer transition-colors select-none ${
                      isAutoMode
                        ? "bg-primary text-primary-foreground border border-primary/40 hover:bg-primary/90"
                        : "bg-secondary text-secondary-foreground border border-border hover:bg-muted"
                    }`}
                  >
                    Auto AI: {isAutoMode ? "ON" : "OFF"}
                  </Badge>
                }
              />
              <TooltipContent side="bottom">Toggle real-time AI perception</TooltipContent>
            </Tooltip>

            <Button
              onClick={() => triggerAiAnalysis("manual")}
              disabled={isAiThinking}
              aria-label="Analyze canvas with Drawva AI"
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1.5 shadow-md shadow-primary/20 transition-all disabled:opacity-50"
            >
              <HugeiconsIcon icon={SparklesIcon} className={`size-3.5 ${isAiThinking ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>{isAiThinking ? "Thinking…" : "AI Ask"}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Floating Bottom Zoom & Viewport Bar */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-card/90 backdrop-blur-md rounded-lg shadow-md border border-border font-mono text-sm text-card-foreground">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                onClick={() => setZoom(zoom * 0.8)}
                className="hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={ZoomIcon} className="size-4" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="top">Zoom out</TooltipContent>
        </Tooltip>

        <span className="font-semibold text-foreground tabular-nums min-w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                onClick={() => setZoom(zoom * 1.25)}
                className="hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={ZoomIcon} className="size-4" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="top">Zoom in</TooltipContent>
        </Tooltip>

        <div className="h-3 w-px bg-border mx-0.5" aria-hidden="true" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Reset zoom to 100%"
                onClick={() => setZoom(1.0)}
                className="font-sans text-primary hover:bg-primary/10 gap-1"
              >
                <HugeiconsIcon icon={Refresh01Icon} className="size-3" aria-hidden="true" />
                <span>Reset</span>
              </Button>
            }
          />
          <TooltipContent side="top">Reset camera scale</TooltipContent>
        </Tooltip>
      </div>

      {/* Floating Accept / Discard Draft Bar */}
      {hasDraft && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 bg-card text-card-foreground backdrop-blur-md rounded-lg shadow-lg border border-primary/40 animate-pulse">
          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
            AI Draft Suggestion
          </Badge>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={acceptDraft}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1"
            >
              <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" aria-hidden="true" />
              <span>Accept</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={discardDraft}
              className="border-border bg-secondary text-secondary-foreground hover:bg-muted font-semibold gap-1"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden="true" />
              <span>Discard</span>
            </Button>
          </div>
        </div>
      )}

      {/* Shadcn Dialog for Replacing Native Window Alerts */}
      <AlertDialog open={alertState?.open || false} onOpenChange={(open) => !open && closeAlert()}>
        <AlertDialogContent className="bg-popover border-border text-popover-foreground max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              {alertState?.title || "Notification"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {alertState?.message || ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={closeAlert}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
