import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/landing/theme";

export function Nav() {
  return (
    <header className="relative z-50 w-full px-4 pt-4 md:px-6">
      <nav
        aria-label="Main"
        className="mx-auto flex h-13 w-full max-w-[1440px] items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/70 pl-5 pr-2 shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_6%,transparent),0_12px_32px_-16px_color-mix(in_oklch,var(--primary)_35%,transparent)] backdrop-blur-xl"
      >
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Drawva home"
        >
          <span className="brand-wordmark text-xl leading-none">Drawva</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            render={
              <a
                href="https://github.com/taqui-786/drawva"
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            className="hidden gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <HugeiconsIcon icon={GithubIcon} className="size-4" aria-hidden />
            <span>GitHub</span>
          </Button>

          <ThemeToggle />

          <Button
            size="sm"
            render={<Link href="/canvas" />}
            className="gap-1.5 rounded-full font-medium shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
          >
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5" aria-hidden />
            <span>Launch Canvas</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
