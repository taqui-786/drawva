"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick01Icon,
  ArrowUpRight01Icon,
  TerminalIcon,
  SparklesIcon,
  Image01Icon,
  CodeIcon,
  InformationCircleIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AiLogEntry } from "@/lib/ai/types";

export interface LogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: AiLogEntry | null;
  onClearLogs?: () => void;
}

/** Open a base64 data URL reliably in a new browser tab via Blob URL */
function openImageInNewTab(dataUrl: string) {
  if (!dataUrl) return;
  try {
    const parts = dataUrl.split(",");
    if (parts.length === 2) {
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/webp";
      const byteString = atob(parts[1]);
      const arrayBuffer = new ArrayBuffer(byteString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([uint8Array], { type: mime });
      const url = URL.createObjectURL(blob);
      const newTab = window.open(url, "_blank");
      if (!newTab) {
        toast.error("Pop-up blocked. Allow pop-ups to view full image in a new tab.");
      }
      return;
    }
  } catch (err) {
    console.error("Failed to open image blob URL:", err);
  }
  window.open(dataUrl, "_blank");
}

function CodeCard({
  title,
  content,
  badge,
  maxHeight = "max-h-96",
}: {
  title: string;
  content: string;
  badge?: string;
  maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success(`Copied ${title} to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col rounded-lg border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {badge}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">
            {content.length.toLocaleString()} chars
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-xs gap-1"
        >
          <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} className="size-3" />
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <div className={`overflow-auto p-3 text-xs font-mono leading-relaxed select-text ${maxHeight}`}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/90">
          {content}
        </pre>
      </div>
    </div>
  );
}

export function LogsDialog({ open, onOpenChange, log, onClearLogs }: LogsDialogProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "system" | "user" | "response" | "raw">("overview");
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = () => {
    if (!log) return;
    const fullLogJson = JSON.stringify(log, null, 2);
    void navigator.clipboard.writeText(fullLogJson);
    setCopiedAll(true);
    toast.success("Complete log JSON copied to clipboard");
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const formattedTime = log ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[60rem] max-w-[calc(100%-2rem)] h-[85vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <HugeiconsIcon icon={TerminalIcon} className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">AI Request & Generation Logs</DialogTitle>
                <DialogDescription className="text-xs">
                  Inspect the atlas sent to the model, exact prompts, and structured LLM responses.
                </DialogDescription>
              </div>
            </div>

            {log && (
              <div className="flex items-center gap-2">
                {onClearLogs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearLogs}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5 mr-1" />
                    Clear
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAll}
                  className="h-7 text-xs gap-1.5"
                >
                  <HugeiconsIcon icon={copiedAll ? Tick01Icon : Copy01Icon} className="size-3.5" />
                  <span>{copiedAll ? "Copied All" : "Copy JSON"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Quick Metadata Bar */}
          {log && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <Badge
                variant={log.status === "success" ? "default" : "destructive"}
                className={`text-[11px] font-medium ${
                  log.status === "success" ? "bg-emerald-600 hover:bg-emerald-700" : ""
                }`}
              >
                {log.status === "success" ? "Success" : "Failed"}
              </Badge>

              <Badge variant="outline" className="font-mono text-[11px]">
                {log.model}
              </Badge>

              {log.providerType && (
                <Badge variant="secondary" className="text-[11px] capitalize">
                  {log.providerType}
                </Badge>
              )}

              <span className="text-muted-foreground text-[11px] font-mono">
                {formattedTime}
              </span>

              <span className="text-muted-foreground text-[11px]">
                Attempt {log.attempts}
              </span>

              {log.tokenUsage && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>in: {log.tokenUsage.inputTokens.toLocaleString()}</span>
                  <span>out: {log.tokenUsage.outputTokens.toLocaleString()}</span>
                  <span className="font-semibold text-foreground">
                    total: {log.tokenUsage.totalTokens.toLocaleString()}
                  </span>
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Body Content */}
        {!log ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={SparklesIcon} className="size-6" />
            </div>
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold text-foreground">No AI Generation Recorded Yet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Draw anything on the whiteboard and click &quot;Ask AI&quot; or toggle &quot;Auto AI&quot;. Once generation completes, full snapshots, prompts, and model responses will appear here.
              </p>
            </div>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Tabs List */}
            <div className="px-6 border-b bg-muted/20 shrink-0">
              <TabsList className="bg-transparent p-0 h-10 gap-2">
                <TabsTrigger
                  value="overview"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={Image01Icon} className="size-3.5 mr-1.5" />
                  Snapshot & Overview
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 mr-1.5" />
                  System Prompt
                </TabsTrigger>
                <TabsTrigger
                  value="user"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={CodeIcon} className="size-3.5 mr-1.5" />
                  User Prompt & Scene
                </TabsTrigger>
                <TabsTrigger
                  value="response"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="size-3.5 mr-1.5" />
                  LLM Response
                  {log.response?.commands && log.response.commands.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                      {log.response.commands.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="raw"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={TerminalIcon} className="size-3.5 mr-1.5" />
                  Raw JSON
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Overview & Snapshot */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Snapshot Image Box */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Canvas Snapshot (Atlas Image)</span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      WebP &le;2048px
                    </Badge>
                  </div>
                  {log.atlasImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openImageInNewTab(log.atlasImage)}
                      className="h-7 text-xs gap-1"
                    >
                      <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                      <span>Open Full Size in New Tab</span>
                    </Button>
                  )}
                </div>

                {log.atlasImage ? (
                  <div
                    onClick={() => openImageInNewTab(log.atlasImage)}
                    title="Click to view full image in new tab"
                    className="group relative cursor-pointer overflow-hidden rounded-lg border bg-neutral-950 p-2 text-center transition-all hover:border-primary/60 hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={log.atlasImage}
                      alt="Canvas snapshot sent to AI"
                      className="mx-auto max-h-72 object-contain rounded transition-transform duration-200 group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg flex items-center gap-1.5 backdrop-blur-xs">
                        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                        Click to view full image in new tab
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No snapshot image attached
                  </div>
                )}
              </div>

              {log.focusInset && (
                <p className="text-[11px] text-muted-foreground">
                  Focus inset is composited into the atlas corner
                  {log.focusInset.imageRect
                    ? ` (${Math.round(log.focusInset.imageRect.w)}×${Math.round(log.focusInset.imageRect.h)}px overlay).`
                    : "."}{" "}
                  Only this one image is sent to the model.
                </p>
              )}

              {/* Response Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Intent</span>
                  <p className="text-sm font-semibold text-foreground capitalize mt-0.5">
                    {log.response?.intent || "none"}
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Observed Text</span>
                  <p className="text-xs font-mono text-foreground mt-0.5 truncate">
                    {log.response?.observedText || "(none detected)"}
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Commands Generated</span>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {log.response?.commands?.length ?? 0} command(s)
                  </p>
                </div>
              </div>

              {log.response?.message && (
                <div className="rounded-lg border p-3.5 bg-muted/30">
                  <span className="text-xs font-semibold text-foreground">Assistant Explanation Message:</span>
                  <p className="text-xs text-foreground/90 mt-1 leading-relaxed whitespace-pre-wrap">
                    {log.response.message}
                  </p>
                </div>
              )}

              {log.errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3.5 text-xs text-destructive">
                  <span className="font-semibold">Error Message:</span> {log.errorMessage}
                </div>
              )}
            </TabsContent>

            {/* Tab: System Prompt */}
            <TabsContent value="system" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Complete System Prompt"
                badge="System Message"
                content={log.systemPrompt || "(No system prompt captured)"}
                maxHeight="max-h-[600px]"
              />
            </TabsContent>

            {/* Tab: User Prompt & Scene Context */}
            <TabsContent value="user" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Final User Message Text Sent to LLM"
                badge="Human Message"
                content={log.userPromptText || "(No user prompt text captured)"}
                maxHeight="max-h-[500px]"
              />

              {log.sceneJson && (
                <CodeCard
                  title="Canvas Scene JSON State"
                  badge="Spatial Scene Context"
                  content={
                    (() => {
                      try {
                        return JSON.stringify(JSON.parse(log.sceneJson), null, 2);
                      } catch {
                        return log.sceneJson;
                      }
                    })()
                  }
                  maxHeight="max-h-64"
                />
              )}
            </TabsContent>

            {/* Tab: LLM Response */}
            <TabsContent value="response" className="flex-1 overflow-y-auto p-6 space-y-4">
              {log.response ? (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Generated Canvas Commands ({log.response.commands?.length || 0})
                      </span>
                    </div>

                    {log.response.commands && log.response.commands.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {log.response.commands.map((cmd, idx) => {
                          const c = cmd as Record<string, unknown>;
                          const toolName = String(c.tool || c.name || `command-${idx + 1}`);
                          return (
                            <div key={idx} className="rounded-lg border bg-muted/20 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 text-xs">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    #{idx + 1}
                                  </Badge>
                                  <span className="font-semibold text-primary font-mono">{toolName}</span>
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {typeof c.x === "number" && typeof c.y === "number"
                                    ? `x:${Math.round(c.x)} y:${Math.round(c.y)} w:${Math.round(Number(c.w) || 0)} h:${Math.round(Number(c.h) || 0)}`
                                    : ""}
                                </div>
                              </div>
                              <div className="p-3 overflow-auto max-h-60 text-xs font-mono">
                                <pre className="whitespace-pre-wrap break-words text-[11px] text-foreground/90">
                                  {JSON.stringify(c, null, 2)}
                                </pre>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                        No commands generated by model.
                      </div>
                    )}
                  </div>

                  <CodeCard
                    title="Raw Response Object"
                    content={JSON.stringify(log.response.raw || log.response, null, 2)}
                    maxHeight="max-h-72"
                  />
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No response data available.
                </div>
              )}
            </TabsContent>

            {/* Tab: Full Raw JSON */}
            <TabsContent value="raw" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Full Request & Response Log JSON"
                content={JSON.stringify(log, null, 2)}
                maxHeight="max-h-[600px]"
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
