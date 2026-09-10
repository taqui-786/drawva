"use client";

import { useState } from "react";
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

interface SaveCanvasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string) => Promise<void>;
  defaultTitle?: string;
}

export function SaveCanvasDialog({
  open,
  onOpenChange,
  onSave,
  defaultTitle = "Untitled Canvas",
}: SaveCanvasDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const finalTitle = title.trim() || "Untitled Canvas";
    try {
      setSaving(true);
      await onSave(finalTitle);
      onOpenChange(false);
    } catch (err) {
      console.error("SaveCanvasDialog error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HugeiconsIcon icon={CloudCheckIcon} className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Save Canvas to Cloud</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Give your canvas a title to save it to your account and enable autosync.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-1">
            <Label htmlFor="canvas-title" className="text-xs font-medium">
              Canvas Title
            </Label>
            <Input
              id="canvas-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Diagram, Sprint Retro..."
              autoFocus
              className="h-9 text-sm"
              disabled={saving}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="gap-1.5"
            >
              {saving && <HugeiconsIcon icon={Loading02Icon} className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving..." : "Save Canvas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
