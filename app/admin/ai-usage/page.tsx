"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  RefreshIcon,
  SparklesIcon,
  CpuIcon,
  Clock01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { getAdminAiUsage, type AdminAiUsageDto } from "@/lib/actions/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminAiUsagePage() {
  const [search, setSearch] = React.useState("");
  const [selectedRecord, setSelectedRecord] = React.useState<AdminAiUsageDto | null>(null);

  const { data: records, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "ai-usage", search],
    queryFn: () => getAdminAiUsage(search),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
              AI Usage &amp; Telemetry
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              {records?.length ?? 0} events
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Audit multimodal turns, inspect canvas snapshots sent to perception models, and read raw AI agent responses.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="border-border/70 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            />
            <Input
              type="search"
              placeholder="Search prompt, model, provider, or creator email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch("")}
              className="text-xs h-9 shrink-0 text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Records Table Card */}
      <Card className="border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HugeiconsIcon icon={SparklesIcon} className="h-4 w-4 text-primary" />
            <span>AI Interaction Log</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Click any row to open the full prompt, snapshot viewer, and AI response details.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <Skeleton key={n} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive font-medium">
                Failed to load AI usage logs: {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 text-xs">
                Retry
              </Button>
            </div>
          ) : records && records.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="text-xs text-muted-foreground">
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Model / Provider</TableHead>
                  <TableHead>User Prompt</TableHead>
                  <TableHead>Snapshot</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r: AdminAiUsageDto) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelectedRecord(r)}
                    className="hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(r.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs">
                      <span className="font-medium block truncate max-w-[120px]">{r.userName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono block truncate max-w-[140px]">
                        {r.userEmail}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 max-w-[140px] truncate">
                          {r.modelId}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono uppercase">
                          ({r.providerType})
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs max-w-[240px] truncate text-foreground/90">
                      {r.userPrompt || <span className="text-muted-foreground italic">(Refinement / empty prompt)</span>}
                    </TableCell>

                    <TableCell className="text-xs">
                      {r.snapshotUrl ? (
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30 px-1.5 py-0">
                          Captured
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{r.totalTokens.toLocaleString()}</span>
                        <span className="text-[9px] text-muted-foreground/70">
                          {r.inputTokens} in · {r.outputTokens} out
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRecord(r);
                        }}
                        className="gap-1 text-xs text-primary hover:text-primary/80"
                      >
                        <HugeiconsIcon icon={ViewIcon} className="h-3.5 w-3.5" />
                        <span>Inspect</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-xs text-muted-foreground">
              No AI usage records found matching &quot;{search}&quot;.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Inspection Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={CpuIcon} className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-semibold">
                AI Interaction Telemetry
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Event ID: <span className="font-mono">{selectedRecord?.id}</span> ·{" "}
              {selectedRecord &&
                new Date(selectedRecord.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-6 pt-2">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg border border-border/60 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Creator
                  </span>
                  <span className="font-medium truncate block">{selectedRecord.userName}</span>
                  <span className="text-[10px] text-muted-foreground font-mono truncate block">
                    {selectedRecord.userEmail}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Model
                  </span>
                  <span className="font-mono font-medium block truncate">
                    {selectedRecord.modelId}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                    {selectedRecord.providerType}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Total Tokens
                  </span>
                  <span className="font-mono font-semibold block text-primary">
                    {selectedRecord.totalTokens.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono block">
                    {selectedRecord.inputTokens} in · {selectedRecord.outputTokens} out
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                    Intent
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono mt-0.5">
                    {selectedRecord.intent || "conductor"}
                  </Badge>
                </div>
              </div>

              {/* Section 1: User Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    User Prompt
                  </h4>
                  {selectedRecord.userPrompt && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        copyToClipboard(selectedRecord.userPrompt || "", "User prompt")
                      }
                      className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Copy Prompt
                    </Button>
                  )}
                </div>
                <div className="p-3.5 bg-muted/30 border border-border/70 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {selectedRecord.userPrompt || (
                    <span className="text-muted-foreground italic font-sans">
                      (No text prompt — triggered by canvas area refinement or automatic perception)
                    </span>
                  )}
                </div>
              </div>

              {/* Section 2: Canvas Snapshot Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Whiteboard Canvas Snapshot
                  </h4>
                  {selectedRecord.snapshotUrl && (
                    <a
                      href={selectedRecord.snapshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline"
                    >
                      Open Full Image ↗
                    </a>
                  )}
                </div>
                {selectedRecord.snapshotUrl ? (
                  <div className="rounded-lg border border-border/80 overflow-hidden bg-black/90 p-2 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedRecord.snapshotUrl}
                      alt="Canvas Snapshot"
                      className="max-h-72 w-auto object-contain rounded shadow-md"
                    />
                  </div>
                ) : (
                  <div className="p-6 bg-muted/20 border border-dashed border-border/60 rounded-lg text-center text-xs text-muted-foreground">
                    No image snapshot was captured or stored for this request.
                  </div>
                )}
              </div>

              {/* Section 3: Actual AI Response */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actual AI Response / Actions
                  </h4>
                  {selectedRecord.response && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        copyToClipboard(selectedRecord.response || "", "AI response")
                      }
                      className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Copy Response
                    </Button>
                  )}
                </div>
                <div className="p-3.5 bg-card border border-border/80 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed text-foreground/90">
                  {selectedRecord.response || (
                    <span className="text-muted-foreground italic font-sans">
                      No textual completion response logged for this turn (tool actions or direct canvas streaming).
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
