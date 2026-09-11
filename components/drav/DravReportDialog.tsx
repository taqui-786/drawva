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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { useMutation } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Flag01Icon, Loading03Icon } from "@hugeicons/core-free-icons";

interface DravReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dravId: string;
}

export function DravReportDialog({
  open,
  onOpenChange,
  dravId,
}: DravReportDialogProps) {
  const { data: session } = useSession();
  const [reason, setReason] = React.useState("");

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user) throw new Error("Please sign in to report content.");
      const res = await fetch(`/api/dravs/${dravId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit report");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Thank you. Your report has been submitted for moderation.");
      onOpenChange(false);
      setReason("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit report");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      toast.error("Please provide a reason with at least 5 characters.");
      return;
    }
    reportMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive font-semibold text-xs tracking-wider uppercase mb-1">
            <HugeiconsIcon icon={Flag01Icon} className="size-4" />
            <span>Moderation</span>
          </div>
          <DialogTitle className="text-base font-bold">Report this Drav</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Let us know why this canvas violates community guidelines, copyright, or contains harmful content.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="report-reason" className="text-xs font-medium">
              Reason for reporting
            </Label>
            <Textarea
              id="report-reason"
              placeholder="Please describe why this content should be reviewed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="text-xs resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={reportMutation.isPending || reason.trim().length < 5}
              className="gap-1.5 text-xs"
            >
              {reportMutation.isPending ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Submit Report</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
