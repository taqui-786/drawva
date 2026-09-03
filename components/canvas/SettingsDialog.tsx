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
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading02Icon,
  CloudCheckIcon,
  Database01Icon,
  Settings01Icon,
  EyeIcon,
  EyeOffIcon,
  FlashIcon,
  CloudServerIcon,
  Analytics01Icon,
} from "@hugeicons/core-free-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProviderConfig,
  getCachedModels,
  getActiveModel,
  setProviderConfig,
  setCachedModels,
  setCachedModelCapabilities,
  setActiveModel,
  getModelCapabilitiesCached,
  getWebSearchEnabled,
  setWebSearchEnabled,
  PROVIDER_INFOS,
  type ProviderType,
  type ProviderConfig,
  type CustomModel,
} from "@/lib/ai/provider";
import {
  saveProviderCredentialsToDb,
  loadSavedProviderCredentialsFromDb,
  getAutosaveEnabled,
  setAutosaveEnabled,
} from "@/lib/canvas/persistence";
import { getRecentAiUsage, clearAiUsage } from "@/lib/actions/usage";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDER_METADATA: Record<
  ProviderType,
  {
    tagline: string;
    apiKeyUrl?: string;
    keyPlaceholder: string;
  }
> = {
  openai: {
    tagline: "GPT-4o, GPT-4o-mini, o-series",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
  },
  anthropic: {
    tagline: "Claude 3.7 & 3.5 Sonnet",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
  },
  gemini: {
    tagline: "Gemini 2.5 Flash & Pro",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIzaSy...",
  },
  groq: {
    tagline: "Llama 3.2 Vision Inference",
    apiKeyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
  },
  nvidia: {
    tagline: "NVIDIA NIM Cloud Endpoints",
    apiKeyUrl: "https://build.nvidia.com/",
    keyPlaceholder: "nvapi-...",
  },
  openrouter: {
    tagline: "Unified API for 300+ models",
    apiKeyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-...",
  },
  deepinfra: {
    tagline: "Fast open source inference",
    apiKeyUrl: "https://deepinfra.com/dash/api_keys",
    keyPlaceholder: "API key...",
  },
  opencode_zen: {
    tagline: "OpenCode Zen endpoint",
    apiKeyUrl: "https://opencode.ai/",
    keyPlaceholder: "sk-...",
  },
  opencode_go: {
    tagline: "OpenCode Go high-speed endpoint",
    apiKeyUrl: "https://opencode.ai/",
    keyPlaceholder: "sk-...",
  },
  mistral: {
    tagline: "Frontier European AI & Pixtral",
    apiKeyUrl: "https://console.mistral.ai/api-keys/",
    keyPlaceholder: "API key...",
  },
  together: {
    tagline: "Fast open source cloud models",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
    keyPlaceholder: "API key...",
  },
  cerebras: {
    tagline: "Ultra-fast wafer-scale inference",
    apiKeyUrl: "https://cloud.cerebras.ai/",
    keyPlaceholder: "csk-...",
  },
  xai: {
    tagline: "Grok 2 Vision & Reasoning",
    apiKeyUrl: "https://console.x.ai/",
    keyPlaceholder: "xai-...",
  },
  perplexity: {
    tagline: "Online conversational search models",
    apiKeyUrl: "https://www.perplexity.ai/settings/api",
    keyPlaceholder: "pplx-...",
  },
  ollama: {
    tagline: "Local open-source models",
    keyPlaceholder: "ollama (optional)",
  },
  lmstudio: {
    tagline: "Local models via LM Studio",
    keyPlaceholder: "lm-studio (optional)",
  },
  custom: {
    tagline: "Custom OpenAI-compatible API",
    keyPlaceholder: "API key or local token...",
  },
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [currentConfig, setCurrentConfig] = useState<ProviderConfig | null>(() => getProviderConfig());
  const [activeModelName, setActiveModelName] = useState<string | null>(() => getActiveModel());

  useEffect(() => {
    const syncState = () => {
      setCurrentConfig(getProviderConfig());
      setActiveModelName(getActiveModel());
    };
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>AI Settings</DialogTitle>
            {currentConfig?.apiKey ? (
              <Badge variant="secondary" className="font-mono text-xs capitalize">
                {currentConfig.type}: {activeModelName || "connected"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Not configured
              </Badge>
            )}
          </div>
          <DialogDescription>
            Configure your AI provider, model routing, and monitor token usage.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="provider" className="flex flex-col gap-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="provider" className="gap-1.5 text-xs sm:text-sm">
              <HugeiconsIcon icon={FlashIcon} className="size-4" />
              <span>Provider</span>
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-1.5 text-xs sm:text-sm">
              <HugeiconsIcon icon={CloudServerIcon} className="size-4" />
              <span>Models</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <HugeiconsIcon icon={Settings01Icon} className="size-4" />
              <span>Settings</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5 text-xs sm:text-sm">
              <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
              <span>Usage</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="provider" className="flex flex-col gap-4">
            <ProviderTabContent
              onConfigSaved={(cfg, model) => {
                setCurrentConfig(cfg);
                setActiveModelName(model);
              }}
            />
          </TabsContent>

          <TabsContent value="models" className="flex flex-col gap-4">
            <ModelsTabContent
              onModelChanged={(model) => setActiveModelName(model)}
            />
          </TabsContent>

          <TabsContent value="settings" className="flex flex-col gap-4">
            <GeneralSettingsTabContent />
          </TabsContent>

          <TabsContent value="usage" className="flex flex-col gap-4">
            <UsageTabContent />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProviderTabContent({
  onConfigSaved,
}: {
  onConfigSaved: (cfg: ProviderConfig, activeModel: string | null) => void;
}) {
  const initial = getProviderConfig();
  const [providerType, setProviderType] = useState<ProviderType>(initial?.type || "openai");
  const [apiKey, setApiKey] = useState(initial?.apiKey || "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || PROVIDER_INFOS[initial?.type || "openai"].defaultBaseUrl || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [customModels] = useState<CustomModel[]>(initial?.customModels || []);

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedCount, setVerifiedCount] = useState<number | null>(() => getCachedModels().length || null);
  const meta = PROVIDER_METADATA[providerType];

  const handleSelectProvider = async (type: ProviderType) => {
    setProviderType(type);
    const info = PROVIDER_INFOS[type];
    try {
      const saved = await loadSavedProviderCredentialsFromDb(type);
      if (saved) {
        setApiKey(saved.apiKey || "");
        setBaseUrl(saved.baseUrl || info.defaultBaseUrl || "");
        return;
      }
    } catch {}

    if (initial?.type === type) {
      setApiKey(initial.apiKey || "");
      setBaseUrl(initial.baseUrl || info.defaultBaseUrl || "");
    } else {
      setApiKey("");
      setBaseUrl(info.defaultBaseUrl || "");
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await loadSavedProviderCredentialsFromDb(providerType);
        if (active && saved) {
          if (saved.apiKey) setApiKey((prev) => prev || saved.apiKey);
          if (saved.baseUrl) setBaseUrl((prev) => prev || saved.baseUrl || "");
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [providerType]);

  const handleSaveCredentials = async () => {
    if (!apiKey.trim() && providerType !== "ollama" && providerType !== "lmstudio") {
      toast.error("Please enter an API key to save.");
      return;
    }
    setSaving(true);
    try {
      const creds = {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || PROVIDER_INFOS[providerType].defaultBaseUrl,
      };
      await saveProviderCredentialsToDb(providerType, creds);

      const config: ProviderConfig = {
        type: providerType,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        customModels: providerType === "custom" ? customModels : undefined,
      };

      setProviderConfig(config);
      onConfigSaved(config, getActiveModel());
      toast.success("Credentials saved", {
        description: `Saved to browser storage for ${PROVIDER_INFOS[providerType].name}.`,
      });
    } catch {
      toast.error("Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  const verifyAndSave = async () => {
    if (!apiKey.trim() && providerType !== "ollama" && providerType !== "lmstudio") {
      toast.error("Please enter an API key.");
      return;
    }
    if (providerType === "custom" && !baseUrl.trim() && customModels.length === 0) {
      toast.error("Custom provider requires a Base URL or at least one model ID.");
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
        capabilities?: Record<string, { vision: boolean; reasoning: boolean }>;
        error?: string;
        filteredByVision?: boolean;
      };

      if (!res.ok || !Array.isArray(data.models) || data.models.length === 0) {
        toast.error(data.error || "No vision-capable models found at this endpoint.");
        return;
      }

      const config: ProviderConfig = {
        type: providerType,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        customModels: providerType === "custom" ? customModels : undefined,
      };

      await saveProviderCredentialsToDb(providerType, {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || PROVIDER_INFOS[providerType].defaultBaseUrl,
      });

      setProviderConfig(config);
      setCachedModels(data.models);
      if (data.capabilities) {
        setCachedModelCapabilities(data.capabilities);
      }
      setVerifiedCount(data.models.length);

      const currentActive = getActiveModel();
      const nextActive = currentActive && data.models.includes(currentActive) ? currentActive : data.models[0];
      if (nextActive) {
        setActiveModel(nextActive);
      }

      onConfigSaved(config, nextActive);

      toast.success("Connected", {
        description: `Found ${data.models.length} vision models.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setVerifying(false);
    }
  };

  const defaultUrl = PROVIDER_INFOS[providerType].defaultBaseUrl;
  const isCustomUrl = Boolean(defaultUrl) && baseUrl.trim() !== defaultUrl;

  return (
    <div className="flex flex-col gap-4">
      {/* Compact Provider Selection */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-select" className="text-xs font-medium">Provider</Label>
        <Select
          value={providerType}
          onValueChange={(val) => {
            if (val) void handleSelectProvider(val as ProviderType);
          }}
        >
          <SelectTrigger id="provider-select" className="w-full">
            <SelectValue placeholder="Select AI provider" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(Object.keys(PROVIDER_INFOS) as ProviderType[]).map((type) => {
              const info = PROVIDER_INFOS[type];
              const m = PROVIDER_METADATA[type];
              return (
                <SelectItem key={type} value={type}>
                  <span className="font-medium text-sm">{info.name}</span>
                  {m?.tagline && (
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                      ({m.tagline})
                    </span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{PROVIDER_INFOS[providerType].name} Credentials</CardTitle>
              <CardDescription>
                Enter your API credentials to connect.
              </CardDescription>
            </div>
            {meta.apiKeyUrl && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                render={<a href={meta.apiKeyUrl} target="_blank" rel="noopener noreferrer" />}
              >
                Get API key
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} />
                <span className="sr-only">Toggle API key visibility</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="base-url">Base URL</Label>
              {isCustomUrl && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setBaseUrl(defaultUrl || "")}
                >
                  Reset to default
                </Button>
              )}
            </div>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={defaultUrl || "https://api.openai.com/v1"}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {verifiedCount !== null && `${verifiedCount} models available`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveCredentials}
                disabled={saving || (!apiKey.trim() && providerType !== "ollama" && providerType !== "lmstudio")}
                className="gap-1.5"
              >
                <HugeiconsIcon icon={Database01Icon} className="size-3.5" />
                <span>{saving ? "Saving…" : "Save"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={verifyAndSave}
                disabled={verifying}
                className="gap-1.5"
              >
                {verifying ? (
                  <>
                    <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={CloudCheckIcon} className="size-3.5" />
                    <span>Connect</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModelsTabContent({
  onModelChanged,
}: {
  onModelChanged: (model: string) => void;
}) {
  const [cachedModels] = useState<string[]>(() => getCachedModels());
  const [activeModel, setActive] = useState<string | null>(() => getActiveModel());
  const config = getProviderConfig();

  const handleSelectModel = (val: string | null) => {
    if (!val) return;
    setActiveModel(val);
    setActive(val);
    onModelChanged(val);
    toast.success(`Active model switched to ${val}`);
  };

  const selectedCaps = activeModel ? getModelCapabilitiesCached(activeModel) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Model</CardTitle>
              <CardDescription>
                Select the model used for canvas perception and AI commands.
              </CardDescription>
            </div>
            {config?.type && (
              <Badge variant="secondary" className="font-mono text-xs capitalize">
                {PROVIDER_INFOS[config.type]?.name || config.type}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cachedModels.length > 0 ? (
            <>
              <Select value={activeModel || cachedModels[0]} onValueChange={handleSelectModel}>
                <SelectTrigger className="w-full font-mono text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {cachedModels.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedCaps && (
                <div className="flex items-center gap-2 pt-1">
                  <Badge
                    variant={selectedCaps.vision ? "default" : "secondary"}
                    className="text-[11px]"
                  >
                    {selectedCaps.vision ? "Vision: Supported" : "Vision: Unsupported"}
                  </Badge>
                  <Badge
                    variant={selectedCaps.reasoning ? "outline" : "secondary"}
                    className="text-[11px]"
                  >
                    {selectedCaps.reasoning ? "Reasoning: Supported" : "Standard"}
                  </Badge>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg text-center gap-1.5">
              <span className="text-sm font-medium">No models available</span>
              <span className="text-xs text-muted-foreground">
                Connect your AI provider in the Provider tab to discover and select vision models.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GeneralSettingsTabContent() {
  const [autoSave, setAutoSave] = useState<boolean>(() => getAutosaveEnabled());
  const [webSearch, setWebSearch] = useState<boolean>(() => getWebSearchEnabled());

  const handleToggleAutoSave = (checked: boolean) => {
    setAutoSave(checked);
    setAutosaveEnabled(checked);
    toast.success(checked ? "Auto save enabled" : "Auto save disabled (delayed saves off)");
  };

  const handleToggleWebSearch = (checked: boolean) => {
    setWebSearch(checked);
    setWebSearchEnabled(checked);
    toast.success(checked ? "Internet search enabled" : "Internet search disabled");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Canvas & AI Preferences</CardTitle>
          <CardDescription>
            Configure whiteboard persistence and AI perception tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60">
          {/* Auto Save Row */}
          <div className="flex items-center justify-between py-3 first:pt-0">
            <div className="flex flex-col gap-0.5 pr-4">
              <Label htmlFor="toggle-autosave" className="text-sm font-medium cursor-pointer">
                Auto Save
              </Label>
              <span className="text-xs text-muted-foreground">
                Automatically save canvas strokes, objects, and widgets locally with debounced delay.
              </span>
            </div>
            <Switch
              id="toggle-autosave"
              checked={autoSave}
              onCheckedChange={handleToggleAutoSave}
            />
          </div>

          {/* Internet Search Row */}
          <div className="flex items-center justify-between py-3 last:pb-0">
            <div className="flex flex-col gap-0.5 pr-4">
              <Label htmlFor="toggle-websearch" className="text-sm font-medium cursor-pointer">
                Internet Search
              </Label>
              <span className="text-xs text-muted-foreground">
                Allow the AI agent to search the web, papers, GitHub, and market data before drawing.
              </span>
            </div>
            <Switch
              id="toggle-websearch"
              checked={webSearch}
              onCheckedChange={handleToggleWebSearch}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTabContent() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["aiUsage"],
    queryFn: () => getRecentAiUsage(10),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const clearMutation = useMutation({
    mutationFn: () => clearAiUsage(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiUsage"] });
      toast.success("Usage history cleared.");
    },
    onError: () => {
      toast.error("Failed to clear usage history.");
    },
  });

  const stats = data?.stats ?? {
    requests: 0,
    totalPrompt: 0,
    totalCompletion: 0,
    total: 0,
  };
  const history = data?.history ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Requests</CardDescription>
            {isLoading ? (
              <Skeleton className="h-6 w-16 mt-1" />
            ) : (
              <CardTitle className="text-lg font-mono">{stats.requests.toLocaleString()}</CardTitle>
            )}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Prompt</CardDescription>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <CardTitle className="text-lg font-mono">{stats.totalPrompt.toLocaleString()}</CardTitle>
            )}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Completion</CardDescription>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <CardTitle className="text-lg font-mono">{stats.totalCompletion.toLocaleString()}</CardTitle>
            )}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Total Tokens</CardDescription>
            {isLoading ? (
              <Skeleton className="h-6 w-24 mt-1" />
            ) : (
              <CardTitle className="text-lg font-mono">{stats.total.toLocaleString()}</CardTitle>
            )}
          </CardHeader>
        </Card>
      </div>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Usage History</CardTitle>
              <CardDescription>
                Latest 10 AI requests and token consumption from your account.
              </CardDescription>
            </div>
            {history.length > 0 && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                {clearMutation.isPending ? "Clearing…" : "Clear"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2 py-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 border border-dashed rounded-lg text-center gap-1">
              <span className="text-sm font-medium text-destructive">Failed to load usage data</span>
              <span className="text-xs text-muted-foreground">Please check your connection and try again.</span>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-lg text-center gap-1">
              <span className="text-sm font-medium">No usage recorded</span>
              <span className="text-xs text-muted-foreground">
                Token statistics will appear here after AI actions.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {item.providerType}
                    </Badge>
                    <span className="font-mono font-medium truncate max-w-[140px]">
                      {item.modelId}
                    </span>
                    {item.intent && (
                      <span className="text-[10px] text-muted-foreground/80 truncate max-w-[90px] hidden sm:inline">
                        ({item.intent})
                      </span>
                    )}
                    {item.snapshotUrl && (
                      <a
                        href={item.snapshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View snapshot"
                        className="inline-flex items-center text-primary hover:opacity-80"
                      >
                        <HugeiconsIcon icon={EyeIcon} className="size-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                    <span>in: {(item.inputTokens || 0).toLocaleString()}</span>
                    <span>out: {(item.outputTokens || 0).toLocaleString()}</span>
                    <span className="font-medium text-foreground">
                      {(item.totalTokens || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
