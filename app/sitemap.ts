import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { drav } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drawva.com";
  const lastModified = new Date();

  const baseRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/canvas`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/community`,
      lastModified,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  try {
    const publicDravs = await db
      .select({ id: drav.id, updatedAt: drav.updatedAt })
      .from(drav)
      .where(and(eq(drav.visibility, "public"), eq(drav.status, "published")))
      .orderBy(desc(drav.publishedAt))
      .limit(200);

    const dravRoutes: MetadataRoute.Sitemap = publicDravs.map((d) => ({
      url: `${baseUrl}/drav/${d.id}`,
      lastModified: d.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    return [...baseRoutes, ...dravRoutes];
  } catch {
    return baseRoutes;
  }
}
