"use client";

import * as React from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CommunityHeader } from "./CommunityHeader";
import { DravFilters } from "./DravFilters";
import { DravGrid } from "./DravGrid";
import { DravGridSkeleton } from "./DravSkeleton";
import { DravCardData, DravSortOption } from "@/lib/dravs/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

export function CommunityPage() {
  const [selectedCategory, setSelectedCategory] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<DravSortOption>("trending");
  const [page, setPage] = React.useState(1);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when category or sort changes
  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setPage(1);
  };

  const handleSortChange = (sort: DravSortOption) => {
    setSortBy(sort);
    setPage(1);
  };

  // TanStack Query for Dravs list
  const { data, isLoading, isPlaceholderData, isFetching } = useQuery<{
    dravs: DravCardData[];
    total: number;
    hasMore: boolean;
  }>({
    queryKey: ["dravs", { category: selectedCategory, search: debouncedSearch, sort: sortBy, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== "all") {
        params.set("category", selectedCategory);
      }
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("limit", "24");

      const res = await fetch(`/api/dravs?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch community Dravs");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes caching — tab switching and back-nav will not refetch
    placeholderData: keepPreviousData, // Smooth no-flicker transitions between categories
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <CommunityHeader />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 space-y-8 max-w-7xl">
        {/* Community Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card/80 via-card/40 to-background p-6 sm:p-10 shadow-xs">
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 size-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="max-w-2xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
              <span>Drawva Community Discovery</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-brand">
              Explore whiteboard canvases & diagrams
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Discover interactive canvas Dravs created with Drawva. Inspect architectures, learn from math proofs and flowcharts, comment, and remix any canvas into your personal workspace.
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <DravFilters
          selectedCategory={selectedCategory}
          onSelectCategory={handleCategoryChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={handleSortChange}
        />

        {/* Content Section */}
        {isLoading && !data ? (
          <DravGridSkeleton count={8} />
        ) : (
          <div className="space-y-6">
            <DravGrid
              dravs={data?.dravs || []}
              hasMore={data?.hasMore}
              onLoadMore={() => setPage((p) => p + 1)}
              isLoadingMore={isFetching && !isPlaceholderData}
            />
          </div>
        )}
      </main>
    </div>
  );
}
