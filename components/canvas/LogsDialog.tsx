"use client";

import { useState, useMemo } from "react";
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
  Clock01Icon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { AiLogEntry } from "@/lib/ai/types";

export interface LogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs?: AiLogEntry[];
  log?: AiLogEntry | null;
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
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate">{title}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              {badge}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {content.length.toLocaleString()} chars
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-xs gap-1 shrink-0"
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

export function LogsDialog({ open, onOpenChange, logs, log, onClearLogs }: LogsDialogProps) {
  // Normalize logs list
  const allLogs = useMemo(() => {
    if (Array.isArray(logs) && logs.length > 0) return logs;
    if (log) return [log];
    return [];
  }, [logs, log]);

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const currentLog = allLogs[selectedIdx] || allLogs[0] || null;

  const [activeTab, setActiveTab] = useState<"steps" | "overview" | "commands" | "prompts" | "system" | "raw">("steps");
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyAll = () => {
    if (!currentLog) return;
    const fullLogJson = JSON.stringify(currentLog, null, 2);
    void navigator.clipboard.writeText(fullLogJson);
    setCopiedAll(true);
    toast.success("Complete log JSON copied to clipboard");
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const formattedTime = currentLog
    ? new Date(currentLog.timestamp).toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[66rem] max-w-[calc(100%-2rem)] h-[88vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <HugeiconsIcon icon={TerminalIcon} className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">AI Request & Generation Logs</DialogTitle>
                <DialogDescription className="text-xs">
                  Inspect multi-turn agent tool executions, canvas snapshots, prompts, and generated items.
                </DialogDescription>
              </div>
            </div>

            {currentLog && (
              <div className="flex items-center gap-2">
                {onClearLogs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearLogs}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5 mr-1" />
                    Clear History
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAll}
                  className="h-7 text-xs gap-1.5"
                >
                  <HugeiconsIcon icon={copiedAll ? Tick01Icon : Copy01Icon} className="size-3.5" />
                  <span>{copiedAll ? "Copied All" : "Copy Log JSON"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Quick Turn Selector if multiple turns exist */}
          {allLogs.length > 1 && (
            <div className="flex items-center gap-1.5 pt-2.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-1">
                Recent Turns:
              </span>
              {allLogs.map((l, idx) => {
                const timeStr = new Date(l.timestamp).toLocaleTimeString([], {
                  hour12: false,
                  minute: "2-digit",
                  second: "2-digit",
                });
                const isSelected = (selectedIdx === idx) || (selectedIdx >= allLogs.length && idx === 0);
                return (
                  <button
                    key={l.requestId || idx}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors shrink-0 cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted hover:bg-muted/80 text-foreground/80"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        l.status === "success"
                          ? isSelected
                            ? "bg-white"
                            : "bg-emerald-500"
                          : isSelected
                          ? "bg-white"
                          : "bg-destructive"
                      }`}
                    />
                    <span>#{allLogs.length - idx}</span>
                    <span className="opacity-75 text-[10px]">{timeStr}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Metadata Bar for Selected Turn */}
          {currentLog && (
            <div className="flex flex-wrap items-center gap-2 pt-2.5 text-xs">
              <Badge
                variant={currentLog.status === "success" ? "default" : "destructive"}
                className={`text-[11px] font-medium ${
                  currentLog.status === "success" ? "bg-emerald-600 hover:bg-emerald-700" : ""
                }`}
              >
                {currentLog.status === "success" ? "Success" : "Failed"}
              </Badge>

              <Badge variant="outline" className="font-mono text-[11px]">
                {currentLog.model}
              </Badge>

              {currentLog.providerType && (
                <Badge variant="secondary" className="text-[11px] capitalize">
                  {currentLog.providerType}
                </Badge>
              )}

              <span className="text-muted-foreground text-[11px] font-mono flex items-center gap-1">
                <HugeiconsIcon icon={Clock01Icon} className="size-3" />
                {formattedTime}
              </span>

              <span className="text-muted-foreground text-[11px]">
                {currentLog.steps?.length || currentLog.attempts} step(s)
              </span>

              {currentLog.tokenUsage && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>in: {currentLog.tokenUsage.inputTokens.toLocaleString()}</span>
                  <span>out: {currentLog.tokenUsage.outputTokens.toLocaleString()}</span>
                  <span className="font-semibold text-foreground">
                    total: {currentLog.tokenUsage.totalTokens.toLocaleString()}
                  </span>
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Body Content */}
        {!currentLog ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={SparklesIcon} className="size-6" />
            </div>
            <div className="max-w-sm">
              <h3 className="text-sm font-semibold text-foreground">No AI Generation Recorded Yet</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Draw anything on the whiteboard and click &quot;Ask AI&quot; or toggle &quot;Auto AI&quot;.
                Once generation completes, full snapshots, tool call timelines, prompts, and model responses will appear here.
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
                  value="steps"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={WorkflowSquare01Icon} className="size-3.5 mr-1.5" />
                  Steps & Tools
                  {currentLog.steps && currentLog.steps.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                      {currentLog.steps.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={Image01Icon} className="size-3.5 mr-1.5" />
                  Snapshot & Overview
                </TabsTrigger>
                <TabsTrigger
                  value="commands"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={SparklesIcon} className="size-3.5 mr-1.5" />
                  Canvas Commands
                  {currentLog.response?.commands && currentLog.response.commands.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                      {currentLog.response.commands.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="prompts"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={CodeIcon} className="size-3.5 mr-1.5" />
                  User Prompt & Scene
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 mr-1.5" />
                  System Rules
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

            {/* Tab: Steps & Tools Timeline */}
            <TabsContent value="steps" className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentLog.steps && currentLog.steps.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {currentLog.steps.map((step, idx) => {
                    const isError = step.isError === true;
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border overflow-hidden ${
                          isError ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20"
                        }`}
                      >
                        {/* Step Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40 text-xs">
                          <div className="flex items-center gap-2.5">
                            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4">
                              Step #{step.stepNumber || idx + 1}
                            </Badge>
                            {step.tool ? (
                              <span className="font-semibold text-primary font-mono">{step.tool}</span>
                            ) : (
                              <span className="font-semibold text-foreground">Assistant Response</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {step.tool && (
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                  isError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                <HugeiconsIcon
                                  icon={isError ? CancelCircleIcon : CheckmarkCircle02Icon}
                                  className="size-3.5"
                                />
                                <span>{isError ? "Failed" : "Success"}</span>
                              </span>
                            )}
                            {step.summary && (
                              <span className="text-[11px] text-muted-foreground font-mono truncate max-w-xs">
                                {step.summary}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Step Details */}
                        <div className="p-4 space-y-3 text-xs">
                          {step.text && (
                            <div>
                              <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wider block mb-1">
                                Assistant Text
                              </span>
                              <div className="p-2.5 rounded-md bg-background/80 border text-foreground/90 leading-relaxed font-sans whitespace-pre-wrap">
                                {step.text}
                              </div>
                            </div>
                          )}

                          {step.args !== undefined && (
                            <div>
                              <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wider block mb-1">
                                Tool Arguments
                              </span>
                              <pre className="p-2.5 rounded-md bg-background/80 border text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(step.args, null, 2)}
                              </pre>
                            </div>
                          )}

                          {step.result !== undefined && (
                            <div>
                              <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wider block mb-1">
                                Execution Result
                              </span>
                              <pre className="p-2.5 rounded-md bg-background/80 border text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(step.result, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                  No step details recorded for this turn.
                </div>
              )}
            </TabsContent>

            {/* Tab: Overview & Snapshot */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Snapshot Image Box */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Canvas Snapshot (Multimodal Vision Input)</span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      WebP &le;2048px
                    </Badge>
                  </div>
                  {currentLog.atlasImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openImageInNewTab(currentLog.atlasImage)}
                      className="h-7 text-xs gap-1"
                    >
                      <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                      <span>Open Full Size in New Tab</span>
                    </Button>
                  )}
                </div>

                {currentLog.atlasImage ? (
                  <div
                    onClick={() => openImageInNewTab(currentLog.atlasImage)}
                    title="Click to view full image in new tab"
                    className="group relative cursor-pointer overflow-hidden rounded-lg border bg-neutral-950 p-2 text-center transition-all hover:border-primary/60 hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentLog.atlasImage}
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
                    No snapshot image attached for this turn
                  </div>
                )}
              </div>

              {/* Response Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Status</span>
                  <p className="text-sm font-semibold text-foreground capitalize mt-0.5">
                    {currentLog.status}
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Total Steps</span>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {currentLog.steps?.length || currentLog.attempts} step(s)
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Canvas Commands</span>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {currentLog.response?.commands?.length ?? 0} command(s)
                  </p>
                </div>
              </div>

              {currentLog.response?.message && (
                <div className="rounded-lg border p-3.5 bg-muted/30">
                  <span className="text-xs font-semibold text-foreground">Assistant Response:</span>
                  <p className="text-xs text-foreground/90 mt-1 leading-relaxed whitespace-pre-wrap">
                    {currentLog.response.message}
                  </p>
                </div>
              )}

              {currentLog.errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3.5 text-xs text-destructive">
                  <span className="font-semibold">Error Message:</span> {currentLog.errorMessage}
                </div>
              )}
            </TabsContent>

            {/* Tab: Canvas Commands Inspector */}
            <TabsContent value="commands" className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentLog.response?.commands && currentLog.response.commands.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Applied Canvas Commands ({currentLog.response.commands.length})
                    </span>
                  </div>

                  {currentLog.response.commands.map((cmd, idx) => {
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
                            {typeof c.title === "string" && (
                              <span className="text-foreground/80 font-medium truncate max-w-xs">
                                &quot;{c.title}&quot;
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {typeof c.x === "number" && typeof c.y === "number"
                              ? `x:${Math.round(c.x)} y:${Math.round(c.y)} w:${Math.round(Number(c.w) || 0)} h:${Math.round(Number(c.h) || 0)}`
                              : ""}
                          </div>
                        </div>
                        <div className="p-3 overflow-auto max-h-64 text-xs font-mono">
                          <pre className="whitespace-pre-wrap break-words text-[11px] text-foreground/90">
                            {JSON.stringify(c, null, 2)}
                          </pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                  No canvas commands were generated in this turn.
                </div>
              )}
            </TabsContent>

            {/* Tab: User Prompt & Scene Context */}
            <TabsContent value="prompts" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Final User Message Text Sent to LLM"
                badge="User Context"
                content={currentLog.userPromptText || "(No user prompt text captured)"}
                maxHeight="max-h-[500px]"
              />

              {currentLog.sceneJson && (
                <CodeCard
                  title="Canvas Scene JSON State"
                  badge="Spatial Scene Context"
                  content={
                    (() => {
                      try {
                        return JSON.stringify(JSON.parse(currentLog.sceneJson), null, 2);
                      } catch {
                        return currentLog.sceneJson;
                      }
                    })()
                  }
                  maxHeight="max-h-64"
                />
              )}
            </TabsContent>

            {/* Tab: System Rules */}
            <TabsContent value="system" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Complete System Prompt & Rules"
                badge="System Message"
                content={currentLog.systemPrompt || "(No system prompt captured)"}
                maxHeight="max-h-[600px]"
              />
            </TabsContent>

            {/* Tab: Full Raw JSON */}
            <TabsContent value="raw" className="flex-1 overflow-y-auto p-6 space-y-4">
              <CodeCard
                title="Full Turn Log JSON"
                content={JSON.stringify(currentLog, null, 2)}
                maxHeight="max-h-[600px]"
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
