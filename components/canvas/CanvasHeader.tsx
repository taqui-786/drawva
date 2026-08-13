"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ChevronDownIcon,
  CursorIcon,
  ColorsIcon,
  Delete02Icon,
  Download01Icon,
  EllipseIcon,
  EraserIcon,
  Folder01Icon,
  FunctionIcon,
  GitGraphIcon,
  HandIcon,
  HighlighterIcon,
  ImageAdd01Icon,
  Image01Icon,
  Loading02Icon,
  MathIcon,
  PencilIcon,
  RedoIcon,
  Settings01Icon,
  SparklesIcon,
  SquareIcon,
  TextIcon,
  UndoIcon,
  Upload01Icon,
  Share01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import type { CanvasMode } from "@/lib/canvas/types";

export interface AiRunState {
  phase: "idle" | "running" | "done" | "error";
  /** Label of the model currently generating. */
  activeProvider: string | null;
  /** Label of the model that produced the final result. */
  doneProvider: string | null;
}

const PALETTE = ["#111111", "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#9333ea", "#fbbf24"];

const TOOLS: { mode: CanvasMode; label: string; kbd: string; icon: typeof CursorIcon }[] = [
  { mode: "select", label: "Select", kbd: "V", icon: CursorIcon },
  { mode: "hand", label: "Hand", kbd: "H", icon: HandIcon },
  { mode: "pen", label: "Pen", kbd: "P", icon: PencilIcon },
  { mode: "highlighter", label: "Highlighter", kbd: "⇧H", icon: HighlighterIcon },
  { mode: "eraser", label: "Eraser", kbd: "E", icon: EraserIcon },
  { mode: "text", label: "Text", kbd: "T", icon: TextIcon },
  { mode: "rect", label: "Rectangle", kbd: "R", icon: SquareIcon },
  { mode: "ellipse", label: "Ellipse", kbd: "O", icon: EllipseIcon },
  { mode: "arrow", label: "Arrow", kbd: "A", icon: ArrowRight01Icon },
];

function ToolButton({
  mode,
  tool,
  onMode,
}: {
  mode: CanvasMode;
  tool: (typeof TOOLS)[number];
  onMode: (m: CanvasMode) => void;
}) {
  const active = mode === tool.mode;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant={active ? "secondaryPrimary" : "ghost"}
            aria-pressed={active}
            onClick={() => onMode(tool.mode)}
            data-icon="true"
          >
            <HugeiconsIcon icon={tool.icon} />
          </Button>
        }
      />
      <TooltipContent>
        {tool.label} <span className="kbd">{tool.kbd}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function CanvasHeader({
  mode,
  onMode,
  color,
  onColor,
  pen,
  onPen,
  onImportImage,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  onExportPng,
  onExportJson,
  onImportJson,
  onInsertWidget,
  onInsertDiagram,
  onInsertFormula,
  onInsertPlot,
  aiStatus,
  aiRun,
  autoOn,
  onAutoChange,
  onAskAi,
  models,
  activeModel,
  onModelChange,
  onOpenSettings,
  syncStatus,
  syncRoomCode,
  syncPeerCount,
  onOpenConnect,
}: {
  mode: CanvasMode;
  onMode: (m: CanvasMode) => void;
  color: string;
  onColor: (c: string) => void;
  pen: number;
  onPen: (p: number) => void;
  onImportImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportPng: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onInsertWidget: () => void;
  onInsertDiagram: () => void;
  onInsertFormula: () => void;
  onInsertPlot: () => void;
  aiStatus: "idle" | "thinking" | "done" | "error";
  aiRun: AiRunState;
  autoOn: boolean;
  onAutoChange: (v: boolean) => void;
  onAskAi: () => void;
  models: string[];
  activeModel: string | null;
  onModelChange: (model: string | null) => void;
  onOpenSettings: () => void;
  syncStatus: "idle" | "hosting" | "connecting" | "connected" | "error";
  syncRoomCode: string | null;
  syncPeerCount: number;
  onOpenConnect: () => void;
}) {
  const drawing = ["pen", "highlighter", "eraser", "rect", "ellipse", "arrow"].includes(mode);

  // ---- AI status badge (live model / retry) ----
  let badgeNode: React.ReactNode;
  if (aiStatus === "thinking") {
    badgeNode = (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <HugeiconsIcon icon={Loading02Icon} className="animate-spin" />
        <span className="max-w-40 truncate">
          Generating… {aiRun.activeProvider || activeModel || ""}
        </span>
      </Badge>
    );
  } else if (aiStatus === "done") {
    badgeNode = (
      <Badge variant="secondary">
        {aiRun.doneProvider ? `Done · ${aiRun.doneProvider}` : "Done"}
      </Badge>
    );
  } else if (aiStatus === "error") {
    badgeNode = <Badge variant="destructive">Model failed</Badge>;
  } else {
    badgeNode = <Badge variant="secondary">Ready</Badge>;
  }

  const hasModels = models.length > 0;
  const settleValue = activeModel && hasModels && models.includes(activeModel) ? activeModel : (models[0] ?? "");

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2">
      {/* ── Left: brand + project menus ─────────────────────────── */}
      <div className="flex items-center gap-1">
        <span className="brand-wordmark px-2 text-lg leading-none">Drawva</span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                <HugeiconsIcon icon={Folder01Icon} />
                File
                <HugeiconsIcon icon={ChevronDownIcon} />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onExportPng}>
              <HugeiconsIcon icon={Image01Icon} />
              Export PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportJson}>
              <HugeiconsIcon icon={Download01Icon} />
              Save JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImportJson}>
              <HugeiconsIcon icon={Upload01Icon} />
              Open JSON…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                <HugeiconsIcon icon={GitGraphIcon} />
                Insert
                <HugeiconsIcon icon={ChevronDownIcon} />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Widgets</DropdownMenuLabel>
              <DropdownMenuItem onClick={onInsertWidget}>
                <HugeiconsIcon icon={Settings01Icon} />
                Interactive widget
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onInsertDiagram}>
                <HugeiconsIcon icon={GitGraphIcon} />
                Diagram
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Objects</DropdownMenuLabel>
              <DropdownMenuItem onClick={onInsertFormula}>
                <HugeiconsIcon icon={MathIcon} />
                Formula
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onInsertPlot}>
                <HugeiconsIcon icon={FunctionIcon} />
                Plot
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={syncStatus === "connected" ? "secondary" : "ghost"}
                size="sm"
                onClick={onOpenConnect}
                className="gap-1.5"
              >
                <HugeiconsIcon
                  icon={syncStatus === "connected" ? Wifi01Icon : Share01Icon}
                  className={syncStatus === "connected" ? "text-emerald-500" : ""}
                />
                {syncStatus === "connected" && syncRoomCode ? (
                  <span className="font-mono font-bold text-xs">{syncRoomCode}</span>
                ) : (
                  "Connect"
                )}
                {syncPeerCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {syncPeerCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <TooltipContent>Live Device Connection (P2P)</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* ── Center: drawing toolbar ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {TOOLS.slice(0, 3).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} />
        ))}
        <Separator orientation="vertical" className="mx-1 h-6" />
        {TOOLS.slice(3, 6).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} />
        ))}
        <Separator orientation="vertical" className="mx-1 h-6" />
        {TOOLS.slice(6, 7).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} />
        ))}
        <Separator orientation="vertical" className="mx-1 h-6" />
        {TOOLS.slice(7).map((t) => (
          <ToolButton key={t.mode} mode={mode} tool={t} onMode={onMode} />
        ))}

        {/* Style: color + stroke inside a popover */}
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Popover>
          <PopoverTrigger
            render={
              <Button size="icon-sm" variant="ghost" data-icon="true">
                <HugeiconsIcon icon={ColorsIcon} />
              </Button>
            }
          />
          <PopoverContent
            align="center"
            sideOffset={6}
            className="w-56 items-start gap-3"
          >
            <PopoverHeader>
              <PopoverTitle>Style</PopoverTitle>
            </PopoverHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => onColor(c)}
                  title={c}
                  aria-label={`Color ${c}`}
                  className="size-5 rounded-full border transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: color === c ? "var(--foreground)" : "var(--border)",
                    outline: color === c ? "2px solid var(--ring)" : "none",
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Stroke width</span>
                <span>{pen}px</span>
              </div>
              <Slider
                min={1}
                max={16}
                step={1}
                value={[pen]}
                onValueChange={(v) => onPen(Number(Array.isArray(v) ? v[0] : v))}
              />
            </div>
          </PopoverContent>
        </Popover>

        {drawing && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon-sm" variant="ghost" onClick={onImportImage} data-icon="true">
                  <HugeiconsIcon icon={ImageAdd01Icon} />
                </Button>
              }
            />
            <TooltipContent>Insert image</TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onUndo} disabled={!canUndo} data-icon="true">
                <HugeiconsIcon icon={UndoIcon} />
              </Button>
            }
          />
          <TooltipContent>
            Undo <span className="kbd">⌘Z</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onRedo} disabled={!canRedo} data-icon="true">
                <HugeiconsIcon icon={RedoIcon} />
              </Button>
            }
          />
          <TooltipContent>
            Redo <span className="kbd">⇧⌘Z</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="icon-sm" variant="ghost" onClick={onClear} data-icon="true">
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            }
          />
          <TooltipContent>Clear board</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* ── Right: AI controls + live model status ─────────────── */}
      <div className="flex shrink-0 items-center gap-1.5">
        {badgeNode}

        {aiStatus !== "thinking" && hasModels && (
          <Select
            value={settleValue}
            onValueChange={onModelChange}
            items={models.map((m) => ({ label: m, value: m }))}
          >
            <SelectTrigger size="sm" className="max-w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {aiStatus !== "thinking" && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground select-none">
            <Switch size="sm" checked={autoOn} onCheckedChange={onAutoChange} />
            Auto AI
          </label>
        )}

        {!autoOn && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onAskAi}
            disabled={aiStatus === "thinking"}
            className="gap-1.5"
          >
            <HugeiconsIcon icon={SparklesIcon} />
            Ask AI
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onOpenSettings}
                data-icon="true"
                aria-label="AI settings"
              >
                <HugeiconsIcon icon={Settings01Icon} />
              </Button>
            }
          />
          <TooltipContent>AI settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}