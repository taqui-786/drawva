"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiSketchIcon,
  SquareStopIcon,
  AiViewIcon,
  HierarchyCircle01Icon,
  SlidersHorizontalIcon,
  PencilEdit01Icon,
  CursorMagicSelection01Icon,
  SlideIcon,
  BarChartIcon,
  AiBookIcon,
  Task01Icon,
  AiFileIcon,
  GroupLayersIcon,
  AiMagicIcon,
  PlayIcon,
  ArrowRight01Icon,
  BubbleChatSparkIcon,
} from "@hugeicons/core-free-icons";
import { CustomInstructionDialog } from "./CustomInstructionDialog";

export interface FloatingAiButtonProps {
  isRunning?: boolean;
  onAskAi?: (prompt?: string) => void;
  onCancelAi?: () => void;
  onClick?: () => void;
  className?: string;
  viewMode?: boolean;
}

export interface QuickActionItem {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  icon: typeof AiViewIcon;
}

// Complete catalog of 13 whiteboard AI quick actions (pure options, zero fluff)
const AI_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: "continue",
    title: "Continue",
    subtitle: "Elaborate drawings & next steps",
    prompt:
      "Do not only describe the next steps. Continue and elaborate on what is currently drawn or written on the canvas: complete the missing steps, drawings, or sequence directly on the board.",
    icon: PlayIcon,
  },
  {
    id: "follow-cues",
    title: "Follow canvas cues",
    subtitle: "Continue from latest drawings & cues",
    prompt:
      "Follow my latest Canvas drawings, images, text boxes, and annotations. Continue and refine the work directly on Canvas without changing unmarked content; ask if unclear.",
    icon: CursorMagicSelection01Icon,
  },
  {
    id: "enhance",
    title: "Enhance",
    subtitle: "Preserve handwriting, add visual layers",
    prompt:
      "Keep the current handwriting completely unchanged—do not edit, erase, or move it. Add a transparent explanatory visual layer around it with annotations, connectors, diagrams, or formulas to make the notes more vivid and intuitive.",
    icon: AiMagicIcon,
  },
  {
    id: "revise",
    title: "Revise",
    subtitle: "Apply marked annotations & sketches",
    prompt:
      "Apply my new Canvas annotations and sketches: add, remove, move, resize, or reconnect only clearly marked content, and ask about ambiguity first.",
    icon: PencilEdit01Icon,
  },
  {
    id: "simplify",
    title: "Simplify",
    subtitle: "Simple diagram of core concepts",
    prompt:
      "Do not only describe the content. Create and display a separate, simple visual diagram on Canvas showing the core concepts, relationships, and essential labels without visual clutter.",
    icon: AiViewIcon,
  },
  {
    id: "sequence",
    title: "Sequence",
    subtitle: "Convert into editable sequence diagram",
    prompt:
      "Do not return only source code. Create and display the rendered sequence diagram on Canvas showing actors and interactions, then provide its editable Mermaid diagram source.",
    icon: HierarchyCircle01Icon,
  },
  {
    id: "architecture",
    title: "Architecture",
    subtitle: "Map modules, dependencies & flow",
    prompt:
      "Do not return only text. Create and display a visual architecture map on Canvas showing the core modules, services, dependencies, data flow, and key boundaries.",
    icon: GroupLayersIcon,
  },
  {
    id: "organize",
    title: "Organize",
    subtitle: "Visual notes with hierarchy & themes",
    prompt:
      "Do not only describe how to organize it. Reorganize and display the current Canvas content as clear visual notes with themes, visual hierarchy, structured grouping boxes, and highlighted information gaps.",
    icon: SlidersHorizontalIcon,
  },
  {
    id: "explain",
    title: "Explain",
    subtitle: "Visual overview of structure & details",
    prompt:
      "Do not return only a written explanation. Create and display a visual overview on Canvas showing the purpose, structure, key relationships, and important details of what is drawn or written.",
    icon: AiFileIcon,
  },
  {
    id: "learn",
    title: "Learn",
    subtitle: "Layered diagram & pseudocode",
    prompt:
      "Do not only explain the concept in text. Create and display a layered visual diagram on Canvas with pseudocode or key formulas, data flow, and intuitive step-by-step breakdown.",
    icon: AiBookIcon,
  },
  {
    id: "analyze",
    title: "Analyze",
    subtitle: "Chart key metrics, trends & anomalies",
    prompt:
      "Do not return only a written analysis. Create and display visual charts, plots, or graphs on Canvas for key metrics, trends, anomalies, and conclusions based on the canvas data.",
    icon: BarChartIcon,
  },
  {
    id: "slides",
    title: "Slides",
    subtitle: "Presentation-ready visual layout",
    prompt:
      "Turn the current canvas view into a clean, presentation-ready layout with structured visual slide sections, titles, and diagrams.",
    icon: SlideIcon,
  },
  {
    id: "plan",
    title: "Plan",
    subtitle: "Visual roadmap, routes & milestones",
    prompt:
      "Do not return only a written plan. Create and display a visual roadmap or journey map on Canvas with daily milestones, tasks, dependencies, routes, and highlights.",
    icon: Task01Icon,
  },
];

export const FloatingAiButton: React.FC<FloatingAiButtonProps> = ({
  isRunning = false,
  onAskAi,
  onCancelAi,
  onClick,
  className,
  viewMode = false,
}) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const showMenu = isMenuOpen && !isRunning;

  // Click / tap outside to dismiss floating quick action menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  // Handle escape key to dismiss
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  // Clear single tap timer when agent begins running
  useEffect(() => {
    if (isRunning && singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  }, [isRunning]);

  // Desktop hover handling with smooth buffer to transition between button and menu
  const handleMouseEnter = () => {
    if (isRunning) return;
    // Don't auto-open on touch devices on synthetic hover
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsMenuOpen(true);
  };

  const handleMouseLeave = () => {
    // Ignore on touch devices so the menu doesn't vanish when user lifts their finger
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setIsMenuOpen(false);
    }, 240);
  };

  const handleActionClick = (promptText: string) => {
    setIsMenuOpen(false);
    onAskAi?.(promptText);
  };

  const handleMainButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isRunning) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      onCancelAi?.();
      setIsMenuOpen(false);
      return;
    }
    if (onClick) {
      onClick();
      return;
    }

    const isTouchPointer =
      typeof window !== "undefined" &&
      window.PointerEvent &&
      e.nativeEvent instanceof PointerEvent &&
      e.nativeEvent.pointerType === "touch";
    const isCoarse =
      typeof window !== "undefined" &&
      (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768);
    const isTouch = isTouchPointer || isCoarse;

    // On touch devices: 1 tap runs AI as usual, double tap opens menu without running AI
    if (isTouch) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTimeRef.current;

      // Double-tap detected (second tap within 280ms) -> Open menu without running AI
      if (timeSinceLastTap > 0 && timeSinceLastTap < 280) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapTimeRef.current = 0;
        setIsMenuOpen(true);
        return;
      }

      // If menu is already open, single tap closes it
      if (isMenuOpen) {
        setIsMenuOpen(false);
        lastTapTimeRef.current = 0;
        return;
      }

      // First tap -> start timer to trigger AI if no second tap arrives
      lastTapTimeRef.current = now;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        lastTapTimeRef.current = 0;
        setIsMenuOpen(false);
        onAskAi?.();
      }, 260);
      return;
    }

    // On desktop (mouse pointer), single click executes default Ask AI directly
    setIsMenuOpen(false);
    onAskAi?.();
  };

  return (
    <div
      data-guide="ai-button"
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "fixed z-40 select-none",
        viewMode ? "bottom-2 right-2 sm:bottom-4 sm:right-4" : "bottom-2 right-2.5 sm:bottom-5 sm:right-6",
        className
      )}
    >
      {/* Floating AI Options Deck (Dual-column on desktop, compact & tactile, no slop) */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute bottom-[calc(100%+14px)] right-0 z-50 pointer-events-auto",
              "w-[340px] sm:w-[430px] max-w-[calc(100vw-20px)]",
              "rounded-2xl p-2",
              // Frosted glass with subtle specular highlight
              "bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl",
              "border border-black/[0.08] dark:border-white/[0.12]",
              "shadow-[0_20px_50px_-10px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.8)_inset] dark:shadow-[0_24px_60px_-10px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[310px] sm:max-h-none overflow-y-auto sm:overflow-visible pr-0.5 sm:pr-0 scrollbar-thin">
              {AI_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleActionClick(action.prompt)}
                  className={cn(
                    "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left cursor-pointer outline-none",
                    "bg-black/[0.02] dark:bg-white/[0.03]",
                    "border border-transparent hover:border-black/[0.06] dark:hover:border-white/[0.1]",
                    "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80",
                    "transition-all duration-150 active:scale-[0.98]"
                  )}
                >
                  {/* Unified subtle icon badge matching reference screenshot */}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 dark:bg-primary/15 text-primary border border-primary/15 dark:border-primary/20 transition-all duration-150 group-hover:bg-primary/[0.15] dark:group-hover:bg-primary/[0.22] group-hover:scale-105">
                    <HugeiconsIcon icon={action.icon} className="size-3.5" />
                  </span>

                  {/* Text labels */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                      {action.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate group-hover:text-foreground/80 transition-colors leading-tight mt-0.5">
                      {action.subtitle}
                    </div>
                  </div>

                  {/* Hover Arrow */}
                  <span className="shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 text-muted-foreground group-hover:text-primary">
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                  </span>
                </button>
              ))}

              {/* 14th Action: Highlighted Custom instruction button filling the empty slot */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsCustomDialogOpen(true);
                }}
                className={cn(
                  "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left cursor-pointer outline-none",
                  "bg-primary/[0.08] dark:bg-primary/[0.14]",
                  "border border-primary/30 hover:border-primary/50 dark:border-primary/40 dark:hover:border-primary/60",
                  "hover:bg-primary/[0.14] dark:hover:bg-primary/[0.22]",
                  "shadow-[0_0_12px_rgba(var(--primary),0.08)]",
                  "transition-all duration-150 active:scale-[0.98]"
                )}
              >
                {/* Highlighted icon badge */}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs shadow-primary/30 transition-all duration-150 group-hover:scale-105">
                  <HugeiconsIcon icon={BubbleChatSparkIcon} className="size-3.5" />
                </span>

                {/* Text labels */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-primary transition-colors leading-tight flex items-center gap-1.5">
                    <span>Custom instruction</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-primary/20 text-primary">
                      Custom
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate group-hover:text-foreground/90 transition-colors leading-tight mt-0.5">
                    Type your own instructions
                  </div>
                </div>

                {/* Hover Arrow */}
                <span className="shrink-0 text-primary opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150">
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Floating Trigger Button with Tooltip */}
      <Tooltip>
        <TooltipTrigger
          render={
            <motion.button
              type="button"
              onClick={handleMainButtonClick}
              whileHover={reduceMotion ? undefined : { scale: 1.07 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className={cn(
                "group relative flex size-14 sm:size-15 items-center justify-center rounded-full cursor-pointer outline-none touch-manipulation",
                isRunning
                  ? "shadow-[0_10px_28px_-8px_oklch(0.841_0.238_128.85/0.55)] dark:shadow-[0_10px_32px_-8px_oklch(0.768_0.233_130.85/0.45)]"
                  : "shadow-[0_10px_28px_-8px_oklch(0.841_0.238_128.85/0.35)] hover:shadow-[0_14px_36px_-8px_oklch(0.841_0.238_128.85/0.5)] dark:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              aria-label={isRunning ? "Cancel AI generation" : "Ask AI to Draw"}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -inset-2 rounded-full bg-primary/25 blur-lg pointer-events-none transition-opacity duration-300",
                  isRunning
                    ? cn("opacity-80", !reduceMotion && "animate-pulse")
                    : "opacity-40 group-hover:opacity-70"
                )}
              />

              {!reduceMotion && !isRunning && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1.5 rounded-full pointer-events-none animate-[spin_8s_linear_infinite]"
                >
                  <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                </span>
              )}

              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full overflow-hidden pointer-events-none p-[1.5px] ring-1 ring-primary/25"
              >
                <span
                  className={cn(
                    "absolute inset-[1.5px] rounded-full",
                    "bg-gradient-to-b from-white via-white to-primary/15",
                    "dark:from-zinc-800 dark:via-zinc-900 dark:to-primary/20",
                    "shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]"
                  )}
                />
              </span>

              <span
                aria-hidden="true"
                className="absolute inset-[1.5px] rounded-full pointer-events-none bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.7)_0%,transparent_52%)] dark:bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.16)_0%,transparent_55%)]"
              />

              {!isRunning && (
                <span
                  aria-hidden="true"
                  className="absolute inset-[1.5px] rounded-full overflow-hidden pointer-events-none"
                >
                  <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent -translate-x-full group-hover:translate-x-[220%] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] dark:via-white/15" />
                </span>
              )}

              {isRunning && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 56 56"
                  className={cn(
                    "absolute inset-0 z-10 size-full pointer-events-none text-primary",
                    !reduceMotion && "animate-[spin_1.15s_linear_infinite]",
                  )}
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="25.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="opacity-20"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="25.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="40 120"
                  />
                </svg>
              )}

              <AnimatePresence mode="wait">
                {isRunning ? (
                  <motion.div
                    key="running-stop-icon"
                    initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduceMotion ? undefined : { scale: 0.6, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="relative z-20 flex items-center justify-center"
                  >
                    <HugeiconsIcon
                      icon={SquareStopIcon}
                      className="size-5 sm:size-5.5 text-primary"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle-sketch-icon"
                    initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={reduceMotion ? undefined : { scale: 0.6, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="relative z-20 flex items-center justify-center"
                  >
                    <HugeiconsIcon
                      icon={AiSketchIcon}
                      className="size-6 sm:size-6.5 text-primary"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          }
        />
        <TooltipContent
          side="left"
          sideOffset={14}
          className="pointer-events-none flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-md shadow-xl border border-border/60"
        >
          <span>{isRunning ? "Cancel generation" : "Click here for AI Draw"}</span>
        </TooltipContent>
      </Tooltip>

      {/* Full-screen Transparent Background Custom Instruction Dialog */}
      <CustomInstructionDialog
        open={isCustomDialogOpen}
        onClose={() => setIsCustomDialogOpen(false)}
        onSubmit={(promptText) => onAskAi?.(promptText)}
        isRunning={isRunning}
      />
    </div>
  );
};

export default FloatingAiButton;
