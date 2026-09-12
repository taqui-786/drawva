"use client";

import * as React from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CommunityHeader } from "./CommunityHeader";
import { DravFilters } from "./DravFilters";
import { DravGrid } from "./DravGrid";
import { DravGridSkeleton } from "./DravSkeleton";
import { DravCardData, DravSortOption } from "@/lib/dravs/types";

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

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 max-w-7xl">
        <section className="relative border-b border-border/60 pb-8 sm:pb-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -top-10 size-56 rounded-full bg-primary/20 blur-3xl dark:bg-primary/12"
          />
          <p className="brand-wordmark relative text-sm sm:text-base">Drawva</p>
          <h1 className="relative mt-3 max-w-3xl pb-1 font-display text-4xl leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
            Explore people&apos;s{" "}
            <span className="italic font-normal text-primary">cool</span> Dravs
          </h1>
          <p className="relative mt-3 max-w-md font-body text-sm leading-relaxed text-muted-foreground sm:text-base">
            Published canvases from the community. Open one and remix it.
          </p>
        </section>

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
