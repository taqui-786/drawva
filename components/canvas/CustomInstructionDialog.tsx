"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

export interface CustomInstructionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isRunning?: boolean;
}

const emptySubscribe = () => () => {};

export const CustomInstructionDialog: React.FC<CustomInstructionDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isRunning = false,
}) => {
  const [prompt, setPrompt] = useState("");
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus upon opening
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  // Handle Escape key to dismiss dialog
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPrompt("");
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleDismiss = () => {
    setPrompt("");
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning) return;
    setPrompt("");
    onClose();
    onSubmit(trimmed);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isMounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none"
          onClick={handleDismiss}
        >
          {/* Transparent / Frosted Canvas Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/25 dark:bg-black/45 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Minimalist Input Capsule: No heading, distraction-free */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 w-full max-w-xl sm:max-w-2xl",
              "rounded-2xl sm:rounded-3xl p-4 sm:p-5",
              "bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl",
              "border border-white/40 dark:border-white/10",
              "shadow-[0_24px_70px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_30px_90px_-15px_rgba(0,0,0,0.7)]",
              "ring-1 ring-primary/25"
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Custom AI Instruction"
          >
            {/* Auto-focused Textarea */}
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="What should AI draw or modify on the canvas? (e.g., 'Draw a flowchart for user authentication', 'Connect these notes with arrows', 'Create a sequence diagram')..."
              rows={3}
              className={cn(
                "w-full bg-transparent border-0 outline-none resize-none",
                "text-base sm:text-lg text-foreground placeholder:text-muted-foreground/60 leading-relaxed",
                "min-h-[110px] max-h-[260px] focus:ring-0 p-1 pr-2 scrollbar-thin"
              )}
            />

            {/* Bottom Actions Row: Just a button and subtle keyboard shortcut hint */}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
              {/* Keyboard shortcut hint */}
              <div className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5 select-none">
                <span className="font-medium text-foreground/80">↵</span> Enter to send
                <span className="opacity-40">·</span>
                <span>Shift+↵ new line</span>
                <span className="opacity-40">·</span>
                <span>Esc to close</span>
              </div>
              <div className="text-[10px] text-muted-foreground sm:hidden select-none">
                ↵ to send
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim() || isRunning}
                className={cn(
                  "group relative inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer outline-none transition-all duration-150",
                  prompt.trim() && !isRunning
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed opacity-60"
                )}
              >
                <span>Run AI</span>
                <HugeiconsIcon icon={SparklesIcon} className="size-4 transition-transform group-hover:rotate-12" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CustomInstructionDialog;
