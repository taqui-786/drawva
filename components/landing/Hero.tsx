"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp01Icon,
  SparklesIcon,
  GithubIcon,
  PencilIcon,
} from "@hugeicons/core-free-icons";
import { Navbar } from "@/components/landing/Navbar";
import { ScaledDashboard } from "@/components/landing/ScaledDashboard";
import { DashboardMockup } from "@/components/landing/DashboardMockup";

const BG_IMAGE_URL =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260611_133301_d5f2a94a-b22e-4e4a-a6b6-eacdddf1f5b0.png&w=1280&q=85";

const GRASS_OVERLAY_URL =
  "https://res.cloudinary.com/dy5er7kv5/image/upload/q_auto/f_auto/v1781191264/grass_eam204.png";

export function Hero() {
  const router = useRouter();
  const [promptQuery, setPromptQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/canvas");
  };

  return (
    <section
      style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
      className="relative min-h-[100svh] overflow-hidden bg-cover bg-center flex flex-col selection:bg-gray-900 selection:text-white"
    >
      {/* Top Navigation */}
      <Navbar />

      {/* Top Flex Spacer */}
      <div className="flex-1 min-h-8 sm:min-h-12 lg:min-h-16 shrink-0" />

      {/* Main Hero Content Area (Centered) */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Headline */}
        <h1 className="text-gray-900 font-normal leading-[1.05] tracking-tight text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-7xl xl:text-[80px]">
          <span className="block animate-fade-up">Get visual.</span>
          <span className="block animate-fade-up [animation-delay:100ms]">Effortlessly.</span>
        </h1>

        {/* Prompt / Search Bar */}
        <form
          onSubmit={handleSubmit}
          className="animate-fade-up [animation-delay:220ms] mt-5 sm:mt-6 w-full max-w-xl mx-auto"
        >
          <div className="flex items-center gap-3 rounded-full bg-white/60 backdrop-blur-md ring-1 ring-gray-200 pl-5 pr-1.5 py-1.5 shadow-sm transition-all focus-within:bg-white/80 focus-within:ring-gray-300 focus-within:shadow-md">
            <input
              type="text"
              value={promptQuery}
              onChange={(e) => setPromptQuery(e.target.value)}
              placeholder="What makes content rank in AI search?"
              className="flex-1 bg-transparent text-sm sm:text-base text-gray-900 placeholder-gray-500 outline-none py-2"
              aria-label="Ask or describe a diagram"
            />
            <button
              type="submit"
              aria-label="Submit prompt and launch canvas"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-900 text-white hover:scale-105 active:scale-95 transition-transform shrink-0 flex items-center justify-center shadow-sm"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </form>

        {/* Description */}
        <p className="animate-fade-up [animation-delay:340ms] mt-4 sm:mt-5 text-gray-600 text-sm sm:text-base lg:text-lg leading-relaxed max-w-md mx-auto">
          Ship articles that answer actual customer questions
          <br className="hidden sm:inline" />
          {" "}-- and be seen on{" "}
          <span className="inline-flex items-center font-medium text-gray-900">
            <HugeiconsIcon icon={SparklesIcon} className="inline w-4 h-4 -mt-1 text-emerald-600 mr-1" />
            ChatGPT
          </span>
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-up [animation-delay:460ms] mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/canvas"
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-6 py-2.5 rounded-full hover:bg-gray-800 hover:shadow-lg transition-all hover:scale-[1.02] active:scale-95"
          >
            <HugeiconsIcon icon={PencilIcon} className="w-4 h-4 text-emerald-400" />
            <span>Try It Free</span>
          </Link>
          <a
            href="https://github.com/taqui-786/drawva"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-gray-700 text-sm font-medium px-6 py-2.5 rounded-full ring-1 ring-gray-300 bg-white/30 hover:bg-gray-100 transition-colors"
          >
            <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
            <span>Talk to sales</span>
          </a>
        </div>
      </div>

      {/* Bottom Flex Spacer */}
      <div className="flex-1 min-h-10 sm:min-h-12 lg:min-h-16 shrink-0" />

      {/* Dashboard Mockup Area */}
      <div className="animate-hero-rise [animation-delay:620ms] relative z-0 w-[92%] sm:w-[84%] lg:w-[72%] max-w-4xl mx-auto shrink-0 -mb-10 sm:-mb-20 lg:-mb-32">
        <ScaledDashboard designWidth={896}>
          <DashboardMockup />
        </ScaledDashboard>
      </div>

      {/* Bottom Grass Overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={GRASS_OVERLAY_URL}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 z-10 w-full select-none"
      />
    </section>
  );
}
