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
  CursorIcon,
  EraserIcon,
  TextIcon,
  UndoIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export interface CanvasHelpGuideProps {
  isVisible: boolean;
  onDismiss: () => void;
  onImportJson?: () => void;
}

function SketchArrow({
  width,
  height,
  path,
  head,
  className,
}: {
  width: number;
  height: number;
  path: string;
  head: string;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible shrink-0", className)}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d={head}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const noteHalo =
  "[text-shadow:0_1px_10px_var(--background),0_0_18px_var(--background)]";

function Note({
  title,
  body,
  kbd,
  accent,
  align = "left",
  tilt,
  className,
}: {
  title: string;
  body?: string;
  kbd?: string;
  accent?: boolean;
  align?: "left" | "right" | "center";
  tilt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-sketch leading-snug",
        noteHalo,
        align === "right" && "text-right",
        align === "center" && "text-center",
        tilt,
        className,
      )}
    >
      <p
        className={cn(
          "text-base sm:text-lg",
          accent
            ? "text-emerald-600 dark:text-primary font-semibold"
            : "text-zinc-600 dark:text-zinc-300",
        )}
      >
        {title}
      </p>
      {body ? (
        <p className="mt-0.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          {body}
        </p>
      ) : null}
      {kbd ? (
        <p className="mt-0.5 font-sans font-mono text-[10px] sm:text-[11px] text-zinc-400">
          {kbd}
        </p>
      ) : null}
    </div>
  );
}

const SHORTCUTS: {
  label: string;
  keys: string;
  icon: typeof PencilIcon;
  accent?: boolean;
  href?: string;
  action?: "import";
  hideOnMobile?: boolean;
}[] = [
  { label: "Open JSON file", keys: "Ctrl+O", icon: Folder01Icon, action: "import" },
  { label: "Select objects", keys: "V", icon: CursorIcon, hideOnMobile: true },
  { label: "Draw with pen", keys: "P", icon: PencilIcon },
  { label: "Pan canvas", keys: "Space / H", icon: HandIcon },
  { label: "Erase strokes", keys: "E", icon: EraserIcon, hideOnMobile: true },
  { label: "Add text", keys: "T", icon: TextIcon, hideOnMobile: true },
  { label: "Undo / redo", keys: "Ctrl+Z / Ctrl+Shift+Z", icon: UndoIcon, hideOnMobile: true },
  {
    label: "Ask AI to draw",
    keys: "Click AI",
    icon: AiBrain01Icon,
    accent: true,
  },
  { label: "User manual", keys: "?", icon: BookOpen01Icon, href: "/manual" },
];

export const CanvasHelpGuide: React.FC<CanvasHelpGuideProps> = ({
  isVisible,
  onDismiss,
  onImportJson,
}) => {
  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-30 pointer-events-none select-none overflow-hidden"
        >
          {/* Top-left: Community + Manual (arrow up into those nav links) */}
          <div className="fixed top-12 left-[6.5rem] xl:left-[7.5rem] hidden lg:flex flex-col items-start">
            <SketchArrow
              width={22}
              height={34}
              path="M 11 32 Q 11 16 11 4"
              head="M 5 12 L 11 4 L 17 12"
              className="text-zinc-400 dark:text-zinc-500 ml-10"
            />
            <Note
              title="Community & Manual"
              body="Browse public Dravs, or open the full shortcut list."
              tilt="-rotate-1"
              className="max-w-[16rem]"
            />
          </div>

          {/* Top-right: Save (arrow up into Save) */}
          <div className="fixed top-12 right-[21rem] xl:right-[25rem] hidden lg:flex flex-col items-end">
            <SketchArrow
              width={36}
              height={34}
              path="M 8 32 Q 18 18 28 4"
              head="M 20 6 L 28 4 L 27 12"
              className="text-zinc-400 dark:text-zinc-500 mr-1"
            />
            <Note
              title="Save to cloud"
              body="Cloud backup for this board."
              align="right"
              tilt="-rotate-1"
              className="w-[9.5rem]"
            />
          </div>

          {/* Top-right: Share (arrow up into Share) */}
          <div className="fixed top-12 right-[11.5rem] xl:right-[14rem] hidden md:flex flex-col items-end">
            <SketchArrow
              width={22}
              height={42}
              path="M 11 40 Q 11 18 11 4"
              head="M 5 12 L 11 4 L 17 12"
              className="text-zinc-400 dark:text-zinc-500 mr-4"
            />
            <Note
              title="Share a Drav"
              body="Publish to Community."
              align="right"
              tilt="rotate-1"
              className="w-[8.5rem]"
            />
          </div>

          {/* Top-right: Auto + sidebar (arrow up into Auto and the menu) */}
          <div className="fixed top-12 right-3 sm:right-4 hidden lg:flex flex-col items-end">
            <SketchArrow
              width={22}
              height={58}
              path="M 11 56 Q 11 24 11 4"
              head="M 5 12 L 11 4 L 17 12"
              className="text-zinc-400 dark:text-zinc-500 mr-0.5"
            />
            <Note
              title="Auto AI & menu"
              body="Auto runs after you pause. Sidebar holds canvases and settings."
              align="right"
              className="w-[9.25rem]"
            />
          </div>

          {/* Center: wide, crystal-clear, no card */}
          <div className="fixed left-1/2 top-[48%] sm:top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,40rem)] flex flex-col items-center text-center">
            <span className="brand-wordmark text-3xl sm:text-4xl font-bold leading-none tracking-tight">
              Drawva
            </span>

            <p
              className={cn(
                "mt-3 max-w-xl font-sketch text-lg sm:text-xl text-zinc-600 dark:text-zinc-300 leading-snug",
                noteHalo,
              )}
            >
              Your drawings stay in this browser. Storage can vanish without
              warning, so export a JSON file when the work matters.
            </p>

            <div className="mt-6 w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-left font-sketch text-base sm:text-lg text-zinc-600 dark:text-zinc-300">
              {SHORTCUTS.map((item) => {
                const rowClass = cn(
                  "items-center gap-3 py-0.5",
                  item.hideOnMobile ? "hidden sm:flex" : "flex",
                  item.accent && "text-emerald-600 dark:text-primary",
                );
                const inner = (
                  <>
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <HugeiconsIcon
                        icon={item.icon}
                        className={cn(
                          "size-4 shrink-0",
                          item.accent
                            ? "text-emerald-500 dark:text-primary"
                            : "text-zinc-400",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-sans font-mono text-[11px] text-zinc-400 shrink-0 w-[7.25rem] text-right">
                      {item.keys}
                    </span>
                  </>
                );

                if (item.action === "import" && onImportJson) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        onDismiss();
                        onImportJson();
                      }}
                      className={cn(
                        rowClass,
                        "pointer-events-auto cursor-pointer hover:text-foreground transition-colors outline-none",
                      )}
                    >
                      {inner}
                    </button>
                  );
                }

                if (item.href) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={cn(
                        rowClass,
                        "pointer-events-auto cursor-pointer hover:text-foreground transition-colors outline-none",
                      )}
                    >
                      {inner}
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className={rowClass}>
                    {inner}
                  </div>
                );
              })}
            </div>

            <p
              className={cn(
                "mt-5 max-w-lg font-sketch text-sm text-zinc-400 dark:text-zinc-500 leading-snug",
                noteHalo,
              )}
            >
              Scroll to zoom. Hold Space and drag to pan. Draw a question, then
              click AI and it reads the board.
            </p>
          </div>

          {/* Bottom-left: Zoom */}
          <div className="fixed bottom-14 sm:bottom-16 left-3 sm:left-6 hidden md:flex items-end gap-1.5">
            <SketchArrow
              width={32}
              height={44}
              path="M 22 4 Q 12 18 10 38"
              head="M 5 32 L 10 38 L 16 32"
              className="text-zinc-400 dark:text-zinc-500 mb-0.5"
            />
            <Note
              title="Zoom & reset"
              body="Fit the board, then click the % to jump back to 100%."
              kbd="Ctrl + / Ctrl - / Shift 0"
              tilt="rotate-1"
              className="max-w-[180px] mb-1"
            />
          </div>

          {/* Bottom-center: Toolbar */}
          <div className="fixed bottom-14 sm:bottom-[4.75rem] left-1/2 -translate-x-1/2 flex flex-col items-center max-w-[90vw]">
            <Note
              title="Pick a tool and start drawing"
              body="V select · H hand · P pen · E eraser · T text · R / O / A shapes"
              align="center"
              tilt="-rotate-1"
            />
            <SketchArrow
              width={32}
              height={28}
              path="M 16 2 Q 15 14 16 24"
              head="M 11 18 L 16 24 L 21 18"
              className="text-zinc-400 dark:text-zinc-500 mt-1"
            />
          </div>

          {/* Bottom-right: AI */}
          <div className="fixed bottom-12 sm:bottom-16 right-16 sm:right-20 flex items-end gap-1.5 max-w-[280px]">
            <Note
              title="Drawva AI Creator"
              body="Hover for quick actions. Click to generate from what is on the board."
              kbd="Touch: double-tap menu, tap to generate"
              accent
              align="right"
              tilt="rotate-1"
            />
            <SketchArrow
              width={36}
              height={32}
              path="M 2 6 Q 16 8 30 24"
              head="M 22 23 L 30 24 L 28 16"
              className="text-zinc-400 dark:text-zinc-500 mb-1"
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default CanvasHelpGuide;
