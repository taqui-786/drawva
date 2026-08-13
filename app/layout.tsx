import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, JetBrains_Mono, MuseoModerno } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const museoModerno = MuseoModerno({subsets:['latin'],variable:'--font-brand'});

const jetbrainsMonoHeading = JetBrains_Mono({subsets:['latin'],variable:'--font-heading'});

const outfit = Outfit({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Drawva",
  description: "Drawva — AI infinite canvas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable, "font-sans", outfit.variable, jetbrainsMonoHeading.variable, museoModerno.variable)}>
      <body className="min-h-full antialiased">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
