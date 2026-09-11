"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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
} from "@hugeicons/core-free-icons";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Desktop hover handling with smooth buffer to transition between button and menu
  const handleMouseEnter = () => {
    if (isRunning) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsMenuOpen(true);
  };

  const handleMouseLeave = () => {
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

  const handleMainButtonClick = () => {
    if (isRunning) {
      onCancelAi?.();
      setIsMenuOpen(false);
      return;
    }
    if (onClick) {
      onClick();
      return;
    }

    // Toggle menu state on button click
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <motion.div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      animate={{ y: [0, -4, 0] }}
      transition={{
        duration: 3.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={cn(
        "fixed z-40 select-none",
        viewMode ? "bottom-4 right-4" : "bottom-5 right-5 sm:right-6",
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
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={cn(
              "absolute bottom-[calc(100%+14px)] right-0 z-50 pointer-events-auto",
              "w-[340px] sm:w-[430px] max-w-[calc(100vw-24px)]",
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Floating Trigger Button with Tooltip */}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleMainButtonClick}
              className={cn(
                "group relative flex size-14 sm:size-15 items-center justify-center rounded-full cursor-pointer outline-none",
                "transition-transform duration-300 ease-out",
                "hover:scale-110 active:scale-95",
                // Elevated drop shadows with vibrant neon spill
                isRunning
                  ? "shadow-[0_12px_32px_rgba(244,63,94,0.4),0_2px_10px_rgba(0,0,0,0.15)] hover:shadow-[0_18px_44px_rgba(244,63,94,0.6),0_0_32px_rgba(244,63,94,0.4)] dark:shadow-[0_12px_36px_rgba(244,63,94,0.5),0_0_24px_rgba(244,63,94,0.3)]"
                  : "shadow-[0_12px_32px_-6px_rgba(16,185,129,0.35),0_2px_10px_rgba(0,0,0,0.06)] hover:shadow-[0_20px_48px_-6px_rgba(16,185,129,0.5),0_0_36px_oklch(0.841_0.238_128.85/0.45)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.6),0_0_28px_oklch(0.841_0.238_128.85/0.3)] dark:hover:shadow-[0_20px_48px_-6px_rgba(0,0,0,0.7),0_0_42px_oklch(0.841_0.238_128.85/0.6)]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              aria-label={isRunning ? "Cancel AI generation" : "Ask AI to Draw"}
            >
              {/* 1. Ambient living aura that blooms and breathes outside the button */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -inset-3 sm:-inset-3.5 rounded-full blur-xl pointer-events-none transition-all duration-700",
                  isRunning
                    ? "bg-gradient-to-tr from-rose-600/45 via-amber-500/35 to-red-500/50 opacity-85 animate-pulse"
                    : "bg-gradient-to-tr from-emerald-500/35 via-primary/45 to-teal-400/35 opacity-55 group-hover:opacity-100 group-hover:scale-130 group-hover:blur-2xl"
                )}
              />

              {/* 2. Sonar radar pulse ring when running */}
              {isRunning && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-2.5 rounded-full border-2 border-rose-500/60 animate-ping pointer-events-none opacity-40 duration-1000"
                />
              )}

              {/* 3. Celestial Orbiting Sparkle Star */}
              <div
                aria-hidden="true"
                className={cn(
                  "absolute -inset-2 rounded-full pointer-events-none",
                  isRunning
                    ? "animate-[spin_2s_linear_infinite]"
                    : "animate-[spin_6s_linear_infinite] group-hover:animate-[spin_3s_linear_infinite]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 size-1.5 rounded-full transition-all duration-500",
                    isRunning
                      ? "bg-rose-400 shadow-[0_0_8px_#f43f5e]"
                      : "bg-white dark:bg-primary shadow-[0_0_8px_#ffffff] dark:shadow-[0_0_10px_oklch(0.841_0.238_128.85)] group-hover:scale-125"
                  )}
                />
              </div>

              {/* 4. 360-degree rotating laser border beam */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full overflow-hidden pointer-events-none p-[1.5px]"
              >
                {/* Conic rotating beam that accelerates on hover */}
                <span
                  className={cn(
                    "absolute -inset-[100%] rounded-full transition-opacity duration-500",
                    isRunning
                      ? "bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(244,63,94,0.3)_230deg,#f43f5e_290deg,#fb7185_330deg,#ffffff_360deg)] animate-[spin_1.5s_linear_infinite]"
                      : "bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(52,211,153,0.3)_230deg,oklch(0.841_0.238_128.85)_290deg,#6ee7b7_330deg,#ffffff_360deg)] animate-[spin_4s_linear_infinite] group-hover:animate-[spin_1.8s_linear_infinite]"
                  )}
                />

                {/* 5. Crystalline glass face cutout (bright, luminous, light & dark adaptive) */}
                <span
                  className={cn(
                    "absolute inset-[1.5px] rounded-full backdrop-blur-2xl transition-all duration-500",
                    "bg-gradient-to-b from-white/95 via-slate-50/90 to-emerald-50/80 dark:from-zinc-800/95 dark:via-zinc-900/92 dark:to-zinc-950/95",
                    "shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25),inset_0_-1px_2px_rgba(0,0,0,0.6)]"
                  )}
                />
              </div>

              {/* 6. Convex glass dome reflection highlight */}
              <span
                aria-hidden="true"
                className="absolute inset-[1.5px] rounded-full pointer-events-none bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.75)_0%,transparent_55%)] dark:bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.2)_0%,transparent_60%)]"
              />

              {/* 7. Inner color glow */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-[1.5px] rounded-full pointer-events-none transition-opacity duration-500",
                  isRunning
                    ? "bg-[radial-gradient(circle_at_50%_75%,rgba(244,63,94,0.2)_0%,transparent_65%)]"
                    : "bg-[radial-gradient(circle_at_50%_75%,oklch(0.841_0.238_128.85/0.25)_0%,transparent_65%)] opacity-70 group-hover:opacity-100"
                )}
              />

              {/* 8. Diamond sheen sweep on hover */}
              <span
                aria-hidden="true"
                className="absolute inset-[1.5px] rounded-full overflow-hidden pointer-events-none"
              >
                <span className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/20 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 cubic-bezier(0.16,1,0.3,1)" />
              </span>

              {/* 9. Centered Animated Icon with State Morph Transitions */}
              <AnimatePresence mode="wait">
                {isRunning ? (
                  <motion.div
                    key="running-stop-icon"
                    initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.4, opacity: 0, rotate: 45 }}
                    transition={{ type: "spring", stiffness: 450, damping: 22 }}
                    className="relative z-10 flex items-center justify-center"
                  >
                    <HugeiconsIcon
                      icon={SquareStopIcon}
                      className="size-5 sm:size-5.5 text-rose-500 dark:text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.85)] animate-pulse"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle-sketch-icon"
                    initial={{ scale: 0.4, opacity: 0, rotate: 30 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.4, opacity: 0, rotate: -30 }}
                    transition={{ type: "spring", stiffness: 450, damping: 22 }}
                    className="relative z-10 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-115 group-hover:-rotate-8 group-active:scale-95"
                  >
                    <HugeiconsIcon
                      icon={AiSketchIcon}
                      className="size-6 sm:size-6.5 text-emerald-600 dark:text-primary drop-shadow-[0_2px_8px_rgba(16,185,129,0.5)] dark:drop-shadow-[0_0_14px_oklch(0.841_0.238_128.85/0.85)] group-hover:drop-shadow-[0_0_20px_oklch(0.841_0.238_128.85/1)]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
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
    </motion.div>
  );
};

export default FloatingAiButton;
