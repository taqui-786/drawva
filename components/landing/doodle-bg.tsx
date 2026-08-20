"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Ambient whiteboard background: faint hand-drawn doodles (ink strokes,
 * arrows, shapes, math marks) that draw themselves on load, then drift
 * slowly forever. Positions are fixed (no Math.random) so SSR markup
 * matches the client.
 */
type Doodle = {
  pos: string;
  size: string;
  rotate: number;
  delay: number;
  float: number;
  color: "primary" | "ink";
  opacity: number;
  paths: string[];
  hideBelowLg?: boolean;
};

const DOODLES: Doodle[] = [
  {
    // wavy ink stroke
    pos: "left-[3%] top-[20%]",
    size: "w-24 md:w-28",
    rotate: -8,
    delay: 0.5,
    float: 7,
    color: "primary",
    opacity: 0.4,
    paths: ["M6 62 C 20 28, 34 90, 48 52 C 60 20, 78 24, 94 44"],
  },
  {
    // arrow up-right
    pos: "right-[5%] top-[15%]",
    size: "w-16 md:w-20",
    rotate: 4,
    delay: 0.7,
    float: 8,
    color: "ink",
    opacity: 0.28,
    paths: ["M10 84 L 82 22", "M82 22 l -16 3", "M82 22 l -5 15"],
  },
  {
    // sketchy rectangle
    pos: "left-[6%] bottom-[18%]",
    size: "w-14 md:w-16",
    rotate: -6,
    delay: 0.9,
    float: 9,
    color: "ink",
    opacity: 0.26,
    paths: ["M14 24 L 88 18 L 90 78 L 10 84 Z"],
    hideBelowLg: true,
  },
  {
    // sketchy circle
    pos: "right-[2.5%] bottom-[26%]",
    size: "w-16 md:w-20",
    rotate: 0,
    delay: 1.05,
    float: 7.5,
    color: "primary",
    opacity: 0.35,
    paths: [
      "M50 12 C 78 12, 94 30, 91 53 C 88 78, 68 90, 45 88 C 21 86, 7 66, 11 43 C 14 25, 30 12, 52 13",
    ],
    hideBelowLg: true,
  },
  {
    // sigma Σ
    pos: "left-[15%] bottom-[9%]",
    size: "w-10 md:w-12",
    rotate: -4,
    delay: 1.2,
    float: 8.5,
    color: "primary",
    opacity: 0.4,
    paths: ["M74 16 L 28 16 L 54 48 L 28 82 L 74 82"],
    hideBelowLg: true,
  },
  {
    // sparkle
    pos: "right-[1.5%] top-[42%]",
    size: "w-8 md:w-10",
    rotate: 8,
    delay: 1.35,
    float: 6.5,
    color: "primary",
    opacity: 0.45,
    paths: ["M50 10 L 50 90", "M10 50 L 90 50", "M26 26 L 74 74", "M74 26 L 26 74"],
  },
  {
    // sine wave plot
    pos: "left-[37%] top-[9%]",
    size: "w-20 md:w-24",
    rotate: -2,
    delay: 1.5,
    float: 9.5,
    color: "ink",
    opacity: 0.26,
    paths: ["M4 50 Q 18 14, 32 50 T 60 50 T 88 50"],
    hideBelowLg: true,
  },
  {
    // checkmark
    pos: "left-[27%] bottom-[11%]",
    size: "w-10 md:w-12",
    rotate: 3,
    delay: 1.65,
    float: 7,
    color: "primary",
    opacity: 0.4,
    paths: ["M12 54 L 38 80 L 88 20"],
    hideBelowLg: true,
  },
  {
    // mini flowchart: two boxes joined by an arrow
    pos: "right-[24%] bottom-[7%]",
    size: "w-24 md:w-28",
    rotate: -3,
    delay: 1.8,
    float: 10,
    color: "ink",
    opacity: 0.28,
    paths: [
      "M6 34 L 38 32 L 39 62 L 7 64 Z",
      "M62 36 L 94 34 L 95 64 L 63 66 Z",
      "M40 48 L 58 48",
      "M58 48 l -7 -4",
      "M58 48 l -7 4",
    ],
    hideBelowLg: true,
  },
];

function DoodleShape({ d, reduce }: { d: Doodle; reduce: boolean }) {
  const stroke = d.color === "primary" ? "var(--primary)" : "var(--foreground)";
  return (
    <motion.div
      className={`pointer-events-none absolute ${d.pos} ${d.size} ${
        d.hideBelowLg ? "hidden lg:block" : ""
      }`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{
        opacity: d.opacity,
        y: reduce ? 0 : [0, -9, 0],
        rotate: reduce ? d.rotate : [d.rotate, d.rotate + 2.5, d.rotate],
      }}
      transition={
        reduce
          ? undefined
          : {
              opacity: { duration: 0.7, delay: d.delay },
              y: { duration: d.float, repeat: Infinity, ease: "easeInOut", delay: d.delay },
              rotate: { duration: d.float, repeat: Infinity, ease: "easeInOut", delay: d.delay },
            }
      }
    >
      <svg viewBox="0 0 100 100" fill="none" className="h-auto w-full" aria-hidden>
        {d.paths.map((p, i) => (
          <motion.path
            key={i}
            d={p}
            stroke={stroke}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reduce
                ? undefined
                : { duration: 1.1, ease: "easeInOut", delay: d.delay + 0.15 + i * 0.18 }
            }
          />
        ))}
      </svg>
    </motion.div>
  );
}

export function DoodleBg() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {DOODLES.map((d, i) => (
        <DoodleShape key={i} d={d} reduce={!!reduce} />
      ))}
    </div>
  );
}
