"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  PencilIcon,
  HandIcon,
  AiBrain01Icon,
  BookOpen01Icon,
} from "@hugeicons/core-free-icons";

export interface CanvasHelpGuideProps {
  isVisible: boolean;
  onDismiss: () => void;
  onImportJson?: () => void;
}

export const CanvasHelpGuide: React.FC<CanvasHelpGuideProps> = ({
  isVisible,
  onDismiss,
  onImportJson,
}) => {
  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-30 pointer-events-none select-none overflow-hidden"
      >
        {/* ============================================================ */}
        {/* 1. TOP-RIGHT CALLOUT: Save, share, reasoning, auto AI & menu */}
        {/* ============================================================ */}
        <div className="fixed top-12 sm:top-14 right-4 sm:right-7 flex items-start gap-1.5 sm:gap-2 pointer-events-none select-none">
          <div className="flex flex-col text-right -rotate-1">
            <span className="font-sketch text-base sm:text-lg text-zinc-500 dark:text-zinc-400 leading-snug">
              Save, share, reasoning, auto AI &amp; menu…
            </span>
          </div>

          {/* Curved pencil arrow pointing up-right into the header controls */}
          <svg
            width="34"
            height="32"
            viewBox="0 0 34 32"
            className="text-zinc-400 dark:text-zinc-500 overflow-visible shrink-0 mt-0.5"
          >
            <path
              d="M 4 24 Q 16 16 26 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M 18 5 L 26 4 L 25 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* ============================================================ */}
        {/* 2. CENTER CONTENT: 100% Transparent, No Card, No Button     */}
        {/* ============================================================ */}
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[92vw] sm:max-w-md w-full flex flex-col items-center text-center select-none bg-transparent border-none shadow-none pointer-events-none">
          {/* Logo Wordmark directly on canvas */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl sm:text-4xl font-bold brand-wordmark tracking-tight text-foreground/90">
              Drawva
            </span>
          </div>

          {/* Excalidraw-style storage notice in transparent handwritten font */}
          <p className="font-sketch text-lg sm:text-xl text-zinc-600 dark:text-zinc-300 leading-snug mb-5 max-w-sm">
            Your drawings are saved in your browser&apos;s storage.
            <br />
            Browser storage can be cleared unexpectedly.
            <br />
            Save your work to a file regularly to avoid losing it.
          </p>

          {/* Transparent Shortcuts & Quick Links list */}
          <div className="w-full max-w-[280px] sm:max-w-[300px] flex flex-col gap-2 font-sketch text-base sm:text-lg text-zinc-600 dark:text-zinc-300">
            {onImportJson && (
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  onImportJson();
                }}
                className="flex items-center justify-between pointer-events-auto cursor-pointer hover:text-foreground transition-colors group text-left outline-none"
              >
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    className="size-4 text-zinc-400 group-hover:text-primary transition-colors"
                  />
                  <span>Open JSON file</span>
                </span>
                <span className="font-mono text-xs text-zinc-400 font-sans">
                  Ctrl+O
                </span>
              </button>
            )}

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={PencilIcon}
                  className="size-4 text-zinc-400"
                />
                <span>Draw with pen</span>
              </span>
              <span className="font-mono text-xs text-zinc-400 font-sans">
                P
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={HandIcon}
                  className="size-4 text-zinc-400"
                />
                <span>Pan canvas</span>
              </span>
              <span className="font-mono text-xs text-zinc-400 font-sans">
                Space / H
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-emerald-600 dark:text-primary">
                <HugeiconsIcon
                  icon={AiBrain01Icon}
                  className="size-4 text-emerald-500 dark:text-primary"
                />
                <span>Ask AI to draw</span>
              </span>
              <span className="font-mono text-xs text-zinc-400 font-sans">
                Click AI
              </span>
            </div>

            <Link
              href="/manual"
              className="flex items-center justify-between pointer-events-auto cursor-pointer hover:text-foreground transition-colors group text-left outline-none mt-0.5"
            >
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={BookOpen01Icon}
                  className="size-4 text-zinc-400 group-hover:text-primary transition-colors"
                />
                <span>User manual &amp; shortcuts</span>
              </span>
              <span className="font-mono text-xs text-zinc-400 font-sans">
                ?
              </span>
            </Link>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. BOTTOM TOOLBAR CALLOUT: Pick a tool & Start drawing!      */}
        {/* ============================================================ */}
        <div className="fixed bottom-14 sm:bottom-18 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none max-w-[90vw]">
          <div className="flex flex-col items-center text-center -rotate-1">
            <span className="font-sketch text-lg sm:text-xl text-zinc-600 dark:text-zinc-300 leading-tight">
              Pick a tool &amp; Start drawing!
            </span>
            <span className="font-sketch text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">
              To move canvas, hold [Space] while dragging, or use the Hand tool (H)
            </span>
          </div>

          {/* Curved pencil arrow pointing down directly into the toolbar */}
          <svg
            width="32"
            height="28"
            viewBox="0 0 32 28"
            className="text-zinc-400 dark:text-zinc-500 overflow-visible mt-1"
          >
            <path
              d="M 16 2 Q 15 14 16 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M 11 18 L 16 24 L 21 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* ============================================================ */}
        {/* 4. BOTTOM-RIGHT CALLOUT: Drawva AI Creator                   */}
        {/* ============================================================ */}
        <div className="fixed bottom-12 sm:bottom-16 right-18 sm:right-22 flex items-end gap-1.5 sm:gap-2 pointer-events-none select-none max-w-[280px]">
          <div className="flex flex-col text-right rotate-1">
            <span className="font-sketch text-base sm:text-lg text-emerald-600 dark:text-primary leading-tight font-semibold">
              Drawva AI Creator
            </span>
            <span className="font-sketch text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">
              Hover for menu • Click to generate
            </span>
            <span className="font-sketch text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 leading-tight">
              (Touch: Double-tap for menu • Tap to generate)
            </span>
          </div>

          {/* Curved pencil arrow pointing down-right into the AI button */}
          <svg
            width="36"
            height="32"
            viewBox="0 0 36 32"
            className="text-zinc-400 dark:text-zinc-500 overflow-visible shrink-0 mb-1"
          >
            <path
              d="M 2 6 Q 16 8 30 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M 22 23 L 30 24 L 28 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CanvasHelpGuide;
