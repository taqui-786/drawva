"use client";

// ============================================================
// Reveal — IntersectionObserver-driven scroll-entry primitive.
// Fades + lifts children in as they enter the viewport, with an
// optional staggered cascade delay. Renders nothing extra in the
// DOM beyond the wrapper and respects prefers-reduced-motion.
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Cascade step for staggered reveals */
  index?: number;
  /** Fixed override delay in ms (takes precedence over index) */
  delayMs?: number;
  /** IntersectionObserver threshold 0..1 */
  threshold?: number;
  className?: string;
}

export function Reveal({
  children,
  index,
  delayMs,
  threshold = 0.15,
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Lazy init: honor reduced-motion in the first render without an
  // effect, so the synchronized setState stays in the observer callback.
  const [visible, setVisible] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, visible]);

  const delay = delayMs !== undefined ? delayMs : index !== undefined ? index * 80 : 0;

  const style: CSSProperties = {
    transitionDelay: visible ? `${delay}ms` : "0ms",
  };

  return (
    <div ref={ref} data-reveal="" className={cn(visible && "is-visible", className)} style={style}>
      {children}
    </div>
  );
}
