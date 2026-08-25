"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiSearch02Icon,
  AiChipIcon,
  AiBrain01Icon,
  FlashIcon,
  Tick02Icon,
  Settings01Icon,
  Cancel01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { getModelTier } from "@/lib/ai/tiers";
import { getProviderConfig, PROVIDER_INFOS, type ProviderConfig } from "@/lib/ai/provider";
import { cn } from "@/lib/utils";

interface ModelSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: string[];
  activeModel: string | null;
  onSelectModel: (model: string) => void;
  onOpenSettings: () => void;
}

type FilterCategory = "all" | "frontier" | "mid" | "small";

export function ModelSelectDialog({
  open,
  onOpenChange,
  models,
  activeModel,
  onSelectModel,
  onOpenSettings,
}: ModelSelectDialogProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(() => getProviderConfig());

  useEffect(() => {
    const syncState = () => {
      setProviderConfig(getProviderConfig());
    };
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);

  const providerName = providerConfig?.type
    ? PROVIDER_INFOS[providerConfig.type]?.name ?? providerConfig.type
    : "AI Provider";

  const modelItems = useMemo(() => {
    return models.map((m) => {
      const tier = getModelTier(m);
      return {
        id: m,
        name: m,
        tier,
      };
    });
  }, [models]);

  const filteredModels = useMemo(() => {
    return modelItems.filter((item) => {
      const matchesSearch =
        !search.trim() ||
        item.name.toLowerCase().includes(search.toLowerCase().trim()) ||
        item.id.toLowerCase().includes(search.toLowerCase().trim());

      const matchesFilter =
        filter === "all" ||
        item.tier === filter;

      return matchesSearch && matchesFilter;
    });
  }, [modelItems, search, filter]);

  const counts = useMemo(() => {
    const total = modelItems.length;
    const frontier = modelItems.filter((m) => m.tier === "frontier").length;
    const mid = modelItems.filter((m) => m.tier === "mid").length;
    const small = modelItems.filter((m) => m.tier === "small").length;
    return { total, frontier, mid, small };
  }, [modelItems]);

  const handleSelect = (modelId: string) => {
    onSelectModel(modelId);
    toast.success(`Active model set to ${modelId}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HugeiconsIcon icon={AiChipIcon} className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Select AI Model</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Choose the active model for canvas visual reasoning & generation ({providerName})
                </DialogDescription>
              </div>
            </div>
            {providerConfig && (
              <Badge variant="outline" className="hidden sm:inline-flex text-[11px] font-mono capitalize">
                {providerConfig.type}
              </Badge>
            )}
          </div>

          {/* Search bar */}
          <div className="relative mt-3">
            <HugeiconsIcon
              icon={AiSearch02Icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models (e.g. gpt-4o, claude-3-7, gemini, qwen)..."
              className="pl-9 pr-8 h-9 text-xs font-mono bg-background"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none",
                filter === "all"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              All
              <span className="text-[10px] opacity-80">({counts.total})</span>
            </button>

            {counts.frontier > 0 && (
              <button
                type="button"
                onClick={() => setFilter("frontier")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none",
                  filter === "frontier"
                    ? "bg-purple-600 text-white font-medium dark:bg-purple-700"
                    : "bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                )}
              >
                <HugeiconsIcon icon={SparklesIcon} className="size-3" />
                Frontier
                <span className="text-[10px] opacity-80">({counts.frontier})</span>
              </button>
            )}

            {counts.mid > 0 && (
              <button
                type="button"
                onClick={() => setFilter("mid")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none",
                  filter === "mid"
                    ? "bg-blue-600 text-white font-medium dark:bg-blue-700"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                )}
              >
                <HugeiconsIcon icon={AiBrain01Icon} className="size-3" />
                Mid-Tier
                <span className="text-[10px] opacity-80">({counts.mid})</span>
              </button>
            )}

            {counts.small > 0 && (
              <button
                type="button"
                onClick={() => setFilter("small")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none",
                  filter === "small"
                    ? "bg-emerald-600 text-white font-medium dark:bg-emerald-700"
                    : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                )}
              >
                <HugeiconsIcon icon={FlashIcon} className="size-3" />
                Fast / Small
                <span className="text-[10px] opacity-80">({counts.small})</span>
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Model List */}
        <div className="max-h-[50vh] min-h-[160px] overflow-y-auto p-2 sm:p-3 divide-y divide-border/40">
          {filteredModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <HugeiconsIcon icon={AiChipIcon} className="size-8 opacity-40 mb-2" />
              {models.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-foreground">No models found</p>
                  <p className="text-xs max-w-xs mt-1">
                    Connect your API key or configure custom models in Settings to populate available models.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenSettings();
                    }}
                    className="mt-3 gap-1.5 text-xs"
                  >
                    <HugeiconsIcon icon={Settings01Icon} className="size-3.5" />
                    Open Settings
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">No matching models</p>
                  <p className="text-xs max-w-xs mt-1">
                    No models match &ldquo;{search}&rdquo; with current filter.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="mt-2 text-xs"
                  >
                    Reset filters
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredModels.map((item) => {
                const isActive = activeModel === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition-all",
                      isActive
                        ? "bg-primary/10 border border-primary/30 text-foreground font-medium"
                        : "hover:bg-muted/70 text-muted-foreground hover:text-foreground border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md text-xs",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isActive ? (
                          <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                        ) : (
                          <HugeiconsIcon icon={AiChipIcon} className="size-3.5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-foreground truncate">
                            {item.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.tier === "frontier" && (
                        <Badge
                          variant="secondary"
                          className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 text-[10px] py-0 px-1.5"
                        >
                          Frontier
                        </Badge>
                      )}
                      {item.tier === "mid" && (
                        <Badge
                          variant="secondary"
                          className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 text-[10px] py-0 px-1.5"
                        >
                          Mid-Tier
                        </Badge>
                      )}
                      {item.tier === "small" && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px] py-0 px-1.5"
                        >
                          Fast
                        </Badge>
                      )}
                      {isActive && (
                        <span className="text-[11px] font-semibold text-primary pl-1">
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 sm:px-4 bg-muted/30 border-t border-border/60 text-xs">
          <span className="text-muted-foreground text-[11px] hidden sm:inline">
            Need custom endpoints or new API keys?
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onOpenSettings();
            }}
            className="gap-1.5 text-xs ml-auto"
          >
            <HugeiconsIcon icon={Settings01Icon} className="size-3.5" />
            Configure Providers
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
