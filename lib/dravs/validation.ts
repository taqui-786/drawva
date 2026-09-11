import { z } from "zod";
import { DRAV_CATEGORY_KEYS } from "./types";

const categoryEnum = z.enum(DRAV_CATEGORY_KEYS);
const visibilityEnum = z.enum(["public", "unlisted", "private"]);

export const publishDravSchema = z.object({
  canvasId: z.string().min(1, "Canvas ID is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(100, "Title too long"),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
  category: categoryEnum.default("other"),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  visibility: visibilityEnum.default("public"),
  snapshot: z.string().min(2, "Canvas snapshot data is required"),
  thumbnailBase64: z.string().optional(),
});

export const updateDravSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(100).optional(),
  description: z.string().max(500).optional(),
  category: categoryEnum.optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  visibility: visibilityEnum.optional(),
  status: z.enum(["published", "draft", "unpublished"]).optional(),
});


export const createCommentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(1000, "Comment cannot exceed 1000 characters"),
});

export const reportDravSchema = z.object({
  reason: z.string().min(5, "Please provide a reason with at least 5 characters").max(500),
});
