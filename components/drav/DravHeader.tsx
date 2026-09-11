"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DravDetailData } from "@/lib/dravs/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  FavouriteIcon,
  Comment01Icon,
  Share01Icon,
  SparklesIcon,
  MoreVerticalIcon,
  Flag01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DravHeaderProps {
  drav: DravDetailData;
  onOpenComments: () => void;
  onOpenReport: () => void;
}

export function DravHeader({
  drav,
  onOpenComments,
  onOpenReport,
}: DravHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [optimisticLike, setOptimisticLike] = React.useState<{ liked: boolean; count: number } | null>(null);

  const isLiked = optimisticLike !== null ? optimisticLike.liked : !!drav.likedByMe;
  const likesCount = optimisticLike !== null ? optimisticLike.count : drav.likesCount;

  // Fast optimistic like mutation
  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dravs/${drav.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to update like");
      return res.json();
    },
    onMutate: async () => {
      const prevLiked = isLiked;
      const prevCount = likesCount;
      setOptimisticLike({
        liked: !prevLiked,
        count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
      });
      return { prevLiked, prevCount };
    },
    onError: (_err, _vars, context) => {
      if (context) {
        setOptimisticLike({ liked: context.prevLiked, count: context.prevCount });
      }
      toast.error("Failed to update like");
    },
    onSettled: () => {
      setOptimisticLike(null);
      queryClient.invalidateQueries({ queryKey: ["drav", drav.id] });
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
    },
  });

  // Remix mutation
  const remixMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user) {
        throw new Error("Please sign in to remix this Drav.");
      }
      const res = await fetch(`/api/dravs/${drav.id}/remix`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remix Drav");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Drav remixed into your personal canvas!");
      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remix Drav");
    },
  });

  const handleLike = () => {
    if (!session?.user) {
      toast.info("Please sign in to like this Drav.");
      return;
    }
    likeMutation.mutate();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Drav link copied to clipboard!");
  };

  const authorInitials = drav.author.name
    ? drav.author.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "D";

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-13 px-3 sm:px-5 border-b border-border/80 bg-background/90 backdrop-blur-md flex items-center justify-between shadow-2xs select-none">
      {/* Left: Back button & Info */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
        <Link href="/community">
          <Button variant="ghost" size="icon-sm" className="size-8 rounded-lg cursor-pointer">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-semibold truncate leading-tight text-foreground">
                {drav.title}
              </h1>
              <Badge
                variant="secondary"
                className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0 hidden md:inline-flex"
              >
                {drav.category}
              </Badge>
            </div>
            {/* Creator */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <Avatar className="size-3.5">
                {drav.author.image && (
                  <AvatarImage src={drav.author.image} alt={drav.author.name} />
                )}
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                  {authorInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground truncate font-medium">
                {drav.author.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Like Button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={handleLike}
                className={cn(
                  "h-8 px-2.5 text-xs gap-1.5 border-border/70 cursor-pointer",
                  isLiked && "text-red-500 border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:text-red-500"
                )}
              >
                <HugeiconsIcon
                  icon={FavouriteIcon}
                  className={cn("size-3.5 transition-transform active:scale-125", isLiked && "text-red-500")}
                />
                <span className="font-mono">{likesCount}</span>
              </Button>
            }
          />
          <TooltipContent>{isLiked ? "Unlike Drav" : "Like this Drav"}</TooltipContent>
        </Tooltip>

        {/* Comments Button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenComments}
                className="h-8 px-2.5 text-xs gap-1.5 border-border/70 cursor-pointer"
              >
                <HugeiconsIcon icon={Comment01Icon} className="size-3.5 text-muted-foreground" />
                <span className="font-mono hidden sm:inline">{drav.commentsCount}</span>
              </Button>
            }
          />
          <TooltipContent>Open discussion / comments</TooltipContent>
        </Tooltip>

        {/* Share Button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleShare}
                className="size-8 border-border/70 cursor-pointer hidden sm:inline-flex"
              >
                <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Copy Drav link</TooltipContent>
        </Tooltip>

        {/* Remix CTA Button */}
        <Button
          size="sm"
          onClick={() => remixMutation.mutate()}
          disabled={remixMutation.isPending}
          className="h-8 px-3 text-xs gap-1.5 font-medium shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
        >
          {remixMutation.isPending ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
              <span className="hidden sm:inline">Remixing…</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
              <span>Remix</span>
            </>
          )}
        </Button>

        {/* More Options Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="size-8 cursor-pointer">
                <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={handleShare} className="gap-2 cursor-pointer sm:hidden">
              <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
              <span>Copy Link</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenReport}
              className="gap-2 text-destructive focus:text-destructive cursor-pointer"
            >
              <HugeiconsIcon icon={Flag01Icon} className="size-3.5" />
              <span>Report Content</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
