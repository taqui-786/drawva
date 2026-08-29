"use client";

import { useEffect, useRef } from "react";

export interface RoseTwoLoaderProps {
  size?: number | string;
  className?: string;
  particleCount?: number;
}

/**
 * Mathematical curve loader based on Rose Two:
 * r(t) = (9.2 + 0.60s)(0.72 + 0.28s) cos(2t)
 * x(t) = 50 + cos t · r(t) · 3.25
 * y(t) = 50 + sin t · r(t) · 3.25
 */
export function RoseTwoLoader({
  size = 24,
  className = "",
  particleCount = 28,
}: RoseTwoLoaderProps) {
  const groupRef = useRef<SVGGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const circlesRef = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    let animId: number;
    const startedAt = performance.now();
    const trailSpan = 0.32;
    const durationMs = 5200;
    const rotationDurationMs = 28000;
    const pulseDurationMs = 4300;
    const roseA = 9.2;
    const roseABoost = 0.6;
    const roseBreathBase = 0.72;
    const roseBreathBoost = 0.28;
    const roseScale = 3.25;

    function getPoint(progress: number, detailScale: number) {
      const t = progress * Math.PI * 2;
      const a = roseA + detailScale * roseABoost;
      const r = a * (roseBreathBase + detailScale * roseBreathBoost) * Math.cos(2 * t);
      return {
        x: 50 + Math.cos(t) * r * roseScale,
        y: 50 + Math.sin(t) * r * roseScale,
      };
    }

    function normalizeProgress(progress: number) {
      return ((progress % 1) + 1) % 1;
    }

    function buildPathD(detailScale: number, steps = 120) {
      let d = "";
      for (let i = 0; i <= steps; i++) {
        const pt = getPoint(i / steps, detailScale);
        d += `${i === 0 ? "M" : " L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
      return d;
    }

    function render(now: number) {
      const time = now - startedAt;
      const progress = (time % durationMs) / durationMs;
      const pulseAngle = ((time % pulseDurationMs) / pulseDurationMs) * Math.PI * 2;
      const detailScale = 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
      const rotation = -((time % rotationDurationMs) / rotationDurationMs) * 360;

      if (groupRef.current) {
        groupRef.current.setAttribute("transform", `rotate(${rotation.toFixed(2)} 50 50)`);
      }
      if (pathRef.current) {
        pathRef.current.setAttribute("d", buildPathD(detailScale));
      }

      const circles = circlesRef.current;
      const count = circles.length;
      for (let i = 0; i < count; i++) {
        const node = circles[i];
        if (!node) continue;
        const tailOffset = i / (count - 1 || 1);
        const pt = getPoint(normalizeProgress(progress - tailOffset * trailSpan), detailScale);
        const fade = Math.pow(1 - tailOffset, 0.56);
        const radius = 1.2 + fade * 3.4;
        const opacity = 0.08 + fade * 0.92;

        node.setAttribute("cx", pt.x.toFixed(1));
        node.setAttribute("cy", pt.y.toFixed(1));
        node.setAttribute("r", radius.toFixed(1));
        node.setAttribute("opacity", opacity.toFixed(2));
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [particleCount]);

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`shrink-0 select-none overflow-visible ${className}`}
    >
      <g ref={groupRef}>
        <path
          ref={pathRef}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.2"
          className="text-muted-foreground/35 dark:text-muted-foreground/45"
        />
        {Array.from({ length: particleCount }).map((_, idx) => (
          <circle
            key={idx}
            ref={(el) => {
              circlesRef.current[idx] = el;
            }}
            fill="currentColor"
            className="text-primary"
          />
        ))}
      </g>
    </svg>
  );
}
