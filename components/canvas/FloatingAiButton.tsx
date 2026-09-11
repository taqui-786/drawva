"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiSketchIcon, SquareStopIcon } from "@hugeicons/core-free-icons";

export interface FloatingAiButtonProps {
  isRunning?: boolean;
  onAskAi?: () => void;
  onCancelAi?: () => void;
  onClick?: () => void;
  className?: string;
  viewMode?: boolean;
}

export const FloatingAiButton: React.FC<FloatingAiButtonProps> = ({
  isRunning = false,
  onAskAi,
  onCancelAi,
  onClick,
  className,
  viewMode = false,
}) => {
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (isRunning) {
      onCancelAi?.();
    } else {
      onAskAi?.();
    }
  };

  return (
    <motion.div
      animate={{ y: [0, -4, 0] }}
      transition={{
        duration: 3.6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={cn(
        "fixed z-40 select-none",
        viewMode ? "bottom-4 right-4" : "bottom-5 right-5 sm:right-6",
        className
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={handleClick}
              className={cn(
                "group relative flex size-14 sm:size-15 items-center justify-center rounded-full cursor-pointer outline-none",
                "transition-all duration-500 ease-out",
                "hover:scale-110 active:scale-95",
                // Dynamic multi-layer drop shadows
                isRunning
                  ? "shadow-[0_10px_28px_rgba(244,63,94,0.35),0_2px_8px_rgba(0,0,0,0.12)] hover:shadow-[0_18px_40px_rgba(244,63,94,0.6),0_0_32px_rgba(244,63,94,0.45)] dark:shadow-[0_10px_32px_rgba(244,63,94,0.45),0_0_20px_rgba(244,63,94,0.25)] dark:hover:shadow-[0_18px_44px_rgba(244,63,94,0.7),0_0_36px_rgba(244,63,94,0.55)]"
                  : "shadow-[0_10px_28px_-4px_rgba(16,185,129,0.35),0_2px_10px_rgba(0,0,0,0.08)] hover:shadow-[0_18px_42px_-4px_rgba(16,185,129,0.55),0_0_32px_oklch(0.841_0.238_128.85/0.45)] dark:shadow-[0_10px_32px_-4px_oklch(0.841_0.238_128.85/0.4),0_0_24px_oklch(0.841_0.238_128.85/0.2)] dark:hover:shadow-[0_18px_44px_-4px_rgba(0,0,0,0.65),0_0_40px_oklch(0.841_0.238_128.85/0.65)]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              aria-label={isRunning ? "Cancel generation" : "Ask AI"}
            >
              {/* 1. Ambient living aura halo with expansion on hover */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -inset-3 sm:-inset-3.5 rounded-full blur-xl pointer-events-none transition-all duration-700",
                  isRunning
                    ? "bg-gradient-to-tr from-rose-600/40 via-amber-500/30 to-red-500/50 opacity-85 animate-pulse"
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

              {/* 3. High-tech rotating conic laser border beam */}
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

                {/* 4. Crystal glassmorphic button face (light & dark adaptive) */}
                <span
                  className={cn(
                    "absolute inset-[1.5px] rounded-full backdrop-blur-2xl transition-all duration-500",
                    "bg-gradient-to-b from-white/95 via-slate-50/90 to-emerald-50/80 dark:from-zinc-800/95 dark:via-zinc-900/90 dark:to-zinc-950/95",
                    "shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_-1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25),inset_0_-1px_2px_rgba(0,0,0,0.6)]"
                  )}
                />
              </div>

              {/* 5. Convex glass dome reflection highlight */}
              <span
                aria-hidden="true"
                className="absolute inset-[1.5px] rounded-full pointer-events-none bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.75)_0%,transparent_55%)] dark:bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.2)_0%,transparent_60%)]"
              />

              {/* 6. Inner atmospheric glow reflection */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-[1.5px] rounded-full pointer-events-none transition-opacity duration-500",
                  isRunning
                    ? "bg-[radial-gradient(circle_at_50%_75%,rgba(244,63,94,0.2)_0%,transparent_65%)]"
                    : "bg-[radial-gradient(circle_at_50%_75%,oklch(0.841_0.238_128.85/0.25)_0%,transparent_65%)] opacity-70 group-hover:opacity-100"
                )}
              />

              {/* 7. Prismatic diamond sheen sweep on hover */}
              <span
                aria-hidden="true"
                className="absolute inset-[1.5px] rounded-full overflow-hidden pointer-events-none"
              >
                <span className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/45 dark:via-white/20 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 cubic-bezier(0.16,1,0.3,1)" />
              </span>

              {/* 8. Subtle sketch sparkles that shimmer around the icon on hover */}
              <span
                aria-hidden="true"
                className="absolute top-2.5 right-3 size-1 rounded-full bg-emerald-400 dark:bg-primary shadow-[0_0_6px_currentColor] opacity-0 group-hover:opacity-100 transition-all duration-500 delay-75 group-hover:scale-125 pointer-events-none"
              />
              <span
                aria-hidden="true"
                className="absolute bottom-2.5 left-3 size-0.75 rounded-full bg-cyan-400 dark:bg-teal-300 shadow-[0_0_5px_currentColor] opacity-0 group-hover:opacity-100 transition-all duration-500 delay-150 group-hover:scale-125 pointer-events-none"
              />

              {/* 9. Interactive Center Icon with State Morph Transitions */}
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
                    className="relative z-10 flex items-center justify-center transition-transform duration-500 ease-out group-hover:scale-115 group-hover:-rotate-10 group-active:scale-95"
                  >
                    <HugeiconsIcon
                      icon={AiSketchIcon}
                      className="size-6 sm:size-6.5 text-emerald-600 dark:text-primary transition-colors duration-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.5)] dark:drop-shadow-[0_0_12px_oklch(0.841_0.238_128.85/0.85)] group-hover:drop-shadow-[0_0_20px_oklch(0.841_0.238_128.85/1)]"
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
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-md shadow-xl border border-border/60"
        >
          <span>{isRunning ? "Cancel generation" : "Ask AI to Draw"}</span>
        </TooltipContent>
      </Tooltip>
    </motion.div>
  );
};

export default FloatingAiButton;
