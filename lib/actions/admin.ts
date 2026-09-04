"use server";

import { headers } from "next/headers";
import { eq, desc, sql, or, ilike } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, canvas, aiUsage } from "@/lib/db/schema";
import type { ProjectSnapshot } from "@/lib/canvas/persistence";

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  banned: boolean;
  createdAt: number;
  canvasCount: number;
  totalTokens: number;
}

export interface AdminCanvasSummaryDto {
  id: string;
  title: string;
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  tilesCount: number;
  widgetsCount: number;
  objectsCount: number;
  savedAt: number;
  createdAt: number;
}

export interface AdminCanvasDetailDto {
  id: string;
  title: string;
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  snapshot: ProjectSnapshot;
  savedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdminAiUsageDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  providerType: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  intent: string | null;
  userPrompt: string | null;
  snapshotUrl: string | null;
  response: string | null;
  createdAt: number;
}

export interface AdminOverviewStatsDto {
  totalUsers: number;
  totalCanvases: number;
  totalAiRequests: number;
  totalAiTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  recentCanvases: AdminCanvasSummaryDto[];
  recentAiRequests: AdminAiUsageDto[];
}

export async function requireAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  const adminEmails = (process.env.ADMIN_EMAIL || "taquiimam.83@gmail.com,dronzer.jhar@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  const userEmail = (session.user.email || "").toLowerCase();

  const isRoleAdmin = session.user.role === "admin";
  const isEmailAdmin = adminEmails.includes(userEmail);

  if (!isRoleAdmin && !isEmailAdmin) {
    throw new Error("FORBIDDEN");
  }

  // Promote in DB if email matched admin list but role not synced
  if (isEmailAdmin && !isRoleAdmin) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, session.user.id));
  }

  return session.user;
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStatsDto> {
  await requireAdminSession();

  const [
    userCountResult,
    canvasCountResult,
    aiStatsResult,
    recentCanvasesRows,
    recentAiRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(user),
    db.select({ count: sql<number>`count(*)::int` }).from(canvas),
    db.select({
      count: sql<number>`count(*)::int`,
      prompt: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      completion: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      total: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
    }).from(aiUsage),
    db
      .select({
        id: canvas.id,
        title: canvas.title,
        data: canvas.data,
        savedAt: canvas.savedAt,
        createdAt: canvas.createdAt,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(canvas)
      .innerJoin(user, eq(canvas.userId, user.id))
      .orderBy(desc(canvas.savedAt))
      .limit(5),
    db
      .select({
        id: aiUsage.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        providerType: aiUsage.providerType,
        modelId: aiUsage.modelId,
        inputTokens: aiUsage.inputTokens,
        outputTokens: aiUsage.outputTokens,
        totalTokens: aiUsage.totalTokens,
        intent: aiUsage.intent,
        userPrompt: aiUsage.userPrompt,
        snapshotUrl: aiUsage.snapshotUrl,
        response: aiUsage.response,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .innerJoin(user, eq(aiUsage.userId, user.id))
      .orderBy(desc(aiUsage.createdAt))
      .limit(5),
  ]);

  const recentCanvases: AdminCanvasSummaryDto[] = recentCanvasesRows.map((r) => {
    let tilesCount = 0;
    let widgetsCount = 0;
    let objectsCount = 0;
    try {
      const parsed = JSON.parse(r.data);
      tilesCount = Object.keys(parsed.tiles || {}).length;
      widgetsCount = (parsed.widgets || []).length;
      objectsCount = (parsed.objects || []).length;
    } catch {}

    return {
      id: r.id,
      title: r.title,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      userImage: r.userImage,
      tilesCount,
      widgetsCount,
      objectsCount,
      savedAt: new Date(r.savedAt).getTime(),
      createdAt: new Date(r.createdAt).getTime(),
    };
  });

  const recentAiRequests: AdminAiUsageDto[] = recentAiRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    providerType: r.providerType,
    modelId: r.modelId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    intent: r.intent,
    userPrompt: r.userPrompt,
    snapshotUrl: r.snapshotUrl,
    response: r.response,
    createdAt: new Date(r.createdAt).getTime(),
  }));

  return {
    totalUsers: userCountResult[0]?.count ?? 0,
    totalCanvases: canvasCountResult[0]?.count ?? 0,
    totalAiRequests: aiStatsResult[0]?.count ?? 0,
    totalAiTokens: aiStatsResult[0]?.total ?? 0,
    totalPromptTokens: aiStatsResult[0]?.prompt ?? 0,
    totalCompletionTokens: aiStatsResult[0]?.completion ?? 0,
    recentCanvases,
    recentAiRequests,
  };
}

export async function getAdminUsers(query?: string): Promise<AdminUserDto[]> {
  await requireAdminSession();

  const filter = query && query.trim().length > 0
    ? or(ilike(user.name, `%${query.trim()}%`), ilike(user.email, `%${query.trim()}%`))
    : undefined;

  const usersQuery = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));

  const rows = filter ? await usersQuery.where(filter) : await usersQuery;

  // Aggregate canvas count & AI tokens per user
  const [canvasCounts, tokenCounts] = await Promise.all([
    db
      .select({
        userId: canvas.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(canvas)
      .groupBy(canvas.userId),
    db
      .select({
        userId: aiUsage.userId,
        tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      })
      .from(aiUsage)
      .groupBy(aiUsage.userId),
  ]);

  const canvasMap = new Map<string, number>(canvasCounts.map((c) => [c.userId, c.count]));
  const tokenMap = new Map<string, number>(tokenCounts.map((t) => [t.userId, t.tokens]));

  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role || "user",
    banned: !!u.banned,
    createdAt: new Date(u.createdAt).getTime(),
    canvasCount: canvasMap.get(u.id) ?? 0,
    totalTokens: tokenMap.get(u.id) ?? 0,
  }));
}

export async function updateUserRole(userId: string, newRole: "admin" | "user"): Promise<{ success: boolean }> {
  const currentAdmin = await requireAdminSession();
  if (currentAdmin.id === userId && newRole !== "admin") {
    throw new Error("Cannot remove admin role from yourself");
  }

  await db.update(user).set({ role: newRole }).where(eq(user.id, userId));
  return { success: true };
}

export async function getAdminCanvases(query?: string): Promise<AdminCanvasSummaryDto[]> {
  await requireAdminSession();

  const filter = query && query.trim().length > 0
    ? or(
        ilike(canvas.title, `%${query.trim()}%`),
        ilike(user.name, `%${query.trim()}%`),
        ilike(user.email, `%${query.trim()}%`)
      )
    : undefined;

  const baseQuery = db
    .select({
      id: canvas.id,
      title: canvas.title,
      data: canvas.data,
      savedAt: canvas.savedAt,
      createdAt: canvas.createdAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(canvas)
    .innerJoin(user, eq(canvas.userId, user.id))
    .orderBy(desc(canvas.savedAt));

  const rows = filter ? await baseQuery.where(filter) : await baseQuery;

  return rows.map((r) => {
    let tilesCount = 0;
    let widgetsCount = 0;
    let objectsCount = 0;
    try {
      const parsed = JSON.parse(r.data);
      tilesCount = Object.keys(parsed.tiles || {}).length;
      widgetsCount = (parsed.widgets || []).length;
      objectsCount = (parsed.objects || []).length;
    } catch {}

    return {
      id: r.id,
      title: r.title,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      userImage: r.userImage,
      tilesCount,
      widgetsCount,
      objectsCount,
      savedAt: new Date(r.savedAt).getTime(),
      createdAt: new Date(r.createdAt).getTime(),
    };
  });
}

export async function getAdminCanvasById(canvasId: string): Promise<AdminCanvasDetailDto> {
  await requireAdminSession();

  const rows = await db
    .select({
      id: canvas.id,
      title: canvas.title,
      data: canvas.data,
      savedAt: canvas.savedAt,
      createdAt: canvas.createdAt,
      updatedAt: canvas.updatedAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(canvas)
    .innerJoin(user, eq(canvas.userId, user.id))
    .where(eq(canvas.id, canvasId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Canvas record not found");
  }

  const row = rows[0];
  let parsedSnapshot: ProjectSnapshot;
  try {
    parsedSnapshot = JSON.parse(row.data) as ProjectSnapshot;
  } catch {
    throw new Error("Corrupted canvas data");
  }

  return {
    id: row.id,
    title: row.title,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    userImage: row.userImage,
    snapshot: parsedSnapshot,
    savedAt: new Date(row.savedAt).getTime(),
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  };
}

export async function deleteAdminCanvas(canvasId: string): Promise<{ success: boolean }> {
  await requireAdminSession();
  await db.delete(canvas).where(eq(canvas.id, canvasId));
  return { success: true };
}

export async function getAdminAiUsage(query?: string): Promise<AdminAiUsageDto[]> {
  await requireAdminSession();

  const filter = query && query.trim().length > 0
    ? or(
        ilike(aiUsage.userPrompt, `%${query.trim()}%`),
        ilike(aiUsage.modelId, `%${query.trim()}%`),
        ilike(aiUsage.providerType, `%${query.trim()}%`),
        ilike(user.name, `%${query.trim()}%`),
        ilike(user.email, `%${query.trim()}%`)
      )
    : undefined;

  const baseQuery = db
    .select({
      id: aiUsage.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      providerType: aiUsage.providerType,
      modelId: aiUsage.modelId,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      totalTokens: aiUsage.totalTokens,
      intent: aiUsage.intent,
      userPrompt: aiUsage.userPrompt,
      snapshotUrl: aiUsage.snapshotUrl,
      response: aiUsage.response,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .innerJoin(user, eq(aiUsage.userId, user.id))
    .orderBy(desc(aiUsage.createdAt))
    .limit(100);

  const rows = filter ? await baseQuery.where(filter) : await baseQuery;

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    providerType: r.providerType,
    modelId: r.modelId,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    intent: r.intent,
    userPrompt: r.userPrompt,
    snapshotUrl: r.snapshotUrl,
    response: r.response,
    createdAt: new Date(r.createdAt).getTime(),
  }));
}
