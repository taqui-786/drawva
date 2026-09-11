export type DravVisibility = "public" | "unlisted" | "private";
export type DravStatus = "published" | "draft" | "unpublished";

export const DRAV_CATEGORY_KEYS = [
  "ai",
  "coding",
  "design",
  "research",
  "diagrams",
  "learning",
  "fun",
  "other",
] as const;

export type DravCategoryKey = (typeof DRAV_CATEGORY_KEYS)[number];
export type DravCategory = "all" | DravCategoryKey;

export interface DravCategoryMeta {
  id: DravCategory;
  label: string;
  description: string;
}

export const DRAV_CATEGORIES: DravCategoryMeta[] = [
  { id: "all", label: "All Dravs", description: "Discover all community creations" },
  { id: "ai", label: "AI & Agents", description: "Prompts, agent loops, neural architectures" },
  { id: "coding", label: "Coding & Systems", description: "Software architecture, database schemas, code applets" },
  { id: "design", label: "Design & UI/UX", description: "Wireframes, flowcharts, visual interfaces" },
  { id: "diagrams", label: "Diagrams & Flows", description: "Mermaid, Graphviz, Vega-Lite visual charts" },
  { id: "research", label: "Research & Science", description: "Math equations, chemical structures, papers" },
  { id: "learning", label: "Learning & Guides", description: "Tutorials, cheat sheets, mental models" },
  { id: "fun", label: "Fun & Creative", description: "Sketches, doodles, visual experiments" },
  { id: "other", label: "Other", description: "Miscellaneous whiteboard canvases" },
];

export interface DravAuthor {
  id: string;
  name: string;
  image?: string | null;
}

export interface DravCardData {
  id: string;
  canvasId: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  category: string;
  tags: string[];
  visibility: DravVisibility;
  status: DravStatus;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  rankingScore: number;
  publishedAt: string;
  createdAt: string;
  author: DravAuthor;
  likedByMe?: boolean;
}

export interface DravDetailData extends DravCardData {
  snapshot: string;
  isOwner?: boolean;
}

export interface DravCommentData {
  id: string;
  dravId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: DravAuthor;
  isOwner?: boolean;
}

export type DravSortOption = "trending" | "top" | "new" | "views";
