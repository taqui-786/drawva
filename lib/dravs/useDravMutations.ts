"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DravCardData, DravDetailData, DravCommentData } from "./types";
import { toast } from "sonner";

export const dravQueryKeys = {
  all: ["dravs"] as const,
  detail: (id: string) => ["drav", id] as const,
  comments: (dravId: string) => ["drav-comments", dravId] as const,
};

interface ListResponse {
  dravs: DravCardData[];
  total: number;
  hasMore: boolean;
}

export function useLikeMutation(dravId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dravs/${dravId}/like`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update like");
      }
      return res.json() as Promise<{ liked: boolean; likesCount: number }>;
    },
    onMutate: async () => {
      // 1. Cancel ongoing refetches
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.detail(dravId) });
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.all });

      // 2. Snapshot previous values
      const previousDetail = queryClient.getQueryData<DravDetailData>(
        dravQueryKeys.detail(dravId)
      );
      const previousLists = queryClient.getQueriesData<ListResponse>({
        queryKey: dravQueryKeys.all,
      });

      // 3. Optimistically update detail query
      if (previousDetail) {
        const nextLiked = !previousDetail.likedByMe;
        const nextCount = nextLiked
          ? previousDetail.likesCount + 1
          : Math.max(0, previousDetail.likesCount - 1);

        queryClient.setQueryData<DravDetailData>(dravQueryKeys.detail(dravId), {
          ...previousDetail,
          likedByMe: nextLiked,
          likesCount: nextCount,
        });
      }

      // 4. Optimistically update all matching list queries in community
      queryClient.setQueriesData<ListResponse>(
        { queryKey: dravQueryKeys.all },
        (old) => {
          if (!old?.dravs) return old;
          return {
            ...old,
            dravs: old.dravs.map((item) => {
              if (item.id !== dravId) return item;
              const nextLiked = !item.likedByMe;
              return {
                ...item,
                likedByMe: nextLiked,
                likesCount: nextLiked
                  ? item.likesCount + 1
                  : Math.max(0, item.likesCount - 1),
              };
            }),
          };
        }
      );

      return { previousDetail, previousLists };
    },
    onError: (_err, _vars, context) => {
      // Roll back
      if (context?.previousDetail) {
        queryClient.setQueryData(
          dravQueryKeys.detail(dravId),
          context.previousDetail
        );
      }
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to update like");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.detail(dravId) });
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.all });
    },
  });
}

export function useCommentMutation(dravId: string, currentUser?: { id: string; name?: string | null; image?: string | null }) {
  const queryClient = useQueryClient();

  return useMutation({
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
      return res.json() as Promise<DravCommentData>;
    },
    onMutate: async (bodyText) => {
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.comments(dravId) });
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.detail(dravId) });
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.all });

      const prevComments = queryClient.getQueryData<{ comments: DravCommentData[] }>(
        dravQueryKeys.comments(dravId)
      );
      const prevDetail = queryClient.getQueryData<DravDetailData>(
        dravQueryKeys.detail(dravId)
      );
      const prevLists = queryClient.getQueriesData<ListResponse>({
        queryKey: dravQueryKeys.all,
      });

      // Optimistic comment item
      if (currentUser) {
        const optimisticComment: DravCommentData = {
          id: `temp-${Date.now()}`,
          dravId,
          userId: currentUser.id,
          body: bodyText,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: {
            id: currentUser.id,
            name: currentUser.name || "You",
            image: currentUser.image,
          },
          isOwner: true,
        };

        queryClient.setQueryData<{ comments: DravCommentData[] }>(
          dravQueryKeys.comments(dravId),
          (old) => ({
            comments: [...(old?.comments || []), optimisticComment],
          })
        );
      }

      // Optimistically increment comments count in detail
      if (prevDetail) {
        queryClient.setQueryData<DravDetailData>(dravQueryKeys.detail(dravId), {
          ...prevDetail,
          commentsCount: prevDetail.commentsCount + 1,
        });
      }

      // Optimistically increment comments count in community lists
      queryClient.setQueriesData<ListResponse>(
        { queryKey: dravQueryKeys.all },
        (old) => {
          if (!old?.dravs) return old;
          return {
            ...old,
            dravs: old.dravs.map((item) =>
              item.id === dravId
                ? { ...item, commentsCount: item.commentsCount + 1 }
                : item
            ),
          };
        }
      );

      return { prevComments, prevDetail, prevLists };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prevComments) {
        queryClient.setQueryData(dravQueryKeys.comments(dravId), context.prevComments);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(dravQueryKeys.detail(dravId), context.prevDetail);
      }
      if (context?.prevLists) {
        for (const [key, data] of context.prevLists) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(err.message || "Failed to post comment");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.comments(dravId) });
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.detail(dravId) });
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.all });
    },
  });
}

export function useDeleteCommentMutation(dravId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`/api/dravs/${dravId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete comment");
      }
      return res.json();
    },
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.comments(dravId) });
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.detail(dravId) });
      await queryClient.cancelQueries({ queryKey: dravQueryKeys.all });

      const prevComments = queryClient.getQueryData<{ comments: DravCommentData[] }>(
        dravQueryKeys.comments(dravId)
      );
      const prevDetail = queryClient.getQueryData<DravDetailData>(
        dravQueryKeys.detail(dravId)
      );

      if (prevComments) {
        queryClient.setQueryData<{ comments: DravCommentData[] }>(
          dravQueryKeys.comments(dravId),
          {
            comments: prevComments.comments.filter((c) => c.id !== commentId),
          }
        );
      }

      if (prevDetail) {
        queryClient.setQueryData<DravDetailData>(dravQueryKeys.detail(dravId), {
          ...prevDetail,
          commentsCount: Math.max(0, prevDetail.commentsCount - 1),
        });
      }

      queryClient.setQueriesData<ListResponse>(
        { queryKey: dravQueryKeys.all },
        (old) => {
          if (!old?.dravs) return old;
          return {
            ...old,
            dravs: old.dravs.map((item) =>
              item.id === dravId
                ? { ...item, commentsCount: Math.max(0, item.commentsCount - 1) }
                : item
            ),
          };
        }
      );

      return { prevComments, prevDetail };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevComments) {
        queryClient.setQueryData(dravQueryKeys.comments(dravId), context.prevComments);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(dravQueryKeys.detail(dravId), context.prevDetail);
      }
      toast.error("Failed to delete comment");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.comments(dravId) });
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.detail(dravId) });
      queryClient.invalidateQueries({ queryKey: dravQueryKeys.all });
    },
  });
}
