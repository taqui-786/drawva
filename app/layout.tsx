import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-serif-newsreader" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBase = new URL(process.env.APP_URL ?? "https://drawva.vercel.app");

export const metadata: Metadata = {
  title: {
    default: "Drawva - Offline-first infinite whiteboard",
    template: "%s - Drawva",
  },
  description:
    "A freeform whiteboard that lives in your browser. Sketch, type, arrange, and export on an infinite canvas with local autosave. No account required.",
  metadataBase,
  openGraph: {
    title: "Drawva - Offline-first infinite whiteboard",
    description:
      "A freeform whiteboard that lives in your browser. Sketch, type, arrange, and export on an infinite canvas with local autosave. No account required.",
    type: "website",
    url: "/",
    siteName: "Drawva",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drawva - Offline-first infinite whiteboard",
    description:
      "A freeform whiteboard that lives in your browser. Sketch, type, arrange, and export on an infinite canvas with local autosave.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, geistHeading.variable, newsreader.variable, "font-sans", "scroll-smooth")}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
