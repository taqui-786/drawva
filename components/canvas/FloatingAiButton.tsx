"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, SquareStopIcon } from "@hugeicons/core-free-icons";

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
    <div
      className={cn(
        "fixed z-40 select-none transition-all duration-300",
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
                "group relative flex size-13 sm:size-14 items-center justify-center rounded-full cursor-pointer outline-none transition-all duration-300",
                "hover:scale-108 active:scale-95",
                // High-contrast obsidian glass base
                "bg-gradient-to-b from-zinc-900 via-zinc-950 to-black",
                // Luminous border based on state
                isRunning
                  ? "border border-rose-500/70 hover:border-rose-500"
                  : "border border-primary/65 hover:border-primary",
                // Inset rim highlights and ambient glow
                isRunning
                  ? "shadow-[0_4px_24px_rgba(0,0,0,0.30),0_0_20px_rgba(244,63,94,0.4),inset_0_1px_1px_rgba(255,255,255,0.22)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.40),0_0_32px_rgba(244,63,94,0.65),inset_0_1px_2px_rgba(255,255,255,0.35)]"
                  : "shadow-[0_4px_24px_rgba(0,0,0,0.30),0_0_20px_oklch(0.841_0.238_128.85/0.45),inset_0_1px_1px_rgba(255,255,255,0.22)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.40),0_0_32px_oklch(0.841_0.238_128.85/0.70),inset_0_1px_2px_rgba(255,255,255,0.35)]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              aria-label={isRunning ? "Cancel generation" : "Ask AI"}
            >
              {/* Soft ambient aura */}
              <span
                className={cn(
                  "absolute -inset-1.5 rounded-full blur-md pointer-events-none opacity-70 group-hover:opacity-100 transition-all duration-300",
                  isRunning
                    ? "bg-rose-500/25 group-hover:bg-rose-500/35"
                    : "bg-primary/20 group-hover:bg-primary/30"
                )}
              />

              {/* Radial light sheen inside the button */}
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_25%,oklch(0.841_0.238_128.85/0.25)_0%,transparent_60%)] pointer-events-none" />

              {/* Centered icon without animation during generation */}
              {isRunning ? (
                <HugeiconsIcon
                  icon={SquareStopIcon}
                  className="relative z-10 size-5 sm:size-5.5 text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                />
              ) : (
                <HugeiconsIcon
                  icon={AiMagicIcon}
                  className="relative z-10 size-6 sm:size-6.5 text-primary drop-shadow-[0_0_12px_oklch(0.841_0.238_128.85/0.85)] transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:drop-shadow-[0_0_16px_oklch(0.841_0.238_128.85/1)]"
                />
              )}
            </button>
          }
        />
        <TooltipContent side="left" className="text-xs font-sans">
          {isRunning ? "Cancel generation" : "Ask AI"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default FloatingAiButton;
