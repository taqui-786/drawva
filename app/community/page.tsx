import type { Metadata } from "next";
import { CommunityPage } from "@/components/community/CommunityPage";

export const metadata: Metadata = {
  title: "Drawva Community — Explore Whiteboard Canvases & Diagrams",
  description:
    "Browse, view, like, comment, and remix community whiteboard Dravs created with Drawva's multimodal AI canvas engine.",
  openGraph: {
    title: "Drawva Community — Explore Whiteboard Canvases & Diagrams",
    description:
      "Browse, view, like, comment, and remix community whiteboard Dravs created with Drawva's multimodal AI canvas engine.",
    type: "website",
    url: "/community",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drawva Community — Explore Whiteboard Canvases & Diagrams",
    description:
      "Browse, view, like, comment, and remix community whiteboard Dravs created with Drawva's multimodal AI canvas engine.",
  },
};

export default function CommunityRoute() {
  return <CommunityPage />;
}
