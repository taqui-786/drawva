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
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Loading02Icon } from "@hugeicons/core-free-icons";

interface DeleteCanvasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasTitle: string;
  onConfirm: () => Promise<void>;
}

export function DeleteCanvasDialog({
  open,
  onOpenChange,
  canvasTitle,
  onConfirm,
}: DeleteCanvasDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    try {
      setDeleting(true);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("DeleteCanvasDialog error:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Delete Canvas</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-foreground/80 py-2">
          Are you sure you want to permanently delete{" "}
          <span className="font-semibold text-foreground">&ldquo;{canvasTitle}&rdquo;</span> from the cloud?
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-1.5"
          >
            {deleting && <HugeiconsIcon icon={Loading02Icon} className="h-3.5 w-3.5 animate-spin" />}
            {deleting ? "Deleting..." : "Delete Canvas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
