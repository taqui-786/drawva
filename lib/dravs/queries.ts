import { db } from "@/lib/db";
import { drav, dravLike, dravComment, dravReport, user } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, asc, sql, count, inArray, isNull } from "drizzle-orm";
import { computeRankingScore } from "./ranking";
import {
  DravCardData,
  DravDetailData,
  DravCommentData,
  DravSortOption,
  DravVisibility,
  DravStatus,
} from "./types";

export interface ListDravsParams {
  category?: string;
  tag?: string;
  search?: string;
  sort?: DravSortOption;
  page?: number;
  limit?: number;
  currentUserId?: string;
}

export async function listDravs({
  category,
  tag,
  search,
  sort = "trending",
  page = 1,
  limit = 24,
  currentUserId,
}: ListDravsParams): Promise<{ dravs: DravCardData[]; total: number; hasMore: boolean }> {
  const conditions = [
    eq(drav.visibility, "public"),
    eq(drav.status, "published"),
  ];

  if (category && category !== "all") {
    conditions.push(eq(drav.category, category.toLowerCase()));
  }

  if (tag) {
    conditions.push(sql`${tag.toLowerCase()} = ANY(${drav.tags})`);
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(drav.title, term), ilike(drav.description, term))!);
  }

  const whereClause = and(...conditions);

  // Sorting
  let orderByClause;
  switch (sort) {
    case "top":
      orderByClause = [desc(drav.likesCount), desc(drav.publishedAt)];
      break;
    case "new":
      orderByClause = [desc(drav.publishedAt)];
      break;
    case "views":
      orderByClause = [desc(drav.viewsCount), desc(drav.publishedAt)];
      break;
    case "trending":
    default:
      orderByClause = [desc(drav.rankingScore), desc(drav.publishedAt)];
      break;
  }

  const offset = (page - 1) * limit;

  // Execute query with joins
  const items = await db
    .select({
      id: drav.id,
      canvasId: drav.canvasId,
      title: drav.title,
      description: drav.description,
      thumbnailUrl: drav.thumbnailUrl,
      category: drav.category,
      tags: drav.tags,
      visibility: drav.visibility,
      status: drav.status,
      likesCount: drav.likesCount,
      commentsCount: drav.commentsCount,
      viewsCount: drav.viewsCount,
      rankingScore: drav.rankingScore,
      publishedAt: drav.publishedAt,
      createdAt: drav.createdAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(drav)
    .innerJoin(user, eq(drav.userId, user.id))
    .where(whereClause)
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset);

  // Check which dravs are liked by current user if logged in
  let likedIds = new Set<string>();
  if (currentUserId && items.length > 0) {
    const dravIds = items.map((i) => i.id);
    const userLikes = await db
      .select({ dravId: dravLike.dravId })
      .from(dravLike)
      .where(
        and(
          eq(dravLike.userId, currentUserId),
          inArray(dravLike.dravId, dravIds)
        )
      );
    likedIds = new Set(userLikes.map((l) => l.dravId));
  }

  // Count total matching items
  const countResult = await db
    .select({ total: count() })
    .from(drav)
    .where(whereClause);
  const total = Number(countResult[0]?.total || 0);

  const dravs: DravCardData[] = items.map((item) => ({
    id: item.id,
    canvasId: item.canvasId,
    title: item.title,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    category: item.category,
    tags: item.tags || [],
    visibility: item.visibility as DravVisibility,
    status: item.status as DravStatus,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
    viewsCount: item.viewsCount,
    rankingScore: item.rankingScore,
    publishedAt: item.publishedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    author: {
      id: item.authorId,
      name: item.authorName,
      image: item.authorImage,
    },
    likedByMe: likedIds.has(item.id),
  }));

  return {
    dravs,
    total,
    hasMore: offset + items.length < total,
  };
}

export async function getDravById(
  id: string,
  currentUserId?: string
): Promise<DravDetailData | null> {
  const items = await db
    .select({
      id: drav.id,
      canvasId: drav.canvasId,
      userId: drav.userId,
      title: drav.title,
      description: drav.description,
      snapshot: drav.snapshot,
      thumbnailUrl: drav.thumbnailUrl,
      category: drav.category,
      tags: drav.tags,
      visibility: drav.visibility,
      status: drav.status,
      likesCount: drav.likesCount,
      commentsCount: drav.commentsCount,
      viewsCount: drav.viewsCount,
      rankingScore: drav.rankingScore,
      publishedAt: drav.publishedAt,
      createdAt: drav.createdAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(drav)
    .innerJoin(user, eq(drav.userId, user.id))
    .where(eq(drav.id, id))
    .limit(1);

  if (items.length === 0) return null;
  const item = items[0];

  const isOwner = Boolean(currentUserId && currentUserId === item.userId);

  // Visibility checks: private only visible to owner
  if (item.visibility === "private" && !isOwner) {
    return null;
  }
  if (item.status === "unpublished" && !isOwner) {
    return null;
  }

  // Check if liked by me
  let likedByMe = false;
  if (currentUserId) {
    const like = await db
      .select({ id: dravLike.id })
      .from(dravLike)
      .where(and(eq(dravLike.dravId, id), eq(dravLike.userId, currentUserId)))
      .limit(1);
    likedByMe = like.length > 0;
  }

  return {
    id: item.id,
    canvasId: item.canvasId,
    title: item.title,
    description: item.description,
    snapshot: item.snapshot,
    thumbnailUrl: item.thumbnailUrl,
    category: item.category,
    tags: item.tags || [],
    visibility: item.visibility as DravVisibility,
    status: item.status as DravStatus,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
    viewsCount: item.viewsCount,
    rankingScore: item.rankingScore,
    publishedAt: item.publishedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    author: {
      id: item.authorId,
      name: item.authorName,
      image: item.authorImage,
    },
    likedByMe,
    isOwner,
  };
}

export async function createDrav({
  userId,
  canvasId,
  title,
  description,
  category,
  tags,
  visibility,
  snapshot,
  thumbnailUrl,
}: {
  userId: string;
  canvasId: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  visibility: DravVisibility;
  snapshot: string;
  thumbnailUrl?: string;
}): Promise<DravDetailData> {
  const id = `dr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const initialScore = computeRankingScore(0, 0, 0, now);

  await db.insert(drav).values({
    id,
    canvasId,
    userId,
    title,
    description: description || null,
    category: category || "other",
    tags: tags || [],
    visibility: visibility || "public",
    status: "published",
    snapshot,
    thumbnailUrl: thumbnailUrl || null,
    likesCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    rankingScore: initialScore,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getDravById(id, userId);
  if (!created) {
    throw new Error("Failed to retrieve created Drav");
  }
  return created;
}

export async function updateDrav(
  dravId: string,
  userId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: DravVisibility;
    status?: "published" | "draft" | "unpublished";
  }
): Promise<DravDetailData | null> {
  const existing = await db
    .select({ userId: drav.userId })
    .from(drav)
    .where(eq(drav.id, dravId))
    .limit(1);

  if (existing.length === 0 || existing[0].userId !== userId) {
    return null;
  }

  await db
    .update(drav)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(drav.id, dravId));

  return getDravById(dravId, userId);
}

export async function deleteDrav(dravId: string, userId: string): Promise<boolean> {
  const existing = await db
    .select({ userId: drav.userId })
    .from(drav)
    .where(eq(drav.id, dravId))
    .limit(1);

  if (existing.length === 0 || existing[0].userId !== userId) {
    return false;
  }

  await db.delete(drav).where(eq(drav.id, dravId));
  return true;
}

export async function toggleDravLike(
  dravId: string,
  userId: string
): Promise<{ liked: boolean; likesCount: number } | null> {
  const dravRecord = await db
    .select({
      id: drav.id,
      likesCount: drav.likesCount,
      viewsCount: drav.viewsCount,
      commentsCount: drav.commentsCount,
      publishedAt: drav.publishedAt,
    })
    .from(drav)
    .where(eq(drav.id, dravId))
    .limit(1);

  if (dravRecord.length === 0) return null;
  const current = dravRecord[0];

  const existingLike = await db
    .select({ id: dravLike.id })
    .from(dravLike)
    .where(and(eq(dravLike.dravId, dravId), eq(dravLike.userId, userId)))
    .limit(1);

  let liked = false;
  let newLikesCount = current.likesCount;

  if (existingLike.length > 0) {
    // Unlike
    await db.delete(dravLike).where(eq(dravLike.id, existingLike[0].id));
    newLikesCount = Math.max(0, current.likesCount - 1);
    liked = false;
  } else {
    // Like
    const likeId = `lk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(dravLike).values({
      id: likeId,
      dravId,
      userId,
      createdAt: new Date(),
    });
    newLikesCount = current.likesCount + 1;
    liked = true;
  }

  const newScore = computeRankingScore(
    newLikesCount,
    current.viewsCount,
    current.commentsCount,
    current.publishedAt
  );

  await db
    .update(drav)
    .set({
      likesCount: newLikesCount,
      rankingScore: newScore,
    })
    .where(eq(drav.id, dravId));

  return { liked, likesCount: newLikesCount };
}

export async function incrementDravView(dravId: string): Promise<number | null> {
  const dravRecord = await db
    .select({
      id: drav.id,
      likesCount: drav.likesCount,
      viewsCount: drav.viewsCount,
      commentsCount: drav.commentsCount,
      publishedAt: drav.publishedAt,
    })
    .from(drav)
    .where(eq(drav.id, dravId))
    .limit(1);

  if (dravRecord.length === 0) return null;
  const current = dravRecord[0];

  const newViews = current.viewsCount + 1;
  const newScore = computeRankingScore(
    current.likesCount,
    newViews,
    current.commentsCount,
    current.publishedAt
  );

  await db
    .update(drav)
    .set({
      viewsCount: newViews,
      rankingScore: newScore,
    })
    .where(eq(drav.id, dravId));

  return newViews;
}

export async function listDravComments(
  dravId: string,
  currentUserId?: string
): Promise<DravCommentData[]> {
  const rows = await db
    .select({
      id: dravComment.id,
      dravId: dravComment.dravId,
      userId: dravComment.userId,
      body: dravComment.body,
      createdAt: dravComment.createdAt,
      updatedAt: dravComment.updatedAt,
      authorId: user.id,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(dravComment)
    .innerJoin(user, eq(dravComment.userId, user.id))
    .where(
      and(
        eq(dravComment.dravId, dravId),
        isNull(dravComment.deletedAt)
      )
    )
    .orderBy(asc(dravComment.createdAt));

  return rows.map((r) => ({
    id: r.id,
    dravId: r.dravId,
    userId: r.userId,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: {
      id: r.authorId,
      name: r.authorName,
      image: r.authorImage,
    },
    isOwner: Boolean(currentUserId && currentUserId === r.userId),
  }));
}

export async function createDravComment({
  dravId,
  userId,
  body,
}: {
  dravId: string;
  userId: string;
  body: string;
}): Promise<DravCommentData> {
  const commentId = `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  await db.insert(dravComment).values({
    id: commentId,
    dravId,
    userId,
    body,
    createdAt: now,
    updatedAt: now,
  });

  // Increment commentsCount on drav & recompute score
  const dravRecord = await db
    .select({
      likesCount: drav.likesCount,
      viewsCount: drav.viewsCount,
      commentsCount: drav.commentsCount,
      publishedAt: drav.publishedAt,
    })
    .from(drav)
    .where(eq(drav.id, dravId))
    .limit(1);

  if (dravRecord.length > 0) {
    const cur = dravRecord[0];
    const newComments = cur.commentsCount + 1;
    const newScore = computeRankingScore(cur.likesCount, cur.viewsCount, newComments, cur.publishedAt);
    await db
      .update(drav)
      .set({
        commentsCount: newComments,
        rankingScore: newScore,
      })
      .where(eq(drav.id, dravId));
  }

  // Fetch author
  const authorUser = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return {
    id: commentId,
    dravId,
    userId,
    body,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    author: {
      id: authorUser[0]?.id || userId,
      name: authorUser[0]?.name || "Anonymous",
      image: authorUser[0]?.image || null,
    },
    isOwner: true,
  };
}

export async function deleteDravComment(
  commentId: string,
  userId: string
): Promise<boolean> {
  // Can delete if user is comment author or drav owner
  const commentRows = await db
    .select({
      id: dravComment.id,
      dravId: dravComment.dravId,
      userId: dravComment.userId,
    })
    .from(dravComment)
    .where(eq(dravComment.id, commentId))
    .limit(1);

  if (commentRows.length === 0) return false;
  const targetComment = commentRows[0];

  const dravOwner = await db
    .select({ userId: drav.userId })
    .from(drav)
    .where(eq(drav.id, targetComment.dravId))
    .limit(1);

  const canDelete =
    targetComment.userId === userId ||
    (dravOwner.length > 0 && dravOwner[0].userId === userId);

  if (!canDelete) return false;

  // Soft delete
  await db
    .update(dravComment)
    .set({ deletedAt: new Date() })
    .where(eq(dravComment.id, commentId));

  // Decrement commentsCount
  await db
    .update(drav)
    .set({
      commentsCount: sql`GREATEST(0, ${drav.commentsCount} - 1)`,
    })
    .where(eq(drav.id, targetComment.dravId));

  return true;
}

export async function createDravReport({
  dravId,
  userId,
  reason,
}: {
  dravId: string;
  userId: string;
  reason: string;
}): Promise<boolean> {
  const reportId = `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(dravReport).values({
    id: reportId,
    dravId,
    reporterUserId: userId,
    reason,
    status: "pending",
    createdAt: new Date(),
  });
  return true;
}
