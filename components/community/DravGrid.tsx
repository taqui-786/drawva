"use client";

import * as React from "react";
import { DravCardData } from "@/lib/dravs/types";
import { DravCard } from "./DravCard";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Loading03Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";

interface DravGridProps {
  dravs: DravCardData[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export function DravGrid({
  dravs,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
}: DravGridProps) {
  if (dravs.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
        <div className="size-16 rounded-2xl bg-muted/40 border border-border/70 flex items-center justify-center text-muted-foreground">
          <HugeiconsIcon icon={SparklesIcon} className="size-8 opacity-60" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-foreground">No Dravs found</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            No community canvases match this category or search filter yet. Be the first to share your whiteboard creation!
          </p>
        </div>
        <Link href="/canvas">
          <Button size="sm" className="gap-1.5 text-xs">
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
            <span>Create a Canvas</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {dravs.map((drav) => (
          <DravCard key={drav.id} drav={drav} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4 pb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="gap-2 text-xs px-6 py-2 h-9 border-border/80"
          >
            {isLoadingMore ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
                <span>Loading more Dravs…</span>
              </>
            ) : (
              <span>Load More Dravs</span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
