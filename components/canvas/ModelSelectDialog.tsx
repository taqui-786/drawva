"use client";

import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, memo } from "react";
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
  AiViewIcon,
  Alert02Icon,
  FlashIcon,
  Tick02Icon,
  Settings01Icon,
  Cancel01Icon,
  SparklesIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { getModelTier, type ModelTier } from "@/lib/ai/tiers";
import {
  getProviderConfig,
  PROVIDER_INFOS,
  type ProviderConfig,
  getModelCapabilitiesCached,
  setCachedModelCapabilities,
  getCachedModelCapabilities,
} from "@/lib/ai/provider";
import type { ModelCapabilities } from "@/lib/ai/capabilities";
import { cn } from "@/lib/utils";

interface ModelSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: string[];
  activeModel: string | null;
  onSelectModel: (model: string) => void;
  onOpenSettings: () => void;
}

type FilterCategory = "all" | "reasoning" | "frontier" | "mid" | "small";

interface ModelItem {
  id: string;
  name: string;
  tier: ModelTier;
  capabilities: ModelCapabilities;
}

const PAGE_SIZE = 40;
const VALIDATE_DELAY_MS = 350;

const ModelRow = memo(function ModelRow({
  item,
  isActive,
  isValidatingAll,
  isValidatingThis,
  onSelect,
}: {
  item: ModelItem;
  isActive: boolean;
  isValidatingAll: boolean;
  isValidatingThis: boolean;
  onSelect: (item: ModelItem) => void;
}) {
  const isVerifiedVision = item.capabilities.status === "verified_vision" || item.capabilities.vision;
  const isVerifiedNoVision = item.capabilities.status === "verified_no_vision";
  const isReasoning = item.capabilities.reasoning;

  return (
    <button
      type="button"
      disabled={isValidatingThis}
      onClick={() => onSelect(item)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition-all",
        isActive
          ? "bg-primary/10 border border-primary/30 text-foreground font-medium"
          : isVerifiedVision
          ? "hover:bg-muted/70 text-muted-foreground hover:text-foreground border border-transparent cursor-pointer"
          : isVerifiedNoVision
          ? "hover:bg-destructive/5 text-muted-foreground border border-destructive/20 opacity-80 cursor-pointer"
          : "hover:bg-muted/50 text-muted-foreground border border-border/30 cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md text-xs",
            isActive
              ? "bg-primary text-primary-foreground"
              : isVerifiedVision
              ? "bg-muted text-muted-foreground"
              : isVerifiedNoVision
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isValidatingThis ? (
            <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
          ) : isActive ? (
            <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
          ) : isVerifiedNoVision ? (
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
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

      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {isVerifiedVision ? (
          <Badge
            variant="outline"
            className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 text-[10px] py-0 px-1.5 gap-0.5"
          >
            <HugeiconsIcon icon={AiViewIcon} className="size-2.5" />
            Vision
          </Badge>
        ) : isVerifiedNoVision ? (
          <Badge
            variant="outline"
            className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] py-0 px-1.5 gap-0.5"
          >
            <HugeiconsIcon icon={Alert02Icon} className="size-2.5" />
            No Vision
          </Badge>
        ) : isValidatingAll ? (
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground border-border/40 text-[10px] py-0 px-1.5 gap-0.5 animate-pulse"
          >
            <HugeiconsIcon icon={Loading03Icon} className="size-2.5 animate-spin" />
            Checking...
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground border-border/40 text-[10px] py-0 px-1.5 gap-0.5"
          >
            Unverified
          </Badge>
        )}

        {isReasoning && (
          <Badge
            variant="outline"
            className="bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20 text-[10px] py-0 px-1.5 gap-0.5"
          >
            <HugeiconsIcon icon={AiBrain01Icon} className="size-2.5" />
            Reasoning
          </Badge>
        )}

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
});

export function ModelSelectDialog({
  open,
  onOpenChange,
  models,
  activeModel,
  onSelectModel,
  onOpenSettings,
}: ModelSelectDialogProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(() => getProviderConfig());
  const [capabilitiesMap, setCapabilitiesMap] = useState<Record<string, ModelCapabilities>>(() =>
    getCachedModelCapabilities()
  );
  const [isValidatingAll, setIsValidatingAll] = useState(false);
  const [validatingModelId, setValidatingModelId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const requestedModelsRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncState = () => {
      setProviderConfig(getProviderConfig());
      setCapabilitiesMap(getCachedModelCapabilities());
    };
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setVisibleCount(PAGE_SIZE);
  }

  useEffect(() => {
    if (!open || models.length === 0) return;

    const cached = getCachedModelCapabilities();
    const missing = models.filter((m) => {
      if (requestedModelsRef.current.has(m)) return false;
      const cap = cached[m];
      return !cap || cap.status === "unknown";
    });

    if (missing.length === 0 || inFlightRef.current) return;

    missing.forEach((m) => requestedModelsRef.current.add(m));

    let cancelled = false;
    inFlightRef.current = true;
    const timer = setTimeout(() => {
      if (cancelled) {
        inFlightRef.current = false;
        return;
      }
      setIsValidatingAll(true);

      fetch("/api/canvas/model-validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelIds: missing }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { capabilities?: Record<string, ModelCapabilities> };
          if (data.capabilities && !cancelled) {
            const merged = { ...getCachedModelCapabilities(), ...data.capabilities };
            setCachedModelCapabilities(merged, false);
            setCapabilitiesMap(merged);
          }
        })
        .catch((err) => {
          console.warn("[ModelSelectDialog] Batch validation error:", err);
        })
        .finally(() => {
          inFlightRef.current = false;
          if (!cancelled) {
            setIsValidatingAll(false);
          }
        });
    }, VALIDATE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, models]);

  const providerName = providerConfig?.type
    ? PROVIDER_INFOS[providerConfig.type]?.name ?? providerConfig.type
    : "AI Provider";

  const modelItems: ModelItem[] = useMemo(() => {
    return models.map((m) => {
      const tier = getModelTier(m);
      const capabilities = capabilitiesMap[m] || getModelCapabilitiesCached(m);
      return {
        id: m,
        name: m,
        tier,
        capabilities,
      };
    });
  }, [models, capabilitiesMap]);

  const filteredModels = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return modelItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);

      let matchesFilter = true;
      if (filter === "reasoning") {
        matchesFilter = item.capabilities.reasoning;
      } else if (filter !== "all") {
        matchesFilter = item.tier === filter;
      }

      return matchesSearch && matchesFilter;
    });
  }, [modelItems, deferredSearch, filter]);

  const counts = useMemo(() => {
    const total = modelItems.length;
    const reasoning = modelItems.filter((m) => m.capabilities.reasoning).length;
    const frontier = modelItems.filter((m) => m.tier === "frontier").length;
    const mid = modelItems.filter((m) => m.tier === "mid").length;
    const small = modelItems.filter((m) => m.tier === "small").length;
    return { total, reasoning, frontier, mid, small };
  }, [modelItems]);

  const visibleModels = useMemo(
    () => filteredModels.slice(0, visibleCount),
    [filteredModels, visibleCount]
  );

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 120) return;
    setVisibleCount((n) => {
      if (n >= filteredModels.length) return n;
      return n + PAGE_SIZE;
    });
  }, [filteredModels.length]);

  const handleSelect = useCallback(
    async (item: ModelItem) => {
      if (item.capabilities.vision && item.capabilities.status === "verified_vision") {
        onSelectModel(item.id);
        if (item.capabilities.reasoning) {
          toast.success(`Active model set to ${item.id}`, {
            description: "Vision & Reasoning controls are active in the header.",
          });
        } else {
          toast.success(`Active model set to ${item.id}`, {
            description: "Vision model active.",
          });
        }
        onOpenChange(false);
        return;
      }

      if (item.capabilities.status === "verified_no_vision") {
        toast.error("Vision Input Not Supported", {
          description: `"${item.id}" is a text-only model and does not support image/canvas inputs. Drawva requires a vision-capable model to inspect handwriting. Please select another model.`,
        });
        return;
      }

      setValidatingModelId(item.id);
      try {
        const res = await fetch("/api/canvas/model-validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId: item.id }),
        });

        if (res.ok) {
          const data = (await res.json()) as { capabilities?: Record<string, ModelCapabilities> };
          const result = data.capabilities?.[item.id];

          if (result) {
            const updatedCaps = { ...getCachedModelCapabilities(), [item.id]: result };
            setCachedModelCapabilities(updatedCaps, false);
            setCapabilitiesMap(updatedCaps);

            if (result.vision) {
              onSelectModel(item.id);
              toast.success(`Active model set to ${item.id}`, {
                description: result.reasoning
                  ? "Vision & Reasoning verified and active."
                  : "Vision model verified and active.",
              });
              onOpenChange(false);
              return;
            }

            if (result.status === "verified_no_vision") {
              toast.error("Vision Input Not Supported", {
                description: `"${item.id}" does not support image/canvas inputs. Drawva requires a vision-capable model.`,
              });
              return;
            }
          }
        }
      } catch (err) {
        console.warn("[ModelSelectDialog] On-select validation error:", err);
      } finally {
        setValidatingModelId(null);
      }

      onSelectModel(item.id);
      toast.warning(`Selected ${item.id}`, {
        description:
          "Vision support could not be verified automatically for this model. If drawing generation fails, please select a verified vision model.",
      });
      onOpenChange(false);
    },
    [onSelectModel, onOpenChange]
  );

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
            <div className="flex items-center gap-2">
              {isValidatingAll && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 text-muted-foreground animate-pulse border-primary/30 bg-primary/5 hidden sm:inline-flex"
                >
                  <HugeiconsIcon icon={Loading03Icon} className="size-2.5 animate-spin text-primary" />
                  Verifying capabilities...
                </Badge>
              )}
              {providerConfig && (
                <Badge variant="outline" className="text-[11px] font-mono capitalize">
                  {providerConfig.type}
                </Badge>
              )}
            </div>
          </div>

          <div className="relative mt-3">
            <HugeiconsIcon
              icon={AiSearch02Icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models (e.g. gpt-4o, claude-3-7, gemini, muse, grok)..."
              className="pl-9 pr-8 h-9 text-xs font-mono bg-background"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear search"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none cursor-pointer",
                filter === "all"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              All
              <span className="text-[10px] opacity-80">({counts.total})</span>
            </button>

            {counts.reasoning > 0 && (
              <button
                type="button"
                onClick={() => setFilter("reasoning")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none cursor-pointer",
                  filter === "reasoning"
                    ? "bg-violet-600 text-white font-medium dark:bg-violet-700"
                    : "bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                )}
              >
                <HugeiconsIcon icon={AiBrain01Icon} className="size-3" />
                Reasoning
                <span className="text-[10px] opacity-80">({counts.reasoning})</span>
              </button>
            )}

            {counts.frontier > 0 && (
              <button
                type="button"
                onClick={() => setFilter("frontier")}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none cursor-pointer",
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
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none cursor-pointer",
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
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors select-none cursor-pointer",
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

        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="max-h-[50vh] min-h-[160px] overflow-y-auto p-2 sm:p-3 divide-y divide-border/40"
        >
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
              {visibleModels.map((item) => (
                <ModelRow
                  key={item.id}
                  item={item}
                  isActive={activeModel === item.id}
                  isValidatingAll={isValidatingAll}
                  isValidatingThis={validatingModelId === item.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

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
