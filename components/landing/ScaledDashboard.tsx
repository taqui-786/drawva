"use client";

import { useEffect, useRef, useState } from "react";

interface ScaledDashboardProps {
  children: React.ReactNode;
  designWidth?: number;
}

export function ScaledDashboard({
  children,
  designWidth = 896,
}: ScaledDashboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !innerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const computedScale = Math.min(1, containerWidth / designWidth);
      setScale(computedScale);
      setHeight(innerRef.current.offsetHeight * computedScale);
    };

    updateScale();

    const ro = new ResizeObserver(() => {
      updateScale();
    });

    if (containerRef.current) ro.observe(containerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);

    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [designWidth]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ height: height ? `${height}px` : "auto" }}
    >
      <div
        ref={innerRef}
        style={{
          width: `${designWidth}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="shrink-0"
      >
        {children}
      </div>
    </div>
  );
}
