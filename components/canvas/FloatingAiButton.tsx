"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, Loading03Icon } from "@hugeicons/core-free-icons";

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
                // High-contrast obsidian glass base: stands out boldly against white canvas with deep richness
                "bg-gradient-to-b from-zinc-900 via-zinc-950 to-black",
                // Crisp luminous border with subtle top highlight
                "border border-primary/65 hover:border-primary",
                // Inset rim highlights for tactile 3D glass orb feel
                "shadow-[0_4px_24px_rgba(0,0,0,0.30),0_0_20px_oklch(0.841_0.238_128.85/0.45),inset_0_1px_1px_rgba(255,255,255,0.22)]",
                "hover:shadow-[0_8px_32px_rgba(0,0,0,0.40),0_0_32px_oklch(0.841_0.238_128.85/0.70),inset_0_1px_2px_rgba(255,255,255,0.35)]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              aria-label={isRunning ? "Cancel AI generation" : "Ask AI"}
            >
              {/* Soft ambient neon aura that separates cleanly from white canvas */}
              <span className="absolute -inset-1.5 rounded-full bg-primary/20 blur-md pointer-events-none opacity-70 group-hover:opacity-100 group-hover:bg-primary/30 transition-all duration-300" />

              {/* Radial light sheen inside the button */}
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_25%,oklch(0.841_0.238_128.85/0.25)_0%,transparent_60%)] pointer-events-none" />

              {/* Pulsing ring indicator when AI is generating */}
              {isRunning && (
                <span className="absolute -inset-2 rounded-full border-2 border-primary/70 animate-ping pointer-events-none" />
              )}

              {/* Centered high-visibility icon */}
              {isRunning ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="relative z-10 size-6 text-primary animate-spin"
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
          {isRunning ? "AI is thinking… Click to cancel" : "Ask AI"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default FloatingAiButton;
