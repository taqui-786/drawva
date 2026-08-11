import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const jetbrainsMonoHeading = JetBrains_Mono({subsets:['latin'],variable:'--font-heading'});

const roboto = Roboto({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBase = new URL(process.env.APP_URL ?? "https://drawva.vercel.app");

export const metadata: Metadata = {
  title: {
    default: "Drawva — AI-Powered Infinite Whiteboard & Visual Canvas",
    template: "%s | Drawva",
  },
  description:
    "Drawva is an offline-first, AI-powered infinite canvas. Sketch, write, plot math, create Mermaid diagrams, and generate interactive widgets seamlessly.",
  metadataBase,
  openGraph: {
    title: "Drawva — AI-Powered Infinite Whiteboard & Visual Canvas",
    description:
      "Drawva is an offline-first, AI-powered infinite canvas. Sketch, write, plot math, create Mermaid diagrams, and generate interactive widgets seamlessly.",
    type: "website",
    url: "/",
    siteName: "Drawva",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drawva — AI-Powered Infinite Whiteboard & Visual Canvas",
    description:
      "Drawva is an offline-first, AI-powered infinite canvas. Sketch, write, plot math, create Mermaid diagrams, and generate interactive widgets seamlessly.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "scroll-smooth", "font-sans", roboto.variable, jetbrainsMonoHeading.variable)}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
