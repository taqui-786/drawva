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
import {
  FavouriteIcon,
  Comment01Icon,
  ViewIcon,
  Share01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DravCardProps {
  drav: DravCardData;
}

export function DravCard({ drav }: DravCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [optimisticLike, setOptimisticLike] = React.useState<{ liked: boolean; count: number } | null>(null);

  const isLiked = optimisticLike !== null ? optimisticLike.liked : !!drav.likedByMe;
  const likesCount = optimisticLike !== null ? optimisticLike.count : drav.likesCount;

  // Fast optimistic like mutation
  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dravs/${drav.id}/like`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to like Drav");
      }
      return res.json();
    },
    onMutate: async () => {
      // Optimistic update
      const prevLiked = isLiked;
      const prevCount = likesCount;

      setOptimisticLike({
        liked: !prevLiked,
        count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
      });

      return { prevLiked, prevCount };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context) {
        setOptimisticLike({ liked: context.prevLiked, count: context.prevCount });
      }
      toast.error("Failed to update like");
    },
    onSettled: () => {
      setOptimisticLike(null);
      // Invalidate query in background to keep in sync
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
      queryClient.invalidateQueries({ queryKey: ["drav", drav.id] });
    },
  });

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
    <Card className="group overflow-hidden rounded-2xl border border-border/70 bg-card/60 hover:bg-card/90 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-border flex flex-col h-full">
      {/* Thumbnail Preview Area */}
      <Link
        href={`/drav/${drav.id}`}
        className="relative aspect-video w-full overflow-hidden bg-neutral-950 block select-none"
      >
        {drav.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={drav.thumbnailUrl}
            alt={drav.title}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="size-full flex flex-col items-center justify-center bg-radial from-neutral-900 to-neutral-950 text-muted-foreground/50">
            <HugeiconsIcon icon={SparklesIcon} className="size-8 opacity-40 mb-1" />
            <span className="text-[11px] font-mono tracking-wider uppercase opacity-60">Drawva Canvas</span>
          </div>
        )}

        {/* Category Pill Overlay */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <Badge
            variant="secondary"
            className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 bg-background/80 backdrop-blur-md border border-border/50 text-foreground/90 shadow-sm"
          >
            {drav.category}
          </Badge>
        </div>

        {/* Quick Share Overlay Button */}
        <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={handleShareClick}
                  className="size-7 rounded-full bg-background/90 backdrop-blur-md border border-border/60 hover:bg-background shadow-sm text-foreground/80 cursor-pointer"
                >
                  <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>Share Drav link</TooltipContent>
          </Tooltip>
        </div>
      </Link>

      {/* Card Content */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div className="space-y-1.5">
          <Link href={`/drav/${drav.id}`} className="block group-hover:text-primary transition-colors">
            <h3 className="font-semibold text-sm line-clamp-1 leading-snug tracking-tight text-foreground">
              {drav.title}
            </h3>
          </Link>
          {drav.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {drav.description}
            </p>
          )}
        </div>

        {/* Tags */}
        {drav.tags && drav.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {drav.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                #{tag}
              </span>
            ))}
            {drav.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                +{drav.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer: Author & Metrics */}
        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground mt-auto">
          {/* Creator Attribution */}
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Avatar className="size-5 shrink-0">
              {drav.author.image && (
                <AvatarImage src={drav.author.image} alt={drav.author.name} />
              )}
              <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
                {authorInitials}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs font-medium text-foreground/90">
              {drav.author.name}
            </span>
          </div>

          {/* Metrics & Like Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Views */}
            <div className="flex items-center gap-1 text-[11px]" title={`${drav.viewsCount} views`}>
              <HugeiconsIcon icon={ViewIcon} className="size-3.5 opacity-60" />
              <span>{drav.viewsCount}</span>
            </div>

            {/* Comments */}
            <div className="flex items-center gap-1 text-[11px]" title={`${drav.commentsCount} comments`}>
              <HugeiconsIcon icon={Comment01Icon} className="size-3.5 opacity-60" />
              <span>{drav.commentsCount}</span>
            </div>

            {/* Like Button */}
            <button
              type="button"
              onClick={handleLikeClick}
              className={cn(
                "flex items-center gap-1 text-[11px] font-medium transition-colors py-1 px-1.5 rounded-md hover:bg-muted/70 cursor-pointer",
                isLiked
                  ? "text-red-500 fill-red-500"
                  : "text-muted-foreground hover:text-red-500"
              )}
              title={isLiked ? "Unlike Drav" : "Like Drav"}
            >
              <HugeiconsIcon
                icon={FavouriteIcon}
                className={cn("size-3.5 transition-transform active:scale-125", isLiked && "text-red-500")}
              />
              <span>{likesCount}</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
