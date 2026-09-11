import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

export function DravCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-2xl border border-border/70 bg-card/50 flex flex-col h-full shadow-xs">
      {/* Thumbnail Skeleton with realistic canvas grid watermark */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted/40 flex items-center justify-center">
        {/* Infinite canvas grid simulation */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.15)_100%)] opacity-30" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:16px_16px] opacity-40" />

        {/* Shimmer overlay */}
        <Skeleton className="size-full rounded-none opacity-60" />

        {/* Center watermark icon */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/30 pointer-events-none">
          <HugeiconsIcon icon={SparklesIcon} className="size-6 animate-pulse opacity-50" />
        </div>

        {/* Category Pill Skeleton */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
      </div>

      {/* Card Body Skeleton (compact) */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1 justify-between gap-2.5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-full rounded opacity-70" />
          <Skeleton className="h-3 w-2/3 rounded opacity-50" />
        </div>

        {/* Tags Skeleton */}
        <div className="flex gap-1.5 pt-0.5">
          <Skeleton className="h-3.5 w-12 rounded" />
          <Skeleton className="h-3.5 w-14 rounded" />
        </div>

        {/* Footer Skeleton */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between mt-auto">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-3 w-7 rounded" />
            <Skeleton className="h-3 w-7 rounded" />
            <Skeleton className="h-3.5 w-8 rounded" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DravGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <DravCardSkeleton key={i} />
      ))}
    </div>
  );
}
