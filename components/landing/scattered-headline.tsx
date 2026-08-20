"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Headline whose words scatter off-canvas then spring-snap into place,
 * staged ~15ms apart. Offsets are deterministically derived from the word
 * index (no Math.random) so the server and client render identical markup.
 */
const WORDS: { text: string; primary?: boolean }[] = [
  { text: "A" },
  { text: "canvas" },
  { text: "that" },
  { text: "reads", primary: true },
  { text: "your", primary: true },
  { text: "ink.", primary: true },
];

function prand(i: number, seed: number) {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function startX(i: number) {
  return (prand(i, 1) * 2 - 1) * 210;
}
function startY(i: number) {
  return (prand(i, 2) * 2 - 1) * 150;
}
function startRot(i: number) {
  return (prand(i, 3) * 2 - 1) * 48;
}

export function ScatteredHeadline() {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <h1 className="font-heading text-balance text-3xl font-bold leading-[1.06] tracking-tight sm:text-4xl lg:text-[3.2rem]">
        A canvas that <span className="text-primary">reads your ink</span>.
      </h1>
    );
  }

  return (
    <h1 className="font-heading flex flex-wrap items-baseline justify-start text-balance text-3xl font-bold leading-[1.06] tracking-tight sm:text-4xl lg:text-[3.2rem]">
      {WORDS.map((w, i) => (
        <motion.span
          key={w.text}
          initial={{ x: startX(i), y: startY(i), rotate: startRot(i), opacity: 0 }}
          animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 13,
            delay: 0.05 + i * 0.015,
          }}
          className={`mr-[0.26em] last:mr-0 ${
            w.primary ? "text-primary [font-variation-settings:'wght'_700]" : ""
          }`}
        >
          {w.text}
        </motion.span>
      ))}
    </h1>
  );
}
