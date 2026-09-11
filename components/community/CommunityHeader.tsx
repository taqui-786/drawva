"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  Login01Icon,
  Logout01Icon,
  Compass01Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CommunityHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left: Brand & Navigation */}
        <div className="flex items-center gap-6">
          <Link href="/canvas" className="flex items-center gap-2">
            <span className="brand-wordmark text-lg font-bold tracking-tight text-foreground">
              Drawva
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/community"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
            >
              <HugeiconsIcon icon={Compass01Icon} className="size-3.5" />
              <span>Community</span>
            </Link>
          </nav>
        </div>

        {/* Right: Actions & User */}
        <div className="flex items-center gap-3">
          <Link href="/canvas">
            <Button size="sm" className="h-8 px-3 text-xs gap-1.5 shadow-sm">
              <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
              <span className="hidden sm:inline">New Canvas</span>
            </Button>
          </Link>

          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8 rounded-full p-0 cursor-pointer">
                    <Avatar className="size-8">
                      {session.user.image && (
                        <AvatarImage src={session.user.image} alt={session.user.name} />
                      )}
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                        {session.user.name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56 text-xs">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-xs font-medium leading-none text-foreground">
                    {session.user.name}
                  </p>
                  <p className="text-[11px] leading-none text-muted-foreground truncate">
                    {session.user.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut()}
                  className="text-destructive focus:text-destructive cursor-pointer gap-2"
                >
                  <HugeiconsIcon icon={Logout01Icon} className="size-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => signIn.social({ provider: "google" })}
              className="h-8 px-3 text-xs gap-1.5 border-border/70"
            >
              <HugeiconsIcon icon={Login01Icon} className="size-3.5" />
              <span>Sign in</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
