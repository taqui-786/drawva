"use client";
// ============================================================
// Drawva — AI Prompt Bar Component
// Floating interactive bar at the bottom of the canvas viewport
// Allows prompt entry, action chips, status, and draft review controls
// ============================================================

import React, { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain02Icon,
  StructureIcon,
  HelpCircleIcon,
  Tick02Icon,
  Cancel01Icon,
  SentIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { AiUserAction } from "@/lib/ai/types";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];
function Icon({ icon, size = 18 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

interface AiPromptBarProps {
  isThinking: boolean;
  statusMessage: string | null;
  hasDraft: boolean;
  draftCount: number;
  error: string | null;
  onTriggerAi: (userPrompt: string, action?: AiUserAction) => void;
  onAcceptDraft: () => void;
  onDiscardDraft: () => void;
  onClearError: () => void;
}

export function AiPromptBar({
  isThinking,
  statusMessage,
  hasDraft,
  draftCount,
  error,
  onTriggerAi,
  onAcceptDraft,
  onDiscardDraft,
  onClearError,
}: AiPromptBarProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = useCallback(
    (e?: React.FormEvent, action: AiUserAction = "auto") => {
      if (e) e.preventDefault();
      if (!prompt.trim() && action === "auto") return;
      onTriggerAi(prompt.trim(), action);
      setPrompt("");
    },
    [prompt, onTriggerAi]
  );

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-2xl w-[92%] sm:w-[600px] pointer-events-auto select-none">
      {/* Error notification banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 w-full rounded-xl bg-destructive text-destructive-foreground text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <span className="truncate">{error}</span>
          <button
            onClick={onClearError}
            className="rounded p-0.5 hover:bg-black/20 transition-colors"
          >
            <Icon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      )}

      {/* Draft Approval Banner */}
      {hasDraft && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 w-full rounded-2xl bg-primary text-primary-foreground text-xs font-medium shadow-xl border border-primary-foreground/20 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary-foreground/20">
              <Icon icon={AiBrain02Icon} size={13} />
            </span>
            <span>
              Previewing <strong>{draftCount}</strong> generated AI item(s).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAcceptDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background text-foreground font-semibold hover:bg-background/90 active:scale-95 transition-all shadow-sm"
            >
              <Icon icon={Tick02Icon} size={14} />
              Accept
            </button>
            <button
              onClick={onDiscardDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 active:scale-95 transition-all"
            >
              <Icon icon={Cancel01Icon} size={14} />
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Main AI Input Bar */}
      <div
        className={cn(
          "flex items-center gap-2 p-1.5 pl-3.5 w-full rounded-2xl border border-border/80 shadow-2xl transition-all backdrop-blur-xl",
          isThinking
            ? "bg-card/95 ring-2 ring-primary/40"
            : "bg-card/90 hover:bg-card focus-within:ring-2 focus-within:ring-primary/40"
        )}
      >
        <span className="text-primary shrink-0">
          <Icon icon={AiBrain02Icon} size={20} />
        </span>

        <form
          onSubmit={(e) => handleSubmit(e, "auto")}
          className="flex flex-1 items-center gap-2"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isThinking
                ? "MiMo AI is working on canvas..."
                : "Ask AI: 'Draw authentication flowchart', 'Explain sketch'..."
            }
            disabled={isThinking}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none border-none focus:ring-0"
          />

          {/* Quick Action Chips */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSubmit(undefined, "flowchart")}
              disabled={isThinking}
              title="Generate Flowchart"
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Icon icon={StructureIcon} size={13} />
              Flowchart
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(undefined, "explain")}
              disabled={isThinking}
              title="Explain Canvas Content"
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Icon icon={HelpCircleIcon} size={13} />
              Explain
            </button>
          </div>

          <button
            type="submit"
            disabled={isThinking || (!prompt.trim() && !hasDraft)}
            aria-label="Send prompt to AI"
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all shrink-0",
              isThinking || (!prompt.trim() && !hasDraft)
                ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-md"
            )}
          >
            {isThinking ? (
              <span className="animate-spin">
                <Icon icon={Loading03Icon} size={16} />
              </span>
            ) : (
              <Icon icon={SentIcon} size={16} />
            )}
          </button>
        </form>
      </div>

      {/* Status indicator note */}
      {statusMessage && !error && (
        <span className="text-[11px] font-medium text-muted-foreground/80 tracking-wide transition-opacity">
          {statusMessage}
        </span>
      )}
    </div>
  );
}
