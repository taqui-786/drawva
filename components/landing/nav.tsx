import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PaintBrush01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/landing/theme";

export function Nav() {
  return (
    <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <HugeiconsIcon icon={PaintBrush01Icon} className="size-4" aria-hidden />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">Drawva</span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button
            size="sm"
            render={<Link href="/canvas" />}
            className="ml-1 gap-1.5"
          >
            Start drawing
          </Button>
        </div>
      </div>
    </header>
  );
}