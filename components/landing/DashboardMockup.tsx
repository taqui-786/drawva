"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ComputerIcon,
  RotateRight01Icon,
  Share01Icon,
  Add01Icon,
  Copy01Icon,
  SparklesIcon,
  Maximize01Icon,
  GitGraphIcon,
  MathIcon,
} from "@hugeicons/core-free-icons";

export function DashboardMockup() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="rounded-t-2xl overflow-hidden bg-[#1a1a1c] shadow-[0_-20px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/10 text-left select-none">
      {/* Title bar / Browser Chrome */}
      <div className="bg-[#242427] border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
        {/* Left: Traffic Lights + Window Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>

          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <button
              type="button"
              className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
              title="Toggle Sidebar"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current stroke-[1.2]">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <line x1="6" y1="2" x2="6" y2="14" />
              </svg>
            </button>
            <button
              type="button"
              className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
              title="Back"
            >
              <HugeiconsIcon icon={ChevronLeftIcon} className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded text-white/25 cursor-not-allowed"
              title="Forward"
            >
              <HugeiconsIcon icon={ChevronRightIcon} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center: URL bar */}
        <div className="bg-[#1a1a1c] rounded-md px-4 sm:px-6 py-1 text-[10px] text-white/60 flex items-center gap-1.5 border border-white/5 font-mono shadow-inner">
          <HugeiconsIcon icon={ComputerIcon} className="w-3 h-3 text-emerald-400" />
          <span className="text-white/80 font-medium">drawva.ai</span>
          <span className="text-white/30 font-normal">/studio/whiteboard</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="p-1 rounded text-white/40 hover:text-white/70 transition-colors hidden sm:inline-flex"
            title="Reload"
          >
            <HugeiconsIcon icon={RotateRight01Icon} className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
            title="Share Board"
          >
            <HugeiconsIcon icon={Share01Icon} className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded text-white/40 hover:text-white/70 transition-colors hidden sm:inline-flex"
            title="New Item"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
            title="Copy URL"
          >
            <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Visual Showcase using public/landingMockImg.png */}
      <div
        className="relative w-full bg-[#1e1e21] overflow-hidden group cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link href="/canvas" className="block relative w-full focus:outline-none">
          {/* Real Canvas Mockup Image */}
          <div className="relative w-full aspect-[16/9] bg-white">
            <Image
              src="/landingMockImg.png"
              alt="Drawva AI Infinite Canvas Whiteboard Studio"
              fill
              priority
              sizes="(max-width: 896px) 100vw, 896px"
              className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.01]"
            />
          </div>

          {/* Interactive Floating Canvas Badges */}
          <div className="absolute top-4 left-4 flex flex-wrap gap-2 pointer-events-none">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-white font-mono text-[10px] shadow-lg">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Claude 3.5 Sonnet Vision</span>
            </div>

            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-white/90 font-mono text-[10px] shadow-lg">
              <HugeiconsIcon icon={GitGraphIcon} className="size-3 text-emerald-400" />
              <span>Mermaid Flowchart</span>
            </div>

            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-white/90 font-mono text-[10px] shadow-lg">
              <HugeiconsIcon icon={MathIcon} className="size-3 text-cyan-400" />
              <span>MathJax LaTeX</span>
            </div>
          </div>

          {/* Bottom Right Click To Launch Overlay Pill */}
          <motion.div
            animate={{ opacity: isHovered ? 1 : 0.85, y: isHovered ? 0 : 2 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gray-900/90 text-white font-medium text-xs shadow-xl backdrop-blur-md border border-white/15"
          >
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5 text-emerald-400" />
            <span>Click to enter interactive canvas</span>
            <HugeiconsIcon icon={Maximize01Icon} className="size-3 text-white/60" />
          </motion.div>
        </Link>
      </div>
    </div>
  );
}
