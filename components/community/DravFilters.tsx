"use client";

import * as React from "react";
import { DRAV_CATEGORIES, DravSortOption } from "@/lib/dravs/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Cancel01Icon,
  FireIcon,
  FavouriteIcon,
  Time02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface DravFiltersProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: DravSortOption;
  onSortChange: (sort: DravSortOption) => void;
}

export function DravFilters({
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: DravFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Top Bar: Search Input & Sort Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search Dravs by title, concept, or tags…"
            className="pl-9 pr-8 h-9 text-xs sm:text-sm bg-card/60 backdrop-blur-sm border-border/70 focus-visible:ring-primary/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          )}
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-muted-foreground hidden sm:inline">Sort:</span>
          <Select
            value={sortBy}
            onValueChange={(val) => {
              if (val) onSortChange(val as DravSortOption);
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-44 text-xs bg-card/60 border-border/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="trending" className="text-xs">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={FireIcon} className="size-3.5 text-orange-500" />
                  <span>Trending</span>
                </div>
              </SelectItem>
              <SelectItem value="top" className="text-xs">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={FavouriteIcon} className="size-3.5 text-red-500" />
                  <span>Top Liked</span>
                </div>
              </SelectItem>
              <SelectItem value="new" className="text-xs">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={Time02Icon} className="size-3.5 text-blue-500" />
                  <span>Newest</span>
                </div>
              </SelectItem>
              <SelectItem value="views" className="text-xs">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={ViewIcon} className="size-3.5 text-emerald-500" />
                  <span>Most Viewed</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Horizontal Category Pill Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
        {DRAV_CATEGORIES.map((cat) => {
          const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer border select-none",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card/50 text-muted-foreground border-border/60 hover:text-foreground hover:bg-card hover:border-border"
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
