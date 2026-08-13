import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/landing/theme";
import { CONTAINER } from "@/components/landing/container";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className={`${CONTAINER} flex h-16 items-center justify-between gap-4`}>
        <Link
          href="/"
          className="group flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <span className="brand-wordmark text-2xl leading-none">Drawva</span>
        </Link>

        <div className="flex items-center gap-2">
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
            className="gap-1.5 font-medium shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
          >
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5" aria-hidden />
            <span>Launch Canvas</span>
          </Button>
        </div>
      </div>
    </header>
  );
}