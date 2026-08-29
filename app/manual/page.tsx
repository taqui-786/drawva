import type { Metadata } from "next";
import { ManualView } from "@/components/manual/ManualView";

export const metadata: Metadata = {
  title: "User Manual",
  description:
    "Complete documentation for Drawva — canvas tools and shortcuts, one-shot Canvas AI, the multi-step Drawva Agent, provider setup, token usage, plugins, real-time P2P collaboration, diagram formats, and saving.",
  alternates: { canonical: "/manual" },
  openGraph: {
    title: "Drawva User Manual",
    description:
      "Canvas tools, one-shot AI, the multi-step Drawva Agent, provider setup, token usage, P2P collaboration, plugins, and everything else you need to master Drawva.",
    url: "/manual",
  },
};

export default function ManualPage() {
  return <ManualView />;
}
