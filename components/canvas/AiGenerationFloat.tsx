"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RoseTwoLoader } from "./RoseTwoLoader";
import type { GenerationTickerState } from "./CanvasFooter";

/**
 * Floating AI generation indicator pinned to the canvas bottom-left.
 * Transparent, fixed-size: big RoseTwoLoader on top, stacked
 * conveyor message animation below it.
 */
export function AiGenerationFloat({
  tickerState,
}: {
  tickerState?: GenerationTickerState;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex w-[330px] sm:w-[440px] max-w-[75vw] flex-col items-start gap-1 bg-transparent select-none">
      <AnimatePresence mode="wait">
        {tickerState && tickerState.status !== "idle" && (
          <motion.div
            key="ai-generation-float"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-start gap-1 bg-transparent"
            title={tickerState.detail || tickerState.currentMessage}
          >
            {tickerState.status === "running" ? (
              <RoseTwoLoader
                size={72}
                className="h-[72px] w-[72px] shrink-0 drop-shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
              />
            ) : tickerState.status === "done" ? (
              <span className="ml-8 size-2.5 rounded-full bg-emerald-500 shrink-0 shadow-xs shadow-emerald-500/50" />
            ) : (
              <span className="ml-8 size-2.5 rounded-full bg-destructive shrink-0 shadow-xs shadow-destructive/50" />
            )}

            {/* Stack / conveyor animated AI response line */}
            <div className="relative flex min-h-10 w-full items-center overflow-hidden bg-transparent text-left">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={tickerState.messageId}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-0 line-clamp-2 bg-transparent text-xs font-mono leading-snug break-words whitespace-normal text-primary [text-shadow:0_1px_8px_var(--background),0_0_2px_var(--background)]"
                >
                  {tickerState.currentMessage}
                  {tickerState.detail ? (
                    <span className="text-primary/70">
                      {" "}
                      · {truncateTail(tickerState.detail, 220)}
                    </span>
                  ) : null}
                  {tickerState.status === "running" ? (
                    <ElapsedTimer key={tickerState.messageId} />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Show the live tail of a long stream; the newest tokens matter most. */
function truncateTail(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `…${clean.slice(-max + 1)}` : clean;
}

/** Live seconds since mount — keyed by messageId so a quiet model still reads as working, not stuck. */
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - t0) / 1000)),
      500
    );
    return () => clearInterval(id);
  }, []);
  return <span className="text-primary/60 tabular-nums"> · {elapsed}s</span>;
}
