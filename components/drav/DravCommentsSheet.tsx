"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DravCommentData } from "@/lib/dravs/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Comment01Icon,
  SentIcon,
  Delete02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";

interface DravCommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dravId: string;
}

export function DravCommentsSheet({
  open,
  onOpenChange,
  dravId,
}: DravCommentsSheetProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = React.useState("");

  // TanStack Query for comments
  const { data, isLoading } = useQuery<{ comments: DravCommentData[] }>({
    queryKey: ["drav-comments", dravId],
    queryFn: async () => {
      const res = await fetch(`/api/dravs/${dravId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
    enabled: open, // Only fetch when sheet is open
    staleTime: 30 * 1000,
  });

  const comments = data?.comments || [];

  // TanStack Query mutation for posting comment
  const postMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      const res = await fetch(`/api/dravs/${dravId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to post comment");
      }
      return res.json();
    },
    onMutate: async (bodyText) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["drav-comments", dravId] });
      const previous = queryClient.getQueryData<{ comments: DravCommentData[] }>([
        "drav-comments",
        dravId,
      ]);

      if (previous && session?.user) {
        const optimisticComment: DravCommentData = {
          id: `temp-${Date.now()}`,
          dravId,
          userId: session.user.id,
          body: bodyText,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: {
            id: session.user.id,
            name: session.user.name || "You",
            image: session.user.image,
          },
          isOwner: true,
        };

        queryClient.setQueryData(["drav-comments", dravId], {
          comments: [...previous.comments, optimisticComment],
        });
      }

      setNewComment("");
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["drav-comments", dravId], context.previous);
      }
      toast.error(err.message || "Failed to post comment");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drav-comments", dravId] });
      queryClient.invalidateQueries({ queryKey: ["drav", dravId] });
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
    },
  });

  // Delete comment mutation
  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/dravs/${dravId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ["drav-comments", dravId] });
      queryClient.invalidateQueries({ queryKey: ["drav", dravId] });
      queryClient.invalidateQueries({ queryKey: ["dravs"] });
    },
    onError: () => {
      toast.error("Failed to delete comment");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user) {
      toast.info("Please sign in to leave a comment.");
      return;
    }
    if (!newComment.trim()) return;
    postMutation.mutate(newComment.trim());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 h-full">
        <SheetHeader className="p-4 border-b border-border/70">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
            <HugeiconsIcon icon={Comment01Icon} className="size-4" />
            <span>Discussion</span>
          </div>
          <SheetTitle className="text-base font-bold">Comments</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Thoughts, feedback, and questions on this Drav.
          </SheetDescription>
        </SheetHeader>

        {/* Comment Thread List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-primary" />
              <span className="text-xs">Loading comments…</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-16 text-center space-y-2 max-w-xs mx-auto">
              <div className="size-10 rounded-full bg-muted/40 mx-auto flex items-center justify-center text-muted-foreground/60">
                <HugeiconsIcon icon={Comment01Icon} className="size-5" />
              </div>
              <h4 className="text-xs font-semibold text-foreground">No comments yet</h4>
              <p className="text-[11px] text-muted-foreground">
                Be the first to share your thoughts or ask questions about this canvas!
              </p>
            </div>
          ) : (
            comments.map((c) => {
              const initials = c.author.name
                ? c.author.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "U";

              const timeStr = new Date(c.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={c.id} className="group flex gap-3 text-xs">
                  <Avatar className="size-7 shrink-0 mt-0.5">
                    {c.author.image && (
                      <AvatarImage src={c.author.image} alt={c.author.name} />
                    )}
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 space-y-1 bg-muted/30 rounded-xl p-3 border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{c.author.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                        {c.isOwner && (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(c.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity cursor-pointer p-0.5"
                            title="Delete comment"
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Comment Input Footer */}
        <div className="p-4 border-t border-border/70 bg-card/40">
          {session?.user ? (
            <form onSubmit={handleSubmit} className="space-y-2">
              <Textarea
                placeholder="Write a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                maxLength={1000}
                rows={2}
                className="text-xs resize-none bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Press Enter to post</span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={postMutation.isPending || !newComment.trim()}
                  className="h-7 px-3 text-xs gap-1.5"
                >
                  {postMutation.isPending ? (
                    <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={SentIcon} className="size-3" />
                  )}
                  <span>Comment</span>
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-2 text-center text-xs space-y-2">
              <p className="text-muted-foreground text-[11px]">Sign in to participate in the discussion.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  toast.info("Please sign in from the header to join the discussion.");
                }}
              >
                Sign In to Comment
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
