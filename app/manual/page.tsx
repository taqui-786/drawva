import type { Metadata } from "next";
import { ManualView } from "@/components/manual/ManualView";

export const metadata: Metadata = {
  title: "User Manual",
  description:
    "Complete documentation for Drawva — canvas tools and shortcuts, AI provider setup (OpenAI, Anthropic, Gemini, Groq, NVIDIA, Ollama, LM Studio, OpenRouter), token usage monitoring, real-time P2P collaboration, diagram formats, plugins, and saving.",
  alternates: { canonical: "/manual" },
  openGraph: {
    title: "Drawva User Manual",
    description:
      "Tools, AI provider setup, token usage, P2P collaboration, and everything else you need to master the Drawva AI canvas.",
    url: "/manual",
  },
};

export default function ManualPage() {
  return <ManualView />;
}
