"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserMultiple02Icon,
  PaintBoardIcon,
  SparklesIcon,
  CpuIcon,
  ArrowRight01Icon,
  RefreshIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { getAdminOverviewStats } from "@/lib/actions/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function AdminOverviewPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => getAdminOverviewStats(),
  });

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            Admin Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System pulse, real-time user metrics, and whiteboard intelligence telemetry.
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

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <p className="text-destructive text-sm font-medium">
              Failed to load admin statistics. Please check your connection or permissions.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-3 text-xs"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <Card className="border-border/70 shadow-xs hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Users
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <HugeiconsIcon icon={UserMultiple02Icon} className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 my-1" />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {data?.totalUsers.toLocaleString() ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Registered Drawva creators
            </p>
          </CardContent>
        </Card>

        {/* Total Canvases */}
        <Card className="border-border/70 shadow-xs hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Canvases
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-chart-1/10 flex items-center justify-center text-chart-1">
              <HugeiconsIcon icon={PaintBoardIcon} className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 my-1" />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {data?.totalCanvases.toLocaleString() ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Cloud-persisted whiteboards
            </p>
          </CardContent>
        </Card>

        {/* AI Requests */}
        <Card className="border-border/70 shadow-xs hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AI Invocations
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-chart-2/10 flex items-center justify-center text-chart-2">
              <HugeiconsIcon icon={SparklesIcon} className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24 my-1" />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {data?.totalAiRequests.toLocaleString() ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Conductor turns & refines
            </p>
          </CardContent>
        </Card>

        {/* Total Tokens */}
        <Card className="border-border/70 shadow-xs hover:border-border transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Tokens
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-chart-3/10 flex items-center justify-center text-chart-3">
              <HugeiconsIcon icon={CpuIcon} className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28 my-1" />
            ) : (
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {data?.totalAiTokens.toLocaleString() ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {data ? `${(data.totalPromptTokens / 1000).toFixed(1)}k in · ${(data.totalCompletionTokens / 1000).toFixed(1)}k out` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Section: Recent Canvases & Recent AI Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Canvases */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Recent Canvases</CardTitle>
              <CardDescription className="text-xs">
                Latest active canvas documents across creators
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="xs"
              render={<Link href="/admin/canva" />}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>View all</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : data?.recentCanvases && data.recentCanvases.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs text-muted-foreground">
                    <TableHead>Title</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentCanvases.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium text-xs max-w-[140px] truncate">
                        {c.title}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {c.userName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {c.tilesCount + c.widgetsCount + c.objectsCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          render={<Link href={`/admin/canva/${c.id}`} />}
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
              <div className="p-8 text-center text-xs text-muted-foreground">
                No canvases saved yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent AI Usage */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Latest AI Activity</CardTitle>
              <CardDescription className="text-xs">
                Real-time agent tool runs and prompt requests
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="xs"
              render={<Link href="/admin/ai-usage" />}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>View all</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : data?.recentAiRequests && data.recentAiRequests.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs text-muted-foreground">
                    <TableHead>Model</TableHead>
                    <TableHead>Prompt Snippet</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentAiRequests.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs font-mono">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 max-w-[100px] truncate">
                          {a.modelId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {a.userPrompt || "(visual refinement)"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">
                        {a.totalTokens.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No AI usage recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
