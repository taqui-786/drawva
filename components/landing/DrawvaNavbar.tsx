"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, SparklesIcon, Logout01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useSession, signOut } from "@/lib/auth-client";

export function DrawvaNavbar() {
  const { data: session } = useSession();

  return (
    <header className="relative z-30 w-full font-body">
      <nav
        aria-label="Main Navigation"
        className="mx-auto flex items-center justify-between px-6 py-5 md:px-12 lg:px-20"
      >
        <Link
          href="/"
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md transition-opacity hover:opacity-90"
          aria-label="Drawva home"
        >
          <span className="brand-wordmark text-2xl font-bold tracking-wider text-primary">
            Drawva
          </span>
        </Link>

        <div className="flex items-center gap-6 md:gap-8">
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <Link
              href="/manual"
              className="transition-colors hover:text-foreground"
            >
              Manual
            </Link>
            <a
              href="https://github.com/taqui-786/drawva"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={GithubIcon} className="h-4 w-4 opacity-80" />
              <span>GitHub</span>
            </a>
            <a
              href="https://taqui.in"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              About
            </a>
          </div>

          <div className="flex items-center gap-3">
            {session?.user ? (
              <div className="flex items-center gap-3">
                {(session.user as { role?: string }).role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href="/admin" />}
                    className="text-xs text-primary border-primary/30 hover:bg-primary/10 gap-1.5"
                  >
                    <span>Admin</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut()}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5 hidden sm:flex"
                >
                  <HugeiconsIcon icon={Logout01Icon} className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </Button>
                <Button
                  size="sm"
                  render={<Link href="/canvas" />}
                  className="gap-2 rounded-full px-5 py-2 text-sm font-medium shadow-sm transition-all hover:scale-[1.02] active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="h-3.5 w-3.5" />
                  <span>Open Studio</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/signin"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  Sign In
                </Link>
                <Button
                  size="sm"
                  render={<Link href="/canvas" />}
                  className="gap-2 rounded-full px-5 py-2 text-sm font-medium shadow-sm transition-all hover:scale-[1.02] active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="h-3.5 w-3.5" />
                  <span>Launch Canvas</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
