"use server";

import { headers } from "next/headers";
import { eq, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";

export interface AiUsageRecordDto {
  id: string;
  providerType: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  intent?: string | null;
  userPrompt?: string | null;
  snapshotUrl?: string | null;
  response?: string | null;
  createdAt: number;
}

export interface AiUsageStats {
  requests: number;
  totalPrompt: number;
  totalCompletion: number;
  total: number;
}

export async function recordAiUsage(payload: {
  providerType: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  intent?: string;
  userPrompt?: string;
  snapshotUrl?: string;
  response?: string;
}): Promise<{ success: boolean }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false };
    }

    const isValidUrl =
      typeof payload.snapshotUrl === "string" &&
      (/^https?:\/\//i.test(payload.snapshotUrl) || payload.snapshotUrl.startsWith("data:image/"));
    const snapshotUrl = isValidUrl ? payload.snapshotUrl : null;

    await db.insert(aiUsage).values({
      id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: session.user.id,
      providerType: payload.providerType || "custom",
      modelId: payload.modelId || "unknown",
      inputTokens: payload.inputTokens || 0,
      outputTokens: payload.outputTokens || 0,
      totalTokens: payload.totalTokens || 0,
      intent: payload.intent || null,
      userPrompt: payload.userPrompt ? payload.userPrompt.slice(0, 4000) : null,
      snapshotUrl,
      response: payload.response ? payload.response.slice(0, 10000) : null,
      createdAt: new Date(),
    });

    return { success: true };
  } catch (err) {
    console.error("[recordAiUsage] Database record insert error:", err);
    return { success: false };
  }
}

export async function getRecentAiUsage(limit = 10): Promise<{
  history: AiUsageRecordDto[];
  stats: AiUsageStats;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return {
        history: [],
        stats: { requests: 0, totalPrompt: 0, totalCompletion: 0, total: 0 },
      };
    }

    const [rows, aggregates] = await Promise.all([
      db
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.userId, session.user.id))
        .orderBy(desc(aiUsage.createdAt))
        .limit(limit),
      db
        .select({
          requests: sql<number>`count(*)::int`,
          totalPrompt: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
          totalCompletion: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
          total: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, session.user.id)),
    ]);

    const history: AiUsageRecordDto[] = rows.map((r) => ({
      id: r.id,
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

    const stats: AiUsageStats = aggregates[0] || {
      requests: 0,
      totalPrompt: 0,
      totalCompletion: 0,
      total: 0,
    };

    return { history, stats };
  } catch (err) {
    console.error("getRecentAiUsage error:", err);
    return {
      history: [],
      stats: { requests: 0, totalPrompt: 0, totalCompletion: 0, total: 0 },
    };
  }
}

export async function clearAiUsage(): Promise<{ success: boolean }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false };
    }

    await db.delete(aiUsage).where(eq(aiUsage.userId, session.user.id));
    return { success: true };
  } catch (err) {
    console.error("clearAiUsage error:", err);
    return { success: false };
  }
}
