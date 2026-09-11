"use client";

import * as React from "react";
import Link from "next/link";
import { DravCardData } from "@/lib/dravs/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, Share07Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { DravLikeIcon, DravCommentIcon } from "@/components/drav/DravIcons";
import { useSession } from "@/lib/auth-client";
import { useLikeMutation } from "@/lib/dravs/useDravMutations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface DravCardProps {
  drav: DravCardData;
}

export function DravCard({ drav }: DravCardProps) {
  const { data: session } = useSession();
  const [imageLoaded, setImageLoaded] = React.useState(false);

  const likeMutation = useLikeMutation(drav.id);
  const isLiked = !!drav.likedByMe;
  const likesCount = drav.likesCount;

  const handleLikeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session?.user) {
      toast.info("Please sign in to like community Dravs.");
      return;
    }

    likeMutation.mutate();
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/drav/${drav.id}`;
    navigator.clipboard.writeText(url);
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
    <Card className="group overflow-hidden rounded-xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-border flex flex-col h-full">
      {/* Upper Area wrapped entirely in Link */}
      <Link
        href={`/drav/${drav.id}`}
        className="flex flex-col flex-1 group/link select-none cursor-pointer"
        aria-label={`Open ${drav.title}`}
      >
        {/* Thumbnail Preview Area - completely clear and unobstructed */}
        <div className="relative aspect-video w-full overflow-hidden bg-muted/15 border-b border-border/40 block">
          {drav.thumbnailUrl ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 z-0 flex items-center justify-center bg-muted/40">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:16px_16px] opacity-30" />
                  <Skeleton className="size-full rounded-none" />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drav.thumbnailUrl}
                alt={drav.title}
                onLoad={() => setImageLoaded(true)}
                className={cn(
                  "size-full object-cover transition-transform duration-500 ease-out group-hover/link:scale-105",
                  !imageLoaded && "opacity-0"
                )}
                loading="lazy"
              />
            </>
          ) : (
            <div className="size-full flex flex-col items-center justify-center bg-radial from-neutral-900 to-neutral-950 text-muted-foreground/50">
              <HugeiconsIcon icon={SparklesIcon} className="size-8 opacity-40 mb-1" />
              <span className="text-[11px] font-mono tracking-wider uppercase opacity-60">Drawva Canvas</span>
            </div>
          )}
        </div>

        {/* Card Body - Ultra compact, zero useless whitespace */}
        <div className="p-3 flex flex-col flex-1 gap-2">
          {/* Top Line: Category Pill + Title + Quick Share */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Badge
                variant="secondary"
                className="text-[9px] sm:text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 bg-muted/80 text-muted-foreground border-border/50 shrink-0"
              >
                {drav.category}
              </Badge>
              <h3
                className="font-semibold text-xs sm:text-sm truncate leading-snug tracking-tight text-foreground group-hover/link:text-primary transition-colors flex-1"
                title={drav.title}
              >
                {drav.title}
              </h3>
            </div>

            {/* Quick Share Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleShareClick}
                    className="size-6 rounded-md text-muted-foreground hover:text-foreground cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <HugeiconsIcon icon={Share07Icon} className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top">Share Drav link</TooltipContent>
            </Tooltip>
          </div>

          {/* Description (if present) */}
          {drav.description && (
            <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 leading-relaxed">
              {drav.description}
            </p>
          )}

          {/* Tags (if present) */}
          {drav.tags && drav.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center pt-0.5">
              {drav.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground transition-colors"
                >
                  #{tag}
                </span>
              ))}
              {drav.tags.length > 3 && (
                <span className="text-[9px] text-muted-foreground font-mono">
                  +{drav.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Footer: Author & Metrics (outside main link so actions don't navigate) */}
      <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground mt-auto bg-muted/5">
        {/* Creator Attribution */}
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <Avatar className="size-4.5 sm:size-5 shrink-0">
            {drav.author.image && (
              <AvatarImage src={drav.author.image} alt={drav.author.name} />
            )}
            <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
              {authorInitials}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] sm:text-xs font-medium text-foreground/90">
            {drav.author.name}
          </span>
        </div>

        {/* Metrics & Like Button */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Views */}
          <div className="flex items-center gap-1 text-[11px]" title={`${drav.viewsCount} views`}>
            <HugeiconsIcon icon={ViewIcon} className="size-3.5 opacity-60" />
            <span>{drav.viewsCount}</span>
          </div>

          {/* Comments */}
          <Link
            href={`/drav/${drav.id}`}
            className="flex items-center gap-1 text-[11px] hover:text-foreground transition-colors"
            title={`${drav.commentsCount} comments`}
          >
            <DravCommentIcon
              filled={drav.commentsCount > 0}
              className={cn("size-3.5", drav.commentsCount > 0 ? "text-primary opacity-90" : "opacity-60")}
            />
            <span>{drav.commentsCount}</span>
          </Link>

          {/* Like Button */}
          <button
            type="button"
            onClick={handleLikeClick}
            disabled={likeMutation.isPending}
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium transition-all py-0.5 px-1.5 rounded-md hover:bg-muted/70 cursor-pointer select-none active:scale-95",
              isLiked
                ? "text-red-500"
                : "text-muted-foreground hover:text-red-500"
            )}
            title={isLiked ? "Unlike Drav" : "Like Drav"}
            aria-label={isLiked ? "Unlike Drav" : "Like Drav"}
          >
            <DravLikeIcon
              filled={isLiked}
              className={cn(
                "size-3.5 transition-transform",
                isLiked ? "text-red-500 scale-110" : "text-current"
              )}
            />
            <span>{likesCount}</span>
          </button>
        </div>
      </div>
    </Card>
  );
}
