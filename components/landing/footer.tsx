import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, LinkedinIcon, TwitterIcon } from "@hugeicons/core-free-icons";

const socials = [
  {
    icon: TwitterIcon,
    label: "X (Twitter)",
    href: "https://x.com/md_taqui_imam",
  },
  {
    icon: LinkedinIcon,
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/taqui-imam",
  },
  {
    icon: GithubIcon,
    label: "GitHub",
    href: "https://github.com/taqui-786",
  },
];

export function Footer() {
  return (
    <footer className="shrink-0 border-t border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-12 max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-xs text-muted-foreground">
          Built by{" "}
          <a
            href="https://taqui.in"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            Md Taqui Imam
          </a>
          <span aria-hidden className="mx-1.5 opacity-60">
            ·
          </span>
          MIT license
        </p>

        <ul className="flex items-center gap-0.5">
          {socials.map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon icon={s.icon} className="size-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}