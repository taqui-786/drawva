"use client";

import Image from "next/image";
import Link from "next/link";

export function DrawvaCanvasPreview() {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.2)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        boxShadow:
          "var(--shadow-dashboard, 0 25px 80px -12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04))",
      }}
      className="w-full rounded-2xl overflow-hidden p-2 sm:p-3 md:p-3.5 backdrop-blur-xl transition-all select-none"
    >
      <Link
        href="/canvas"
        className="block relative w-full overflow-hidden rounded-xl border border-black/[0.06] bg-background shadow-xs transition-transform duration-300 hover:scale-[1.005] focus:outline-none"
      >
        <Image
          src="/landingMockImg.png"
          alt="Drawva AI Infinite Canvas Whiteboard"
          width={1376}
          height={768}
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="w-full h-auto block object-contain"
        />
      </Link>
    </div>
  );
}
