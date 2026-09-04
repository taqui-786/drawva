"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  RefreshIcon,
  PaintBoardIcon,
  ViewIcon,
  Delete02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { getAdminCanvases, deleteAdminCanvas, type AdminCanvasSummaryDto } from "@/lib/actions/admin";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminCanvasesPage() {
  const [search, setSearch] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: canvases, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "canvases", search],
    queryFn: () => getAdminCanvases(search),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminCanvas(id),
    onSuccess: () => {
      toast.success("Canvas document deleted");
      setDeletingId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "canvases"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete canvas");
    },
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
              Canvas Documents
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              {canvases?.length ?? 0} records
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Browse all saved whiteboard projects. Click any record to inspect and view the live canvas playground.
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
              placeholder="Search canvases by title, creator name, or email…"
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
            <HugeiconsIcon icon={PaintBoardIcon} className="h-4 w-4 text-primary" />
            <span>Persisted Whiteboard Records</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Select any canvas to launch the read-only inspection playground.
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
                Failed to load canvases: {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 text-xs">
                Retry
              </Button>
            </div>
          ) : canvases && canvases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="text-xs text-muted-foreground">
                  <TableHead>Canvas Title</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Ink Tiles</TableHead>
                  <TableHead>Widgets</TableHead>
                  <TableHead>Objects</TableHead>
                  <TableHead>Last Saved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {canvases.map((c: AdminCanvasSummaryDto) => (
                  <TableRow
                    key={c.id}
                    className="hover:bg-muted/40 transition-colors group cursor-pointer"
                  >
                    <TableCell className="font-medium text-xs">
                      <Link
                        href={`/admin/canva/${c.id}`}
                        className="flex items-center gap-2 group-hover:text-primary transition-colors"
                      >
                        <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <HugeiconsIcon icon={PaintBoardIcon} className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium block truncate max-w-[200px]">{c.title}</span>
                          <span className="text-[10px] text-muted-foreground font-mono truncate block">
                            {c.id}
                          </span>
                        </div>
                      </Link>
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        {c.userImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.userImage}
                            alt={c.userName}
                            className="h-6 w-6 rounded-full border border-border object-cover"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {c.userName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block truncate max-w-[140px] text-foreground font-medium">
                            {c.userName}
                          </span>
                          <span className="block truncate max-w-[140px] text-[10px] text-muted-foreground font-mono">
                            {c.userEmail}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {c.tilesCount} tiles
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {c.widgetsCount} widgets
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {c.objectsCount} objects
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(c.savedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="xs"
                          render={<Link href={`/admin/canva/${c.id}`} />}
                          className="gap-1 text-xs"
                        >
                          <HugeiconsIcon icon={ViewIcon} className="h-3.5 w-3.5" />
                          <span>View Canva</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(c.id);
                          }}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Delete canvas"
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-xs text-muted-foreground">
              No canvas records found matching &quot;{search}&quot;.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete Canvas Record</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete this canvas? This will permanently erase the whiteboard data from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingId(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="text-xs cursor-pointer"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Canvas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
