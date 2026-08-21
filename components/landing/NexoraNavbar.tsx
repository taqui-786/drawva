"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function NexoraNavbar() {
  return (
    <header className="relative z-30 w-full font-body">
      <nav
        aria-label="Main Navigation"
        className="mx-auto flex items-center justify-between px-6 py-5 md:px-12 lg:px-20"
      >
        {/* Left: Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-85 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <span className="text-base text-accent select-none" aria-hidden="true">
            ✦
          </span>
          <span>Nexora</span>
        </Link>

        {/* Right: Nav Links & CTA */}
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link
              href="/"
              className="text-foreground transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href="#pricing"
              className="transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="#about"
              className="transition-colors hover:text-foreground"
            >
              About
            </Link>
            <Link
              href="#contact"
              className="transition-colors hover:text-foreground"
            >
              Contact
            </Link>
          </div>

          <Button
            render={<Link href="/canvas" />}
            className="rounded-full px-5 text-sm font-medium shadow-sm transition-all hover:scale-[1.02] active:scale-95 bg-foreground text-background hover:bg-foreground/90"
          >
            Get Started
          </Button>
        </div>
      </nav>
    </header>
  );
}
