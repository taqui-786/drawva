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
  Share07Icon,
  Cancel01Icon,
  Loading03Icon,
  Loading02Icon,
  CheckmarkCircle01Icon,
  Globe02Icon,
  Link01Icon,
  CloudCheckIcon,
  Login01Icon,
} from "@hugeicons/core-free-icons";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

interface PublishDravDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string | null;
  defaultTitle?: string;
  onSaveCanvas?: (title: string) => Promise<string | null>;
  getCanvasSnapshot: () => Promise<unknown> | unknown;
  getCanvasThumbnail: () => Promise<string>;
}

export function PublishDravDialog({
  open,
  onOpenChange,
  canvasId,
  defaultTitle = "Untitled Drav",
  onSaveCanvas,
  getCanvasSnapshot,
  getCanvasThumbnail,
}: PublishDravDialogProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [localCanvasId, setLocalCanvasId] = React.useState<string | null>(null);
  const [customSaveTitle, setCustomSaveTitle] = React.useState<string | null>(null);
  const [customTitle, setCustomTitle] = React.useState<string | null>(null);
  const [isSavingCanvas, setIsSavingCanvas] = React.useState(false);

  const effectiveCanvasId = canvasId || localCanvasId;
  const title = customTitle ?? defaultTitle;
  const saveTitle = customSaveTitle ?? defaultTitle;

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
      setIsSavingCanvas(false);
      setLocalCanvasId(null);
      setCustomTitle(null);
      setCustomSaveTitle(null);
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

  const handleSaveFirst = async () => {
    if (!onSaveCanvas) return;
    if (!session?.user) {
      toast.error("Please sign in to save your canvas.");
      router.push("/signin");
      return;
    }
    const finalTitle = saveTitle.trim() || "Untitled Drav";
    try {
      setIsSavingCanvas(true);
      const newId = await onSaveCanvas(finalTitle);
      if (newId) {
        setLocalCanvasId(newId);
        setCustomTitle(finalTitle);
        toast.success("Canvas saved to cloud! Ready to publish.");
      }
    } catch (err) {
      console.error("Failed to save canvas before publishing:", err);
    } finally {
      setIsSavingCanvas(false);
    }
  };

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
      if (!effectiveCanvasId) {
        throw new Error("Please save your canvas before publishing.");
      }
      if (!title.trim()) {
        throw new Error("Please enter a title for your Drav.");
      }

      const snapshot = await getCanvasSnapshot();
      const snapshotStr = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);

      const res = await fetch("/api/dravs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: effectiveCanvasId,
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
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to publish Drav");
    },
  });

  const categories = DRAV_CATEGORIES.filter((c) => c.id !== "all");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-1.5 text-primary font-semibold text-[11px] tracking-wider uppercase">
            <HugeiconsIcon icon={Share07Icon} className="size-3.5" />
            <span>Community Drav</span>
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight">
            {publishedDravId
              ? "Drav Published!"
              : !effectiveCanvasId
              ? "Save your Drav before sharing"
              : "Publish your Drav to Community"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {publishedDravId
              ? "Your interactive whiteboard is live in the community."
              : !effectiveCanvasId
              ? "Whiteboards must be saved to your cloud workspace first so others can view and remix."
              : "Share your interactive canvas, workflows, and diagrams with the world."}
          </DialogDescription>
        </DialogHeader>

        {publishedDravId ? (
          /* Success Screen */
          <div className="py-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="size-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Your Drav is live in the community!</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Anyone with access can explore, like, comment, and remix your creation.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/drav/${publishedDravId}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Drav link copied to clipboard!");
                }}
                className="gap-1.5 text-xs h-8"
              >
                <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
                <span>Copy Link</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  window.open(`/drav/${publishedDravId}`, "_blank");
                }}
                className="gap-1.5 text-xs h-8"
              >
                <HugeiconsIcon icon={Globe02Icon} className="size-3.5" />
                <span>Open Drav</span>
              </Button>
            </div>
          </div>
        ) : !effectiveCanvasId ? (
          /* Step 1: Save Required Screen */
          <div className="space-y-3 py-1">
            {/* Live Thumbnail Preview */}
            <div className="relative aspect-[16/9] max-h-36 w-full overflow-hidden rounded-lg border border-border/80 bg-muted/20 flex items-center justify-center">
              {isGeneratingThumb ? (
                <div className="flex flex-col items-center gap-1.5 text-[11px] text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin text-primary" />
                  <span>Preparing canvas preview…</span>
                </div>
              ) : thumbnailPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailPreview}
                  alt="Canvas preview"
                  className="size-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-muted-foreground">Canvas preview</span>
              )}
            </div>

            {!session?.user ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  You need a Drawva account to save canvases and publish to the community.
                </p>
                <Button
                  size="sm"
                  onClick={() => router.push("/signin")}
                  className="gap-1.5 text-xs h-8 w-full"
                >
                  <HugeiconsIcon icon={Login01Icon} className="size-3.5" />
                  <span>Sign In to Continue</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="save-drav-title" className="text-xs font-medium">
                    Canvas Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="save-drav-title"
                    placeholder="e.g. Interactive Geometry with Angle Calculations"
                    value={saveTitle}
                    onChange={(e) => setCustomSaveTitle(e.target.value)}
                    maxLength={100}
                    className="h-8 text-xs"
                    disabled={isSavingCanvas}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveFirst();
                      }
                    }}
                  />
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                  <HugeiconsIcon icon={CloudCheckIcon} className="size-4 shrink-0 text-primary" />
                  <span>Saving creates a cloud record with an ID for community sharing.</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Step 2: Publish Form (Compact & Space-Optimized) */
          <div className="space-y-2.5 py-1">
            {/* Live Thumbnail Preview */}
            <div className="relative aspect-[16/9] max-h-32 sm:max-h-36 w-full overflow-hidden rounded-lg border border-border/80 bg-muted/20 flex items-center justify-center">
              {isGeneratingThumb ? (
                <div className="flex flex-col items-center gap-1.5 text-[11px] text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin text-primary" />
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
                <span className="text-[11px] text-muted-foreground">No preview available</span>
              )}
            </div>

            {/* Title Input */}
            <div className="space-y-1">
              <Label htmlFor="drav-title" className="text-[11px] font-medium">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="drav-title"
                placeholder="E.g. Full-Stack Agent Architecture & Flow"
                value={title}
                onChange={(e) => setCustomTitle(e.target.value)}
                maxLength={100}
                className="h-8 text-xs"
              />
            </div>

            {/* Category & Visibility row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Category</Label>
                <Select
                  value={category}
                  onValueChange={(val) => {
                    if (val) setCategory(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
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

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Visibility</Label>
                <Select
                  value={visibility}
                  onValueChange={(val) => {
                    if (val) setVisibility(val as DravVisibility);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public" className="text-xs">
                      Public (Community)
                    </SelectItem>
                    <SelectItem value="unlisted" className="text-xs">
                      Unlisted (Direct Link)
                    </SelectItem>
                    <SelectItem value="private" className="text-xs">
                      Private (Only you)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description Input */}
            <div className="space-y-1">
              <Label htmlFor="drav-desc" className="text-[11px] font-medium">
                Description (optional)
              </Label>
              <Textarea
                id="drav-desc"
                placeholder="Briefly explain what's on this whiteboard canvas..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                className="text-xs py-1.5 resize-none min-h-[48px]"
              />
            </div>

            {/* Tags Input */}
            <div className="space-y-1">
              <Label htmlFor="drav-tags" className="text-[11px] font-medium">
                Tags
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="drav-tags"
                  placeholder="e.g. math, geometry, interactive"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDownTag}
                  className="h-7 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="h-7 text-xs px-2.5 shrink-0"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="text-[10px] font-mono py-0 px-1.5 flex items-center gap-1 cursor-pointer hover:bg-destructive/20"
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

        <DialogFooter className="gap-2 sm:gap-0 mt-1 pt-2 border-t border-border/50">
          {publishedDravId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs w-full sm:w-auto h-8"
            >
              Close
            </Button>
          ) : !effectiveCanvasId ? (
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSavingCanvas}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              {session?.user && (
                <Button
                  size="sm"
                  onClick={handleSaveFirst}
                  disabled={isSavingCanvas || !saveTitle.trim()}
                  className="gap-1.5 text-xs h-8 font-medium"
                >
                  {isSavingCanvas ? (
                    <>
                      <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                      <span>Saving Canvas…</span>
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={CloudCheckIcon} className="size-3.5" />
                      <span>Save Drav & Continue</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={publishMutation.isPending}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || !title.trim()}
                className="gap-1.5 text-xs h-8 font-medium"
              >
                {publishMutation.isPending ? (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
                    <span>Publishing…</span>
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={Share07Icon} className="size-3.5" />
                    <span>Publish Drav</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
