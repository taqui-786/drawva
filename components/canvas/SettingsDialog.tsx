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
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading02Icon,
  CloudCheckIcon,
  Delete02Icon,
  Add01Icon,
  EyeIcon,
  EyeOffIcon,
  FlashIcon,
  CloudServerIcon,
  AppWindowIcon,
  Analytics01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProviderConfig,
  getCachedModels,
  getActiveModel,
  getEnabledPlugins,
  setEnabledPlugins,
  setProviderConfig,
  setCachedModels,
  setCachedModelCapabilities,
  setActiveModel,
  PROVIDER_INFOS,
  type ProviderType,
  type ProviderConfig,
  type CustomModel,
} from "@/lib/ai/provider";
import { getRecentAiUsage, clearAiUsage } from "@/lib/actions/usage";
import type { PluginMetadata } from "@/lib/plugins/registry";

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
    tagline: "GPT-4o & GPT-4o-mini",
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
  codex: {
    tagline: "Local CLI Session",
    apiKeyUrl: "https://github.com/openai/codex",
    keyPlaceholder: "Local codex session (no key required)",
  },
  nvidia: {
    tagline: "NVIDIA NIM Cloud Endpoints",
    apiKeyUrl: "https://build.nvidia.com/",
    keyPlaceholder: "nvapi-...",
  },
  custom: {
    tagline: "Ollama, LM Studio, OpenRouter",
    apiKeyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "API key or local token...",
  },
};

const LOCAL_PRESETS = [
  {
    name: "Ollama Local",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    models: [
      { id: "llava", name: "LLaVA Vision" },
      { id: "llama3.2-vision", name: "Llama 3.2 Vision" },
    ],
  },
  {
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "lm-studio",
    models: [{ id: "default", name: "Active LM Studio Model" }],
  },
  {
    name: "OpenRouter Gateway",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    models: [
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    ],
  },
  {
    name: "AgentRouter Gateway",
    baseUrl: "https://agentrouter.org/v1",
    apiKey: "",
    models: [
      { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
      { id: "claude-opus-5", name: "Claude Opus 5" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "glm-5.3", name: "GLM 5.3" },
      { id: "gpt-5.6-sol", name: "GPT 5.6 Sol" },
    ],
  },
];

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
            <TabsTrigger value="provider" className="gap-2">
              <HugeiconsIcon icon={FlashIcon} />
              <span>Provider</span>
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <HugeiconsIcon icon={CloudServerIcon} />
              <span>Models</span>
            </TabsTrigger>
            <TabsTrigger value="plugins" className="gap-2">
              <HugeiconsIcon icon={AppWindowIcon} />
              <span>Plugins</span>
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <HugeiconsIcon icon={Analytics01Icon} />
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

          <TabsContent value="plugins" className="flex flex-col gap-4">
            <PluginsTabContent />
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
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [customModels] = useState<CustomModel[]>(initial?.customModels || []);

  const [verifying, setVerifying] = useState(false);
  const [verifiedCount, setVerifiedCount] = useState<number | null>(() => getCachedModels().length || null);
  const meta = PROVIDER_METADATA[providerType];

  const handleSelectProvider = (type: ProviderType) => {
    setProviderType(type);
    const info = PROVIDER_INFOS[type];
    if (type !== "custom") {
      setBaseUrl(info.defaultBaseUrl || "");
    }
    if (type === "codex") {
      setApiKey("codex-local");
    } else if (apiKey === "codex-local") {
      setApiKey("");
    }
  };

  const { data: cliStatus } = useQuery({
    queryKey: ["cli-status"],
    queryFn: async () => {
      const res = await fetch("/api/canvas/provider");
      if (!res.ok) return null;
      return (await res.json()) as { codex?: { available: boolean; reason?: string; path?: string } };
    },
    enabled: providerType === "codex",
  });

  const verifyAndSave = async () => {
    if (providerType !== "codex" && !apiKey.trim()) {
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
          apiKey: apiKey.trim() || (providerType === "codex" ? "codex-local" : ""),
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
        apiKey: apiKey.trim() || (providerType === "codex" ? "codex-local" : ""),
        baseUrl: baseUrl.trim() || undefined,
        customModels: providerType === "custom" ? customModels : undefined,
      };

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

  return (
    <div className="flex flex-col gap-4">
      {/* Provider Selection */}
      <div className="flex flex-col gap-2">
        <Label>Provider</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(PROVIDER_INFOS) as ProviderType[]).map((type) => {
            const info = PROVIDER_INFOS[type];
            const isSelected = providerType === type;

            return (
              <Button
                key={type}
                type="button"
                variant={isSelected ? "default" : "outline"}
                className="h-auto flex-col items-start p-3 text-left"
                onClick={() => handleSelectProvider(type)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-sm">{info.name}</span>
                  {isSelected && <HugeiconsIcon icon={Tick02Icon} />}
                </div>
                <span
                  className={`text-xs ${
                    isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {PROVIDER_METADATA[type].tagline}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{PROVIDER_INFOS[providerType].name} Credentials</CardTitle>
              <CardDescription>
                {providerType === "codex"
                  ? "Connect via your authenticated local CLI session."
                  : "Enter your API credentials to connect."}
              </CardDescription>
            </div>
            {meta.apiKeyUrl && (
              <Button variant="link" size="sm" className="h-auto p-0" render={<a href={meta.apiKeyUrl} target="_blank" rel="noopener noreferrer" />}>
                {providerType === "codex" ? "CLI docs" : "Get API key"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {providerType === "codex" ? (
            <div className="rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground flex flex-col gap-1.5">
              <div className="font-semibold text-foreground flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${cliStatus?.codex?.available !== false ? "bg-emerald-500" : "bg-destructive"}`} />
                {cliStatus?.codex?.available !== false ? "Local Codex Session Detected" : "Codex CLI Not Detected"}
              </div>
              <p>
                {cliStatus?.codex?.available !== false ? (
                  <>
                    Detected executable at <code className="text-foreground">{cliStatus?.codex?.path || "PATH"}</code> using session in <code className="text-foreground">~/.codex/auth.json</code>. No API key or Base URL required.
                  </>
                ) : (
                  <>
                    {cliStatus?.codex?.reason || "Install and log in with `codex login` in your terminal."}
                  </>
                )}
              </p>
            </div>
          ) : (
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
                  className="pr-10 font-mono"
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
          )}

          {providerType !== "codex" && (providerType === "custom" || (Boolean(PROVIDER_INFOS[providerType].defaultBaseUrl) && baseUrl !== PROVIDER_INFOS[providerType].defaultBaseUrl)) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="base-url">Base URL</Label>
                {providerType !== "custom" && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => setBaseUrl(PROVIDER_INFOS[providerType].defaultBaseUrl || "")}
                  >
                    Reset to default
                  </Button>
                )}
              </div>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={PROVIDER_INFOS[providerType].defaultBaseUrl || "https://api.openai.com/v1"}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {verifiedCount !== null && `${verifiedCount} models available`}
            </span>
            <Button onClick={verifyAndSave} disabled={verifying} className="gap-2">
              {verifying ? (
                <>
                  <HugeiconsIcon icon={Loading02Icon} className="animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={CloudCheckIcon} />
                  <span>Connect</span>
                </>
              )}
            </Button>
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
  const initial = getProviderConfig();
  const [cachedModels, setModels] = useState<string[]>(() => getCachedModels());
  const [activeModel, setActive] = useState<string | null>(() => getActiveModel());
  const [customModels, setCustomModels] = useState<CustomModel[]>(initial?.customModels || []);
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");

  const handleSelectModel = (val: string | null) => {
    if (!val) return;
    setActiveModel(val);
    setActive(val);
    onModelChanged(val);
    toast.success(`Active model switched to ${val}`);
  };

  const handleAddCustomModel = () => {
    if (!newModelId.trim()) {
      toast.error("Please enter a model ID.");
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    if (customModels.some((m) => m.id === id)) {
      toast.error("Model ID already exists.");
      return;
    }
    const updated = [...customModels, { id, name }];
    setCustomModels(updated);
    setNewModelId("");
    setNewModelName("");

    const currentCfg = getProviderConfig();
    if (currentCfg) {
      setProviderConfig({ ...currentCfg, customModels: updated });
    }

    if (!cachedModels.includes(id)) {
      const newCache = [id, ...cachedModels];
      setCachedModels(newCache);
      setModels(newCache);
      handleSelectModel(id);
    }
    toast.success(`Added ${name}`);
  };

  const handleRemoveCustomModel = (id: string) => {
    const updated = customModels.filter((m) => m.id !== id);
    setCustomModels(updated);

    const currentCfg = getProviderConfig();
    if (currentCfg) {
      setProviderConfig({ ...currentCfg, customModels: updated });
    }

    if (activeModel === id) {
      const next = cachedModels.find((m) => m !== id) || null;
      setActiveModel(next);
      setActive(next);
      if (next) onModelChanged(next);
    }
  };

  const handleApplyPreset = (preset: (typeof LOCAL_PRESETS)[0]) => {
    const currentCfg = getProviderConfig();
    const updatedCfg: ProviderConfig = {
      type: "custom",
      baseUrl: preset.baseUrl,
      apiKey: currentCfg?.apiKey || preset.apiKey || "local",
      customModels: preset.models,
    };
    setProviderConfig(updatedCfg);
    setCustomModels(preset.models);
    const modelIds = preset.models.map((m) => m.id);
    setCachedModels(modelIds);
    setModels(modelIds);
    if (modelIds[0]) {
      handleSelectModel(modelIds[0]);
    }
    toast.success(`Applied ${preset.name}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Active Model */}
      <Card>
        <CardHeader>
          <CardTitle>Active Model</CardTitle>
          <CardDescription>
            Select the model used for canvas perception and AI commands.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cachedModels.length > 0 ? (
            <Select value={activeModel || cachedModels[0]} onValueChange={handleSelectModel}>
              <SelectTrigger className="w-full font-mono text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {cachedModels.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center justify-center py-6 border border-dashed rounded-lg text-sm text-muted-foreground">
              No models available. Connect a provider first.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Local & Gateway Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Local & Gateway Presets</CardTitle>
          <CardDescription>
            Quickly configure local instances or gateway routers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {LOCAL_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                className="h-auto flex-col items-start p-3 text-left"
                onClick={() => handleApplyPreset(preset)}
              >
                <span className="font-medium text-xs">{preset.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground truncate w-full">
                  {preset.baseUrl}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Models */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Models</CardTitle>
          <CardDescription>
            Add manual model IDs for local or self-hosted endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {customModels.length > 0 && (
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {customModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border text-xs"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{m.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground truncate">{m.id}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveCustomModel(m.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    <span className="sr-only">Remove model</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              placeholder="Model ID (e.g. qwen2.5-vl)"
              className="font-mono text-xs"
            />
            <Input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="Label"
              className="text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddCustomModel}
              className="gap-1.5 shrink-0"
            >
              <HugeiconsIcon icon={Add01Icon} />
              <span>Add</span>
            </Button>
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

function PluginsTabContent() {
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(() => getEnabledPlugins());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/plugins")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && Array.isArray(data?.plugins)) {
          setPlugins(data.plugins);
        }
      })
      .catch((err) => {
        console.error("Failed to load plugins list:", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...enabledIds, id]))
      : enabledIds.filter((item) => item !== id);
    setEnabledIds(next);
    setEnabledPlugins(next);
    toast.success(`Plugin ${checked ? "enabled" : "disabled"}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Capability Plugins</CardTitle>
              <CardDescription>
                Enable or disable dynamic data widgets, live feeds, and specialized diagram formats.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              {enabledIds.length} / {plugins.length} active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
              <HugeiconsIcon icon={Loading02Icon} className="animate-spin size-4" />
              <span>Loading capability cards...</span>
            </div>
          ) : plugins.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No plugins found in catalog.
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
              {plugins.map((plugin) => {
                const isEnabled = enabledIds.includes(plugin.id);
                return (
                  <div
                    key={plugin.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-card/60 hover:bg-card/90 transition-colors gap-3"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{plugin.name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          {plugin.category}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          v{plugin.version}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {plugin.description}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono mt-1">
                        <span>Source: {plugin.source}</span>
                        {plugin.connect.length > 0 && (
                          <span className="truncate max-w-[200px]" title={plugin.connect.join(", ")}>
                            Endpoints: {plugin.connect.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pt-0.5 shrink-0">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggle(plugin.id, Boolean(checked))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
