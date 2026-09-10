"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Logout01Icon,
  MoreVerticalIcon,
  Settings01Icon,
  Share01Icon,
  AiChipIcon,
  CanvasIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, signOut } from "@/lib/auth-client";
import { fetchCanvasList, deleteCloudCanvas, type CanvasListItem } from "@/lib/canvas/cloudSync";
import { deleteAutosave } from "@/lib/canvas/persistence";
import { DeleteCanvasDialog } from "./DeleteCanvasDialog";
import { cn } from "@/lib/utils";

interface CanvasSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCanvasId: string | null;
  onOpenSettings: () => void;
  onOpenModelSelect: () => void;
  activeModelName?: string;
}

function formatRelativeTime(ts: number): string {
  if (!ts) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function CanvasSidebar({
  open,
  onOpenChange,
  currentCanvasId,
  onOpenSettings,
  onOpenModelSelect,
  activeModelName = "Default Model",
}: CanvasSidebarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [canvases, setCanvases] = useState<CanvasListItem[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CanvasListItem | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      try {
        const list = await fetchCanvasList();
        if (active) setCanvases(list);
      } catch (err) {
        console.error("Failed to load canvas list:", err);
        if (active) setCanvases([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleNewCanvas = () => {
    onOpenChange(false);
    router.push("/canvas");
  };

  const handleSelectCanvas = (id: string) => {
    onOpenChange(false);
    router.push(`/canvas/${id}`);
  };

  const handleShare = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/canvas/${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success("Canvas link copied to clipboard");
    } else {
      toast.info(`Share link: ${url}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      const res = await deleteCloudCanvas(id);
      if (res.success) {
        toast.success("Canvas deleted");
        await deleteAutosave(id);
        setCanvases((prev) => (prev ? prev.filter((c) => c.id !== id) : null));
        if (currentCanvasId === id) {
          router.push("/canvas");
        }
      } else {
        toast.error("Failed to delete canvas");
      }
    } catch (err) {
      console.error("Error deleting canvas:", err);
      toast.error("An error occurred while deleting canvas");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full w-84 max-w-[85vw] flex-col border-l border-border bg-background/95 backdrop-blur-md shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CanvasIcon} className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Canvases</h2>
            {canvases && canvases.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {canvases.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={handleNewCanvas}
              className="gap-1 text-xs"
            >
              <HugeiconsIcon icon={Add01Icon} className="h-3.5 w-3.5" />
              <span>New</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Canvases List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {canvases === null ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : canvases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 mb-2">
                <HugeiconsIcon icon={CanvasIcon} className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-xs font-medium text-foreground/80">No saved canvases yet</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-[180px]">
                Click &quot;Save&quot; on the canvas header to save your work to the cloud.
              </p>
            </div>
          ) : (
            canvases.map((c) => {
              const isActive = currentCanvasId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectCanvas(c.id)}
                  className={cn(
                    "group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer border",
                    isActive
                      ? "bg-primary/10 border-primary/25 text-foreground font-medium"
                      : "border-transparent hover:bg-muted/70 text-foreground/85"
                  )}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <p className="truncate font-medium">{c.title || "Untitled Canvas"}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatRelativeTime(c.updatedAt || c.savedAt)}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <HugeiconsIcon icon={MoreVerticalIcon} className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-28 text-xs">
                      <DropdownMenuItem
                        onClick={(e) => handleShare(c.id, e as unknown as React.MouseEvent)}
                        className="gap-2 cursor-pointer text-xs"
                      >
                        <HugeiconsIcon icon={Share01Icon} className="h-3.5 w-3.5" />
                        <span>Share</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(c);
                        }}
                        className="gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Area: Model, Settings & Profile */}
        <div className="border-t border-border/80 p-3 space-y-2 bg-muted/20">
          {/* Active Model Button */}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenModelSelect();
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <HugeiconsIcon icon={AiChipIcon} className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{activeModelName}</span>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-mono">Model</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onOpenSettings();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={Settings01Icon} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>Settings</span>
          </button>

          {/* User Profile / Sign Out */}
          {session?.user && (
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                {session.user.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="h-7 w-7 rounded-full object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                    {(session.user.name || session.user.email || "U")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {session.user.name || "User"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {session.user.email}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await signOut();
                    router.push("/auth/sign-in");
                  } catch (err) {
                    console.error("Sign out error:", err);
                  }
                }}
                className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                title="Sign out"
              >
                <HugeiconsIcon icon={Logout01Icon} className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Delete Confirmation Dialog */}
      <DeleteCanvasDialog
        open={!!deleteTarget}
        onOpenChange={(openState) => {
          if (!openState) setDeleteTarget(null);
        }}
        canvasTitle={deleteTarget?.title || "Canvas"}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
