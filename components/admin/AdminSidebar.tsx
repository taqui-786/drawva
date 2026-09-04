"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  UserMultiple02Icon,
  PaintBoardIcon,
  SparklesIcon,
  ArrowLeft02Icon,
  Logout01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { signOut, useSession } from "@/lib/auth-client";

interface NavItem {
  label: string;
  href: string;
  icon: typeof DashboardSquare01Icon;
  badge?: string;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: DashboardSquare01Icon,
  },
  {
    label: "Users",
    href: "/admin/user",
    icon: UserMultiple02Icon,
  },
  {
    label: "Canvases",
    href: "/admin/canva",
    icon: PaintBoardIcon,
  },
  {
    label: "AI Usage",
    href: "/admin/ai-usage",
    icon: SparklesIcon,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await signOut();
    router.push("/signin");
  };

  return (
    <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col shrink-0 h-screen sticky top-0 select-none">
      {/* Brand Header */}
      <div className="p-5 flex items-center justify-between border-b border-border/70">
        <Link href="/admin" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            <HugeiconsIcon icon={Shield01Icon} className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-foreground font-sans">Drawva</span>
              <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0 h-4">
                Admin
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Management Console</p>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          Management
        </div>

        {navItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              render={<Link href={item.href} />}
              className={cn(
                "w-full justify-start gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              <HugeiconsIcon
                icon={item.icon}
                className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
              />
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                  {item.badge}
                </Badge>
              )}
            </Button>
          );
        })}

        <div className="pt-4 pb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          Shortcuts
        </div>

        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/canvas" />}
          className="w-full justify-start gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-lg"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Back to Canvas</span>
        </Button>
      </div>

      <Separator className="opacity-60" />

      {/* User Footer */}
      <div className="p-3 bg-muted/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt={session.user.name || "Admin"}
              className="h-8 w-8 rounded-full border border-border shrink-0 object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {session?.user?.name ? session.user.name.slice(0, 2).toUpperCase() : "AD"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {session?.user?.name || "Admin User"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {session?.user?.email || "admin@drawva.com"}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleSignOut}
          title="Sign Out"
          className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
        >
          <HugeiconsIcon icon={Logout01Icon} className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
