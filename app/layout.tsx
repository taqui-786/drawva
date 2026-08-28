import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, JetBrains_Mono, MuseoModerno } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { StructuredData } from "@/components/seo/StructuredData";

const museoModerno = MuseoModerno({ subsets: ["latin"], variable: "--font-brand" });
const jetbrainsMonoHeading = JetBrains_Mono({ subsets: ["latin"], variable: "--font-heading" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const defaultTitle = "Drawva — AI Infinite Canvas Whiteboard Engine";
const defaultDescription =
  "Drawva is an open-source, tile-based infinite whiteboard engine powered by a multimodal AI perception agent. Draw vector ink, sketch diagrams, and automatically generate 7+ diagram formats (Mermaid, Graphviz, Vega-Lite, Cytoscape, GeoJSON), LaTeX math formulas, and code applets.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://drawva.com"),
  title: {
    default: defaultTitle,
    template: "%s | Drawva",
  },
  description: defaultDescription,
  keywords: [
    "Drawva",
    "AI Whiteboard",
    "AI Infinite Canvas",
    "Multimodal AI Agent",
    "Real-time Canvas AI",
    "Interactive Diagram Generator",
    "Mermaid Visualizer",
    "Graphviz DOT Generator",
    "Vega-Lite Charts",
    "LaTeX Math Canvas",
    "Open Source Whiteboard",
    "Md Taqui Imam",
    "Penecho alternative",
  ],
  authors: [{ name: "Md Taqui Imam", url: "https://taqui.in" }],
  creator: "Md Taqui Imam",
  publisher: "Md Taqui Imam",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Drawva",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 512,
        height: 512,
        alt: "Drawva — AI Infinite Canvas Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    creator: "@md_taqui_imam",
    images: ["/web-app-manifest-512x512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "Drawva",
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "developer-tools",
};

import { QueryProvider } from "@/components/providers/QueryProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        outfit.variable,
        jetbrainsMonoHeading.variable,
        museoModerno.variable
      )}
    >
      <head>
        <StructuredData />
      </head>
      <body className="min-h-full antialiased">
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
