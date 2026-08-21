"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronDownIcon,
  Menu01Icon,
  Cancel01Icon,
  SparklesIcon,
  GithubIcon,
  GitGraphIcon,
  MathIcon,
  FunctionIcon,
  PeerToPeer01Icon,
} from "@hugeicons/core-free-icons";
import { Logo } from "@/components/landing/Logo";

const TOOLKIT_ITEMS = [
  {
    title: "7 Diagram Formats",
    desc: "Mermaid, Graphviz DOT, Vega-Lite, SMILES, BPMN, Cytoscape & GeoJSON",
    icon: GitGraphIcon,
  },
  {
    title: "MathJax & LaTeX",
    desc: "Convert handwritten equations to high-res SVG formulas",
    icon: MathIcon,
  },
  {
    title: "2D Graph Plotter",
    desc: "Plot functions and mathematical curves in real time",
    icon: FunctionIcon,
  },
  {
    title: "Zero-Cloud P2P Sync",
    desc: "Direct WebRTC DataChannels for real-time collaboration",
    icon: PeerToPeer01Icon,
  },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const toolkitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (toolkitRef.current && !toolkitRef.current.contains(e.target as Node)) {
        setToolkitOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="animate-fade-down relative z-20 w-full px-5 py-4 sm:px-8 sm:py-5 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Left: Logo + Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-gray-900 transition-opacity hover:opacity-85 outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 rounded-md"
          aria-label="Drawva home"
        >
          <Logo className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="font-semibold text-lg sm:text-xl tracking-tight text-gray-900">
            Drawva
          </span>
        </Link>

        {/* Center: Desktop Nav Links */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-8 text-[13px] font-medium text-gray-700">
          {/* Toolkit Dropdown */}
          <div ref={toolkitRef} className="relative">
            <button
              type="button"
              onClick={() => setToolkitOpen((prev) => !prev)}
              className="flex items-center gap-1 text-gray-700 transition-colors hover:text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 rounded-md px-1 py-0.5"
              aria-expanded={toolkitOpen}
            >
              <span>Toolkit</span>
              <HugeiconsIcon
                icon={ChevronDownIcon}
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  toolkitOpen ? "rotate-180 text-gray-900" : "text-gray-500"
                }`}
              />
            </button>

            <AnimatePresence>
              {toolkitOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute left-1/2 top-full mt-2.5 w-80 -translate-x-1/2 rounded-2xl bg-white/95 p-3 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl"
                >
                  <div className="space-y-1">
                    {TOOLKIT_ITEMS.map((item) => (
                      <Link
                        key={item.title}
                        href="/canvas"
                        onClick={() => setToolkitOpen(false)}
                        className="flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-gray-100/80"
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900/5 text-gray-800">
                          <HugeiconsIcon icon={item.icon} className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                          <p className="text-[11px] leading-snug text-gray-500">{item.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link href="/canvas" className="transition-colors hover:text-gray-900">
            Features
          </Link>
          <a
            href="https://github.com/taqui-786/drawva"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-gray-900"
          >
            <HugeiconsIcon icon={GithubIcon} className="h-3.5 w-3.5 opacity-70" />
            <span>GitHub</span>
          </a>
          <a
            href="https://taqui.in"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-gray-900"
          >
            About
          </a>
        </nav>

        {/* Right: CTA Button + Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/canvas"
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md hover:scale-[1.02] active:scale-95 sm:px-5"
          >
            <HugeiconsIcon icon={SparklesIcon} className="h-3.5 w-3.5 text-emerald-400" />
            <span>Launch Canvas</span>
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-900 transition-colors hover:bg-gray-900/10 md:hidden"
          >
            {mobileMenuOpen ? (
              <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" />
            ) : (
              <HugeiconsIcon icon={Menu01Icon} className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute left-4 right-4 top-full mt-2 rounded-2xl bg-white/90 px-5 py-3 shadow-xl ring-1 ring-gray-200 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col text-[15px] font-medium text-gray-700">
              <Link
                href="/canvas"
                onClick={() => setMobileMenuOpen(false)}
                className="border-b border-gray-200 py-3 transition-colors hover:text-gray-900"
              >
                Canvas Studio
              </Link>
              <Link
                href="/canvas"
                onClick={() => setMobileMenuOpen(false)}
                className="border-b border-gray-200 py-3 transition-colors hover:text-gray-900"
              >
                7 Diagram Formats
              </Link>
              <a
                href="https://github.com/taqui-786/drawva"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="border-b border-gray-200 py-3 flex items-center justify-between transition-colors hover:text-gray-900"
              >
                <span>GitHub Repository</span>
                <HugeiconsIcon icon={GithubIcon} className="h-4 w-4 text-gray-400" />
              </a>
              <Link
                href="/canvas"
                onClick={() => setMobileMenuOpen(false)}
                className="py-3 text-emerald-700 font-semibold flex items-center gap-2"
              >
                <HugeiconsIcon icon={SparklesIcon} className="h-4 w-4" />
                <span>Start Drawing Free</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
