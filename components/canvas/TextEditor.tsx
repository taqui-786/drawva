"use client";

import React, { useEffect, useMemo, useRef } from "react";
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

function AcceptIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      color="currentColor"
      fill="none"
    >
      <path
        fill="currentColor"
        d="M1.25,12 C1.25,6.072 6.072,1.25 12,1.25 C17.928,1.25 22.75,6.072 22.75,12 C22.75,17.928 17.928,22.75 12,22.75 C6.072,22.75 1.25,17.928 1.25,12 Z M2.75,12 C2.75,17.1 6.9,21.25 12,21.25 C17.1,21.25 21.25,17.1 21.25,12 C21.25,6.9 17.1,2.75 12,2.75 C6.9,2.75 2.75,6.9 2.75,12 Z M9.757,15.385 C9.071,14.239 7.642,13.409 7.628,13.401 C7.269,13.195 7.145,12.737 7.35,12.378 C7.556,12.019 8.013,11.894 8.372,12.099 C8.426,12.13 9.405,12.695 10.266,13.605 C11.18,11.911 13.156,8.701 15.641,7.342 C16.004,7.143 16.46,7.277 16.659,7.64 C16.858,8.003 16.724,8.459 16.361,8.658 C13.42,10.266 11.106,15.262 11.083,15.312 C10.967,15.565 10.72,15.733 10.442,15.749 C10.435,15.749 10.428,15.749 10.421,15.75 C10.414,15.75 10.407,15.75 10.401,15.75 L10.4,15.75 C10.137,15.75 9.892,15.612 9.757,15.385 Z"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      color="currentColor"
      fill="none"
    >
      <path
        fill="currentColor"
        d="M12.75,22.75 C6.813,22.75 2,17.937 2,12 C2,6.063 6.813,1.25 12.75,1.25 C18.687,1.25 23.5,6.063 23.5,12 C23.5,17.937 18.687,22.75 12.75,22.75 Z M3.5,12 C3.5,17.109 7.641,21.25 12.75,21.25 C17.859,21.25 22,17.109 22,12 C22,6.891 17.859,2.75 12.75,2.75 C7.641,2.75 3.5,6.891 3.5,12 Z M10.28,8.47 L12.75,10.94 L15.22,8.47 C15.512,8.177 15.987,8.177 16.28,8.47 C16.573,8.763 16.573,9.237 16.28,9.53 L13.811,12 L16.28,14.47 C16.573,14.763 16.573,15.238 16.28,15.53 C15.987,15.823 15.512,15.823 15.219,15.53 L12.75,13.061 L10.281,15.53 C9.988,15.823 9.513,15.823 9.22,15.53 C8.927,15.238 8.927,14.763 9.22,14.47 L11.689,12 L9.22,9.53 C8.927,9.237 8.927,8.763 9.22,8.47 C9.513,8.177 9.987,8.177 10.28,8.47 Z"
      />
    </svg>
  );
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

  // Auto-focus and auto-size the textarea on appearance
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(260, Math.max(56, textareaRef.current.scrollHeight))}px`;
      }
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Clamp screen coordinates so the box is never positioned off-screen
  const boundedPos = useMemo(() => {
    if (typeof window === "undefined") {
      return { left: screenX, top: screenY };
    }
    const cardWidth = 520;
    const cardHeight = 150;
    const pad = 16;
    const maxLeft = Math.max(pad, window.innerWidth - cardWidth - pad);
    const maxTop = Math.max(64, window.innerHeight - cardHeight - pad);
    return {
      left: Math.max(pad, Math.min(maxLeft, screenX)),
      top: Math.max(64, Math.min(maxTop, screenY)),
    };
  }, [screenX, screenY]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onCommit();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) {
        onCommit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(260, Math.max(56, el.scrollHeight))}px`;
  };

  return (
    <div
      role="dialog"
      aria-label="Add text input"
      className={cn(
        "absolute z-30 flex flex-col w-[460px] sm:w-[520px] max-w-[calc(100vw-32px)] rounded-xl border-2 border-primary/50 focus-within:border-primary bg-transparent text-foreground shadow-none p-3 transition-colors animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
      style={{
        left: boundedPos.left,
        top: boundedPos.top,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Type text to place on canvas…"
        rows={2}
        className="w-full resize-none border-0 bg-transparent p-0 text-base font-normal leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 min-h-[56px] max-h-[260px]"
        style={{
          color,
          caretColor: color,
        }}
      />

      {/* Action icons: Remove (Cancel) and Accept (Insert) */}
      <div className="flex items-center justify-end gap-2 pt-1.5 select-none">
        <button
          type="button"
          onClick={onCancel}
          title="Cancel (Esc)"
          aria-label="Cancel"
          className="size-7 inline-flex items-center justify-center rounded-md border border-dashed border-black/25 dark:border-white/25 bg-white/90 dark:bg-zinc-900/90 text-foreground hover:text-red-600 hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-950/40 shadow-xs transition-colors cursor-pointer"
        >
          <RemoveIcon />
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={!value.trim()}
          title="Insert text (Enter)"
          aria-label="Insert"
          className="size-7 inline-flex items-center justify-center rounded-md border border-dashed border-primary bg-white/90 dark:bg-zinc-900/90 text-primary hover:bg-primary/10 shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        >
          <AcceptIcon />
        </button>
      </div>
    </div>
  );
}
