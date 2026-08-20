import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, LinkedinIcon, TwitterIcon } from "@hugeicons/core-free-icons";

const socials = [
  { icon: TwitterIcon, label: "X (Twitter)", href: "https://x.com/md_taqui_imam" },
  { icon: LinkedinIcon, label: "LinkedIn", href: "https://www.linkedin.com/in/taqui-imam" },
  { icon: GithubIcon, label: "GitHub", href: "https://github.com/taqui-786" },
];

export function Footer() {
  return (
    <footer className="w-full border-t border-border/50 bg-background/50 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 md:px-10">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="brand-wordmark text-base leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label="Drawva home"
          >
            Drawva
          </Link>
          <span
            title="Drawva Engine v3.0.0"
            className="rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-muted-foreground/70 select-none"
          >
            v3.7
          </span>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Infinite whiteboard powered by a multimodal AI perception agent.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/canvas"
            className="text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Launch Canvas
          </Link>

          <span aria-hidden className="h-3.5 w-px bg-border" />

          <p className="text-[11px] text-muted-foreground">
            Built by{" "}
            <a
              href="https://taqui.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Md Taqui Imam
            </a>
          </p>

          <ul className="flex items-center gap-1.5">
            {socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="inline-flex size-7 items-center justify-center rounded-lg border border-border/50 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon icon={s.icon} className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
