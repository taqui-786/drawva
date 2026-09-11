/**
 * Hacker News-style time-decay ranking algorithm for community Dravs.
 * Score = (Likes * 3 + Comments * 2 + Views * 0.1) / (AgeInHours + 2) ^ Gravity
 */
export function computeRankingScore(
  likesCount: number,
  viewsCount: number,
  commentsCount: number,
  publishedAt: Date | string,
  gravity: number = 1.5
): number {
  const publishedTime = typeof publishedAt === "string" ? new Date(publishedAt).getTime() : publishedAt.getTime();
  const ageInHours = Math.max(0, (Date.now() - publishedTime) / (1000 * 60 * 60));

  const weightedInteractions =
    likesCount * 3 +
    commentsCount * 2 +
    viewsCount * 0.1 +
    1; // Base 1 point

  const decay = Math.pow(ageInHours + 2, gravity);
  const score = Math.round((weightedInteractions / decay) * 1000);

  return Math.max(0, score);
}
