"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DRAV_CATEGORIES, DravVisibility } from "@/lib/dravs/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Share01Icon,
  Cancel01Icon,
  Loading03Icon,
  CheckmarkCircle01Icon,
  Globe02Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";

interface PublishDravDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string | null;
  defaultTitle?: string;
  getCanvasSnapshot: () => Promise<unknown> | unknown;
  getCanvasThumbnail: () => Promise<string>;
}

export function PublishDravDialog({
  open,
  onOpenChange,
  canvasId,
  defaultTitle = "Untitled Drav",
  getCanvasSnapshot,
  getCanvasThumbnail,
}: PublishDravDialogProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<string>("ai");
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [visibility, setVisibility] = React.useState<DravVisibility>("public");
  const [thumbnailPreview, setThumbnailPreview] = React.useState<string>("");
  const [isGeneratingThumb, setIsGeneratingThumb] = React.useState(true);
  const [publishedDravId, setPublishedDravId] = React.useState<string | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setThumbnailPreview("");
      setPublishedDravId(null);
      setIsGeneratingThumb(true);
    }
    onOpenChange(newOpen);
  };

  // Generate preview thumbnail when dialog is open
  React.useEffect(() => {
    if (!open) return;

    let active = true;
    getCanvasThumbnail()
      .then((thumb) => {
        if (active) {
          setThumbnailPreview(thumb);
          setIsGeneratingThumb(false);
        }
      })
      .catch((err) => {
        console.error("Failed to generate preview thumbnail:", err);
        if (active) setIsGeneratingThumb(false);
      });

    return () => {
      active = false;
    };
  }, [open, getCanvasThumbnail]);

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (trimmed && !tags.includes(trimmed) && tags.length < 8) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDownTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  // TanStack Query mutation for publishing Drav
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user) {
        throw new Error("You must be signed in to publish a Drav.");
      }
      if (!title.trim()) {
        throw new Error("Please enter a title for your Drav.");
      }

      const snapshot = await getCanvasSnapshot();
      const snapshotStr = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);

      const targetCanvasId = canvasId || `c_temp_${Date.now().toString(36)}`;

      const res = await fetch("/api/dravs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: targetCanvasId,
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          tags,
          visibility,
          snapshot: snapshotStr,
          thumbnailBase64: thumbnailPreview || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to publish Drav");
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Drav published successfully to Drawva Community!");
      setPublishedDravId(data.id);
      // Invalidate community query cache so discovery tab instantly includes the new Drav
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to publish Drav");
    },
  });

  const categories = DRAV_CATEGORIES.filter((c) => c.id !== "all");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-7">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
            <HugeiconsIcon icon={Share01Icon} className="size-4" />
            <span>Community Drav</span>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Publish your Drav to Community
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Share your interactive whiteboard canvas, workflows, and diagrams with the world.
          </DialogDescription>
        </DialogHeader>

        {publishedDravId ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Your Drav is live!</h3>
              <p className="text-xs text-muted-foreground">
                Anyone with access can view, like, comment, and remix your creation.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/drav/${publishedDravId}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Drav link copied to clipboard!");
                }}
                className="gap-1.5 text-xs"
              >
                <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
                <span>Copy Link</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  window.open(`/drav/${publishedDravId}`, "_blank");
                }}
                className="gap-1.5 text-xs"
              >
                <HugeiconsIcon icon={Globe02Icon} className="size-3.5" />
                <span>Open Drav</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Thumbnail Preview */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/80 bg-muted/20 flex items-center justify-center">
              {isGeneratingThumb ? (
                <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-primary" />
                  <span>Generating canvas preview…</span>
                </div>
              ) : thumbnailPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailPreview}
                  alt="Canvas preview thumbnail"
                  className="size-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No preview available</span>
              )}
            </div>

            {/* Title Input */}
            <div className="space-y-1.5">
              <Label htmlFor="drav-title" className="text-xs font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="drav-title"
                placeholder="E.g. Full-Stack Agent Architecture & Flow"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="h-9 text-sm"
              />
            </div>

            {/* Description Input */}
            <div className="space-y-1.5">
              <Label htmlFor="drav-desc" className="text-xs font-medium">
                Description (optional)
              </Label>
              <Textarea
                id="drav-desc"
                placeholder="Briefly explain what's on this whiteboard canvas..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Category Select */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Category</Label>
                <Select
                  value={category}
                  onValueChange={(val) => {
                    if (val) setCategory(val);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility Select */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Visibility</Label>
                <Select
                  value={visibility}
                  onValueChange={(val) => {
                    if (val) setVisibility(val as DravVisibility);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public" className="text-xs">
                      Public (Visible in Community)
                    </SelectItem>
                    <SelectItem value="unlisted" className="text-xs">
                      Unlisted (Direct URL only)
                    </SelectItem>
                    <SelectItem value="private" className="text-xs">
                      Private (Only you)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags Input */}
            <div className="space-y-1.5">
              <Label htmlFor="drav-tags" className="text-xs font-medium">
                Tags (press Enter to add)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="drav-tags"
                  placeholder="e.g. mermaid, ai, react"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDownTag}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="h-8 text-xs shrink-0"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[11px] font-mono py-0.5 px-2 flex items-center gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => removeTag(t)}
                    >
                      <span>#{t}</span>
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          {publishedDravId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs w-full sm:w-auto"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={publishMutation.isPending}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || !title.trim()}
                className="gap-1.5 text-xs"
              >
                {publishMutation.isPending ? (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
                    <span>Publishing…</span>
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
                    <span>Publish Drav</span>
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
