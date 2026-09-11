import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function DravCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 flex flex-col h-full">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="pt-2 border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DravGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <DravCardSkeleton key={i} />
      ))}
    </div>
  );
}
