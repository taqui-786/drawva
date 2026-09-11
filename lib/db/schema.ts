import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user").notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    issuer: text("issuer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const canvas = pgTable(
  "canvas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled Canvas"),
    data: text("data").notNull(),
    savedAt: timestamp("saved_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("canvas_userId_idx").on(table.userId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerType: text("provider_type").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    intent: text("intent"),
    userPrompt: text("user_prompt"),
    snapshotUrl: text("snapshot_url"),
    response: text("response"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_userId_idx").on(table.userId),
    index("ai_usage_createdAt_idx").on(table.createdAt),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  canvases: many(canvas),
  aiUsages: many(aiUsage),
  dravs: many(drav),
  dravLikes: many(dravLike),
  dravComments: many(dravComment),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const canvasRelations = relations(canvas, ({ one, many }) => ({
  user: one(user, {
    fields: [canvas.userId],
    references: [user.id],
  }),
  dravs: many(drav),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(user, {
    fields: [aiUsage.userId],
    references: [user.id],
  }),
}));

export const p2pPresence = pgTable(
  "p2p_presence",
  {
    peerId: text("peer_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    peerJsId: text("peer_js_id").notNull(),
    lastSeen: timestamp("last_seen").defaultNow().notNull(),
  },
  (table) => [index("p2p_presence_lastSeen_idx").on(table.lastSeen)],
);

export const p2pRequest = pgTable(
  "p2p_request",
  {
    id: text("id").primaryKey(),
    fromPeerId: text("from_peer_id").notNull(),
    fromName: text("from_name").notNull(),
    fromPeerJsId: text("from_peer_js_id").notNull(),
    toPeerId: text("to_peer_id").notNull(),
    toName: text("to_name").notNull(),
    toPeerJsId: text("to_peer_js_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("p2p_request_toPeerId_idx").on(table.toPeerId),
    index("p2p_request_fromPeerId_idx").on(table.fromPeerId),
  ],
);

export const drav = pgTable(
  "drav",
  {
    id: text("id").primaryKey(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvas.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    snapshot: text("snapshot").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    category: text("category").default("other").notNull(),
    tags: text("tags")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    visibility: text("visibility").default("public").notNull(), // "public" | "unlisted" | "private"
    status: text("status").default("published").notNull(), // "published" | "draft" | "unpublished"
    likesCount: integer("likes_count").default(0).notNull(),
    commentsCount: integer("comments_count").default(0).notNull(),
    viewsCount: integer("views_count").default(0).notNull(),
    rankingScore: integer("ranking_score").default(0).notNull(),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("drav_userId_idx").on(table.userId),
    index("drav_canvasId_idx").on(table.canvasId),
    index("drav_visibility_status_idx").on(table.visibility, table.status),
    index("drav_category_idx").on(table.category),
    index("drav_publishedAt_idx").on(table.publishedAt),
    index("drav_rankingScore_idx").on(table.rankingScore),
  ],
);

export const dravLike = pgTable(
  "drav_like",
  {
    id: text("id").primaryKey(),
    dravId: text("drav_id")
      .notNull()
      .references(() => drav.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("drav_like_drav_user_unique").on(table.dravId, table.userId),
    index("drav_like_userId_idx").on(table.userId),
    index("drav_like_dravId_idx").on(table.dravId),
  ],
);

export const dravComment = pgTable(
  "drav_comment",
  {
    id: text("id").primaryKey(),
    dravId: text("drav_id")
      .notNull()
      .references(() => drav.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("drav_comment_dravId_idx").on(table.dravId),
    index("drav_comment_userId_idx").on(table.userId),
    index("drav_comment_createdAt_idx").on(table.createdAt),
  ],
);

export const dravReport = pgTable(
  "drav_report",
  {
    id: text("id").primaryKey(),
    dravId: text("drav_id")
      .notNull()
      .references(() => drav.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status").default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("drav_report_dravId_idx").on(table.dravId)],
);

export const dravRelations = relations(drav, ({ one, many }) => ({
  user: one(user, {
    fields: [drav.userId],
    references: [user.id],
  }),
  canvas: one(canvas, {
    fields: [drav.canvasId],
    references: [canvas.id],
  }),
  likes: many(dravLike),
  comments: many(dravComment),
  reports: many(dravReport),
}));

export const dravLikeRelations = relations(dravLike, ({ one }) => ({
  drav: one(drav, {
    fields: [dravLike.dravId],
    references: [drav.id],
  }),
  user: one(user, {
    fields: [dravLike.userId],
    references: [user.id],
  }),
}));

export const dravCommentRelations = relations(dravComment, ({ one }) => ({
  drav: one(drav, {
    fields: [dravComment.dravId],
    references: [drav.id],
  }),
  user: one(user, {
    fields: [dravComment.userId],
    references: [user.id],
  }),
}));

export const dravReportRelations = relations(dravReport, ({ one }) => ({
  drav: one(drav, {
    fields: [dravReport.dravId],
    references: [drav.id],
  }),
  reporter: one(user, {
    fields: [dravReport.reporterUserId],
    references: [user.id],
  }),
}));

