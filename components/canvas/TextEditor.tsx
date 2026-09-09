"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, TextIcon, Tick01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export interface TextEditorProps {
  screenX: number;
  screenY: number;
  color: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}

export function TextEditor({
  screenX,
  screenY,
  color,
  value,
  onChange,
  onCommit,
  onCancel,
  className,
}: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the textarea on appearance
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Clamp screen coordinates so the card is never positioned off-screen
  const boundedPos = useMemo(() => {
    if (typeof window === "undefined") {
      return { left: screenX, top: screenY };
    }
    const cardWidth = 380;
    const cardHeight = 220;
    const pad = 16;
    const maxLeft = Math.max(pad, window.innerWidth - cardWidth - pad);
    const maxTop = Math.max(64, window.innerHeight - cardHeight - pad);
    return {
      left: Math.max(pad, Math.min(maxLeft, screenX)),
      top: Math.max(64, Math.min(maxTop, screenY)),
    };
  }, [screenX, screenY]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) {
        onCommit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Add Text"
      className={cn(
        "absolute z-30 flex flex-col w-[340px] sm:w-[380px] rounded-xl border border-border/80 bg-background/95 text-foreground backdrop-blur-md shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
      style={{
        left: boundedPos.left,
        top: boundedPos.top,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-5 rounded-md bg-primary/10 text-primary">
            <HugeiconsIcon icon={TextIcon} className="size-3.5" />
          </div>
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Add Text
          </span>
          <span
            className="size-2.5 rounded-full border border-border/80 shadow-2xs shrink-0"
            style={{ backgroundColor: color }}
            title={`Ink color: ${color}`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onCancel}
          title="Cancel (Esc)"
          aria-label="Cancel"
          className="size-6 text-muted-foreground hover:text-foreground rounded-md"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </Button>
      </div>

      {/* Input Body */}
      <div className="p-3 flex flex-col gap-2.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type text to place on canvas…"
          rows={3}
          className="w-full resize-none border-0 bg-transparent p-0 text-sm font-normal leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 min-h-[76px] max-h-[220px]"
          style={{
            color,
            caretColor: color,
          }}
        />

        {/* Action Footer inside the input box */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 select-none">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
            <kbd className="rounded border border-border/70 bg-muted px-1 py-0.5 text-[10px] leading-none shadow-2xs">
              ⌘/Ctrl
            </kbd>
            <span>+</span>
            <kbd className="rounded border border-border/70 bg-muted px-1 py-0.5 text-[10px] leading-none shadow-2xs">
              ↵
            </kbd>
            <span className="ml-0.5 font-sans">insert</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="xs"
              onClick={onCommit}
              disabled={!value.trim()}
              className="text-xs font-medium gap-1 h-7 px-2.5 shadow-xs"
            >
              <HugeiconsIcon icon={Tick01Icon} className="size-3.5" />
              <span>Insert</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
