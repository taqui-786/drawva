"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading02Icon,
  CloudCheckIcon,
  CpuIcon,
  Analytics01Icon,
  Delete02Icon,
  Add01Icon,
  SparklesIcon,
  EyeIcon,
  EyeOffIcon,
} from "@hugeicons/core-free-icons";
import {
  getProviderConfig,
  getCachedModels,
  getActiveModel,
  setProviderConfig,
  setCachedModels,
  setActiveModel,
  getTokenUsageHistory,
  clearTokenUsageHistory,
  PROVIDER_INFOS,
  type ProviderType,
  type ProviderConfig,
  type CustomModel,
  type TokenUsageRecord,
} from "@/lib/ai/provider";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<"provider" | "usage">("provider");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[56rem] sm:max-w-[56rem] max-w-[calc(100%-2rem)] p-0 overflow-hidden bg-background border shadow-2xl rounded-2xl">
        <div className="flex flex-col h-[640px]">
          {/* Header & Tabs */}
          <div className="px-7 py-5 border-b bg-muted/20 flex items-center justify-between">
            <DialogHeader className="mb-0">
              <DialogTitle className="text-xl font-bold flex items-center gap-2.5">
                <HugeiconsIcon icon={CpuIcon} className="size-6 text-primary" />
                AI Engine & Token Analytics Dashboard
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure multimodal vision AI providers (OpenAI, Anthropic, Gemini, NVIDIA, Custom) and monitor real-time token metrics.
              </DialogDescription>
            </DialogHeader>

            {/* Tab Switcher */}
            <div className="flex p-1 bg-muted rounded-xl gap-1.5 w-72">
              <button
                type="button"
                onClick={() => setActiveTab("provider")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "provider"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HugeiconsIcon icon={CpuIcon} className="size-4" />
                Provider & Models
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("usage")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "usage"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
                Token Metrics
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-7">
            {activeTab === "provider" ? <ProviderTab /> : <UsageMetricsTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderTab() {
  const initial = getProviderConfig();
  const [providerType, setProviderType] = useState<ProviderType>(initial?.type || "openai");
  const [apiKey, setApiKey] = useState(initial?.apiKey || "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [customModels, setCustomModels] = useState<CustomModel[]>(initial?.customModels || []);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [cachedModels, setModels] = useState<string[]>(() => getCachedModels());
  const [activeModel, setActive] = useState<string | null>(() => getActiveModel());

  const handleSelectProvider = (type: ProviderType) => {
    setProviderType(type);
    const info = PROVIDER_INFOS[type];
    if (type !== "custom") {
      setBaseUrl(info.defaultBaseUrl || "");
      if (info.defaultModels.length > 0) {
        setModels(info.defaultModels);
        if (!activeModel || !info.defaultModels.includes(activeModel)) {
          setActive(info.defaultModels[0]);
        }
      }
    } else if (customModels.length > 0) {
      const ids = customModels.map((m) => m.id);
      setModels(ids);
      if (!activeModel || !ids.includes(activeModel)) {
        setActive(ids[0]);
      }
    }
  };

  const handleAddCustomModel = () => {
    if (!newModelId.trim()) {
      toast.error("Enter a model ID first.");
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    if (customModels.some((m) => m.id === id)) {
      toast.error("Model ID already in custom list.");
      return;
    }
    const updated = [...customModels, { id, name }];
    setCustomModels(updated);
    setNewModelId("");
    setNewModelName("");
    if (providerType === "custom") {
      const ids = updated.map((m) => m.id);
      setModels(ids);
      setActive(id);
    }
    toast.success(`Added custom model "${name}"`);
  };

  const handleRemoveCustomModel = (id: string) => {
    const updated = customModels.filter((m) => m.id !== id);
    setCustomModels(updated);
    if (providerType === "custom") {
      const ids = updated.map((m) => m.id);
      setModels(ids);
      if (activeModel === id) {
        setActive(ids[0] || null);
      }
    }
  };

  const verifyAndSave = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter an API key.");
      return;
    }
    if (providerType === "custom" && !baseUrl.trim() && customModels.length === 0) {
      toast.error("Custom provider requires a Base URL or custom models.");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/canvas/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerType,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          customModels,
        }),
      });

      const data = (await res.json()) as {
        models?: string[];
        error?: string;
        filteredByVision?: boolean;
      };

      if (!res.ok || !Array.isArray(data.models) || data.models.length === 0) {
        toast.error(
          data.error || "No img+text vision supported models available for this provider."
        );
        return;
      }

      const config: ProviderConfig = {
        type: providerType,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        customModels: providerType === "custom" ? customModels : undefined,
      };

      setProviderConfig(config);
      setCachedModels(data.models);
      setModels(data.models);

      const currentActive = getActiveModel();
      const nextActive = currentActive && data.models.includes(currentActive) ? currentActive : data.models[0];
      if (nextActive) {
        setActiveModel(nextActive);
        setActive(nextActive);
      }

      toast.success("Provider Connected!", {
        description: `Verified ${data.models.length} vision-compatible models.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Provider verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Provider Cards Row */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          1. Select AI Provider
        </Label>
        <div className="grid grid-cols-6 gap-2.5">
          {(Object.keys(PROVIDER_INFOS) as ProviderType[]).map((type) => {
            const info = PROVIDER_INFOS[type];
            const isSelected = providerType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectProvider(type)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary shadow-md ring-2 ring-primary/30"
                    : "border-border bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                <ProviderBadge type={type} size="md" />
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-xs truncate">{info.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{type.toUpperCase()}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side 2-Column Section */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Left Column: Authentication & Credentials */}
        <div className="flex flex-col gap-4 p-5 border rounded-xl bg-card shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-sm font-bold flex items-center gap-2">
              <ProviderBadge type={providerType} size="md" />
              {PROVIDER_INFOS[providerType].name} Credentials
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Vision Enforced
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* API Key */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider-api-key" className="text-xs font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="provider-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter ${PROVIDER_INFOS[providerType].name} API key...`}
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} className="size-4" />
                </button>
              </div>
            </div>

            {/* Base URL (for Custom Provider) */}
            {providerType === "custom" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-base-url" className="text-xs font-medium">
                  Base URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  autoComplete="off"
                  spellCheck={false}
                  className="text-xs font-mono"
                />
              </div>
            )}
          </div>

          <Button
            onClick={verifyAndSave}
            disabled={verifying}
            size="lg"
            className="w-full gap-2 font-bold shadow-md h-11 text-xs mt-2"
          >
            {verifying ? (
              <>
                <HugeiconsIcon icon={Loading02Icon} className="size-4 animate-spin" />
                Verifying & Fetching Models...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={CloudCheckIcon} className="size-4" />
                Verify & Connect Provider
              </>
            )}
          </Button>
        </div>

        {/* Right Column: Model Selection & Custom Models List */}
        <div className="flex flex-col gap-4">
          {/* Active Model Selector Card */}
          <div className="flex flex-col gap-2 p-5 border rounded-xl bg-card shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Active Vision Model</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {cachedModels.length > 0 ? `${cachedModels.length} models verified` : "No models fetched"}
              </span>
            </div>
            <select
              value={activeModel || ""}
              onChange={(e) => {
                setActiveModel(e.target.value);
                setActive(e.target.value);
              }}
              className="w-full text-xs font-mono p-2.5 border rounded-lg bg-background font-semibold"
            >
              {cachedModels.length === 0 && <option value="">No models verified yet</option>}
              {cachedModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Models List Manager (if custom provider selected) */}
          {providerType === "custom" && (
            <div className="flex flex-col gap-3 p-5 border rounded-xl bg-card shadow-sm">
              <Label className="text-xs font-semibold">Custom Models List Manager</Label>

              {customModels.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {customModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 text-xs"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-bold truncate text-xs">{m.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground truncate">{m.id}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomModel(m.id)}
                        className="text-destructive hover:text-destructive/80 p-1 rounded-md hover:bg-destructive/10"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 items-center">
                <Input
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="Model ID (e.g. qwen-2.5-vl)"
                  className="text-xs font-mono flex-1 h-9"
                />
                <Input
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Display Name"
                  className="text-xs flex-1 h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomModel}
                  className="h-9 px-3 gap-1.5 text-xs font-semibold"
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageMetricsTab() {
  const [history, setHistory] = useState<TokenUsageRecord[]>(() => getTokenUsageHistory());

  useEffect(() => {
    const update = () => setHistory(getTokenUsageHistory());
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const totalRequests = history.length;
  const totalInputTokens = history.reduce((acc, curr) => acc + (curr.inputTokens || 0), 0);
  const totalOutputTokens = history.reduce((acc, curr) => acc + (curr.outputTokens || 0), 0);
  const aggregateTokens = totalInputTokens + totalOutputTokens;

  const handleClear = () => {
    clearTokenUsageHistory();
    setHistory([]);
    toast.success("Token usage history cleared.");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col p-4 rounded-xl border bg-card shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Total Requests
          </span>
          <span className="text-2xl font-extrabold text-foreground mt-1">{totalRequests}</span>
        </div>
        <div className="flex flex-col p-4 rounded-xl border bg-card shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Input Tokens
          </span>
          <span className="text-2xl font-extrabold text-blue-500 mt-1">{totalInputTokens.toLocaleString()}</span>
        </div>
        <div className="flex flex-col p-4 rounded-xl border bg-card shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Output Tokens
          </span>
          <span className="text-2xl font-extrabold text-emerald-500 mt-1">{totalOutputTokens.toLocaleString()}</span>
        </div>
        <div className="flex flex-col p-4 rounded-xl border bg-card shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Aggregate Usage
          </span>
          <span className="text-2xl font-extrabold text-amber-500 mt-1">{aggregateTokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold flex items-center gap-2 text-foreground">
          <HugeiconsIcon icon={SparklesIcon} className="size-4 text-amber-500" />
          Request Token History Log ({history.length} records)
        </span>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5 mr-1" />
            Clear Token Log
          </Button>
        )}
      </div>

      {/* Request History List */}
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-14 border border-dashed rounded-xl bg-muted/20 text-center gap-3">
          <HugeiconsIcon icon={Analytics01Icon} className="size-12 text-muted-foreground/40" />
          <span className="text-base font-bold text-foreground">No Token Usage Logged Yet</span>
          <span className="text-xs text-muted-foreground max-w-md">
            Execute Ask AI or Auto AI generation over your canvas to automatically record real-time token counts here.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/40 transition-colors text-xs shadow-sm"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <ProviderBadge type={item.providerType || "custom"} size="md" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold truncate text-xs">{item.modelId}</span>
                    {item.intent && (
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
                        {item.intent}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs">
                <span className="text-blue-500 font-semibold bg-blue-500/10 px-2 py-1 rounded">
                  in: {item.inputTokens?.toLocaleString() || 0}
                </span>
                <span className="text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-1 rounded">
                  out: {item.outputTokens?.toLocaleString() || 0}
                </span>
                <span className="font-extrabold text-foreground bg-muted px-2.5 py-1 rounded">
                  total: {item.totalTokens?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderBadge({ type, size = "sm" }: { type: ProviderType; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "size-8 text-sm" : "size-5 text-xs";
  switch (type) {
    case "openai":
      return (
        <div className={`${sizeClass} rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-extrabold shrink-0`}>
          ⚙
        </div>
      );
    case "anthropic":
      return (
        <div className={`${sizeClass} rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center font-extrabold shrink-0`}>
          ◈
        </div>
      );
    case "gemini":
      return (
        <div className={`${sizeClass} rounded-full bg-blue-500/15 text-blue-600 flex items-center justify-center font-extrabold shrink-0`}>
          ✦
        </div>
      );
    case "nvidia":
      return (
        <div className={`${sizeClass} rounded-full bg-green-500/15 text-green-600 flex items-center justify-center font-extrabold shrink-0`}>
          N
        </div>
      );
    case "groq":
      return (
        <div className={`${sizeClass} rounded-full bg-orange-500/15 text-orange-600 flex items-center justify-center font-extrabold shrink-0`}>
          ⚡
        </div>
      );
    case "custom":
    default:
      return (
        <div className={`${sizeClass} rounded-full bg-purple-500/15 text-purple-600 flex items-center justify-center font-extrabold shrink-0`}>
          λ
        </div>
      );
  }
}