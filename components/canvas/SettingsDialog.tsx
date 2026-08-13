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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading02Icon,
  CloudCheckIcon,
  Delete02Icon,
  Add01Icon,
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[48rem] max-w-[calc(100%-2rem)] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>AI Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider and model.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="provider" className="px-6 pb-6">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
            <TabsTrigger
              value="provider"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Provider
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Usage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="provider" className="mt-4">
            <ProviderTab />
          </TabsContent>
          <TabsContent value="usage" className="mt-4">
            <UsageTab />
          </TabsContent>
        </Tabs>
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
      toast.error("Enter a model ID.");
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    if (customModels.some((m) => m.id === id)) {
      toast.error("Model already added.");
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
      toast.error("Enter an API key.");
      return;
    }
    if (providerType === "custom" && !baseUrl.trim() && customModels.length === 0) {
      toast.error("Custom provider requires a base URL or models.");
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
        toast.error(data.error || "No vision models available.");
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

      toast.success("Connected", {
        description: `${data.models.length} models found.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Provider Selection */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <div className="grid grid-cols-6 gap-2">
          {(Object.keys(PROVIDER_INFOS) as ProviderType[]).map((type) => {
            const info = PROVIDER_INFOS[type];
            const isSelected = providerType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectProvider(type)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <ProviderBadge type={type} />
                <span className="text-xs font-medium truncate w-full">{info.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Credentials + Model Selection */}
      <div className="grid grid-cols-2 gap-6">
        {/* Credentials */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-key" className="text-xs">
              API Key <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} className="size-3.5" />
              </button>
            </div>
          </div>

          {providerType === "custom" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-url" className="text-xs">
                Base URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
          )}

          <Button onClick={verifyAndSave} disabled={verifying} className="w-full gap-2">
            {verifying ? (
              <>
                <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={CloudCheckIcon} className="size-3.5" />
                Connect
              </>
            )}
          </Button>
        </div>

        {/* Model Selection */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active Model</Label>
              <span className="text-[10px] text-muted-foreground">
                {cachedModels.length} verified
              </span>
            </div>
            <Select
              value={activeModel || ""}
              onValueChange={(val) => {
                setActiveModel(val);
                setActive(val);
              }}
            >
              <SelectTrigger className="font-mono text-xs">
                <SelectValue placeholder="No models" />
              </SelectTrigger>
              <SelectContent>
                {cachedModels.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {providerType === "custom" && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Custom Models</Label>
              {customModels.length > 0 && (
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {customModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 text-xs"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground truncate">{m.id}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomModel(m.id)}
                        className="text-muted-foreground hover:text-destructive p-0.5"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Input
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  placeholder="model-id"
                  className="font-mono text-xs h-8"
                />
                <Input
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Name"
                  className="text-xs h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomModel}
                  className="h-8 px-2"
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageTab() {
  const [history, setHistory] = useState<TokenUsageRecord[]>(() => getTokenUsageHistory());

  useEffect(() => {
    const update = () => setHistory(getTokenUsageHistory());
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const totalTokens = history.reduce((acc, curr) => acc + (curr.totalTokens || 0), 0);

  const handleClear = () => {
    clearTokenUsageHistory();
    setHistory([]);
    toast.success("History cleared.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{history.length} requests</span>
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 text-xs text-destructive hover:text-destructive"
          >
            Clear
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg text-center gap-2">
          <span className="text-sm text-muted-foreground">No usage yet</span>
          <span className="text-xs text-muted-foreground/70">
            Token usage will appear here after AI requests.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ProviderBadge type={item.providerType || "custom"} size="sm" />
                <span className="font-medium truncate">{item.modelId}</span>
                {item.intent && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase">
                    {item.intent}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span>in: {(item.inputTokens || 0).toLocaleString()}</span>
                <span>out: {(item.outputTokens || 0).toLocaleString()}</span>
                <span className="font-medium text-foreground">{(item.totalTokens || 0).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderBadge({ type, size = "sm" }: { type: ProviderType; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "size-6 text-[10px]" : "size-4 text-[8px]";
  const colors: Record<ProviderType, string> = {
    openai: "bg-emerald-500/10 text-emerald-600",
    anthropic: "bg-amber-500/10 text-amber-600",
    gemini: "bg-blue-500/10 text-blue-600",
    nvidia: "bg-green-500/10 text-green-600",
    groq: "bg-orange-500/10 text-orange-600",
    custom: "bg-purple-500/10 text-purple-600",
  };
  const labels: Record<ProviderType, string> = {
    openai: "O",
    anthropic: "A",
    gemini: "G",
    nvidia: "N",
    groq: "Q",
    custom: "C",
  };

  return (
    <div className={`${sizeClass} ${colors[type]} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {labels[type]}
    </div>
  );
}
