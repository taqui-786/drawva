"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading02Icon, CloudCheckIcon } from "@hugeicons/core-free-icons";
import {
  getProviderConfig,
  getCachedModels,
  getActiveModel,
  setProviderConfig,
  setCachedModels,
  setActiveModel,
  type ProviderConfig,
} from "@/lib/ai/provider";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[26rem] max-w-[calc(100%-2rem)]">
        <ProviderForm />
      </DialogContent>
    </Dialog>
  );
}

// The form unmounts when the dialog closes, so its state is re-seeded from
// localStorage on every open via useState initializers (no effect needed).
function ProviderForm() {
  const initial = getProviderConfig();
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [verifying, setVerifying] = useState(false);
  const [connected, setConnected] = useState(Boolean(initial?.baseUrl && initial.apiKey));
  const [modelCount, setModelCount] = useState(() => (initial ? getCachedModels().length : 0));

  const verify = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast.error("Enter both a Base URL and an API key first.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/canvas/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }),
      });
      const data = (await res.json()) as {
        models?: string[];
        error?: string;
        filteredByVision?: boolean;
      };
      if (!res.ok || !Array.isArray(data.models) || data.models.length === 0) {
        toast.error(
          data.error || "Img + text supported input models required to run the AI generation here."
        );
        return;
      }

      const config: ProviderConfig = {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
      };
      setProviderConfig(config);
      setCachedModels(data.models);

      const active = getActiveModel();
      if (!active || !data.models.includes(active)) {
        setActiveModel(data.models[0] ?? null);
      }

      setConnected(true);
      setModelCount(data.models.length);
      toast.success("Provider connected", {
        description: "img + text input supported models added",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Provider verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>AI Provider settings</DialogTitle>
        <DialogDescription>
          Connect an OpenAI-compatible API, then run Ask AI or Auto AI over this
          canvas. Your API key is only sent to this provider and never logged.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-base-url" className="text-xs">
            Base URL
          </Label>
          <Input
            id="provider-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="provider-api-key" className="text-xs">
            API key
          </Label>
          <Input
            id="provider-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {connected && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={CloudCheckIcon} strokeWidth={2} className="size-4" />
            Connected · {modelCount > 0 ? `${modelCount} models` : "saved"}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="secondary"
          onClick={verify}
          disabled={verifying}
          className="gap-1.5"
        >
          {verifying ? (
            <HugeiconsIcon
              icon={Loading02Icon}
              strokeWidth={2}
              className="size-4 animate-spin"
            />
          ) : (
            "Verify & Fetch Models"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}