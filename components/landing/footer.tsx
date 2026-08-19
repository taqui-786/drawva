import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, LinkedinIcon, TwitterIcon } from "@hugeicons/core-free-icons";
import { CONTAINER } from "@/components/landing/container";

const socials = [
  { icon: TwitterIcon, label: "X (Twitter)", href: "https://x.com/md_taqui_imam" },
  { icon: LinkedinIcon, label: "LinkedIn", href: "https://www.linkedin.com/in/taqui-imam" },
  { icon: GithubIcon, label: "GitHub", href: "https://github.com/taqui-786" },
];

export function Footer() {
  return (
    <footer className="w-full border-t border-border/60 bg-background/60 backdrop-blur-md">
      <div className={`${CONTAINER} py-6 space-y-5`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1.5 text-center md:text-left">
            <Link href="/" className="brand-wordmark text-2xl font-bold">
              Drawva
            </Link>
            <p className="text-xs text-muted-foreground max-w-sm">
              Infinite whiteboard engine powered by a multimodal AI perception agent.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-muted-foreground">
            <Link href="/canvas" className="text-primary hover:underline font-semibold">
              Launch Canvas
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/40 text-xs text-muted-foreground">
          <p>
            Built by{" "}
            <a
              href="https://taqui.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              Md Taqui Imam
            </a>
          </p>

          <ul className="flex items-center gap-2">
            {socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                >
                  <HugeiconsIcon icon={s.icon} className="size-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}