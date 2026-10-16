import { z } from "zod";
export const categories = {
  COMPANY: "公司",
  RESTAURANT: "饭店",
  ATTRACTION: "景点",
  OTHER: "其他",
} as const;
export type Category = keyof typeof categories;
export const evidenceLabels = {
  STATEMENT: "仅本人陈述",
  MATERIAL: "已附材料",
  CORROBORATED: "有独立佐证",
} as const;
export type EvidenceLevel = keyof typeof evidenceLabels;
export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "登录名仅支持字母、数字与下划线"),
  password: z.string().min(8).max(128),
});
export const registerSchema = credentialsSchema.extend({
  nickname: z.string().trim().min(1).max(24),
});
export const subjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(["COMPANY", "RESTAURANT", "ATTRACTION", "OTHER"]),
  city: z.string().trim().min(2).max(30),
  address: z.string().trim().max(150).default(""),
});
export const postSchema = z.object({
  subjectId: z.string().min(1),
  title: z.string().trim().min(5).max(80),
  body: z.string().trim().min(20).max(5000),
  occurredOn: z.iso
    .date()
    .refine(
      (v) => v <= new Date().toISOString().slice(0, 10),
      "发生日期不能晚于今天",
    ),
  anonymous: z.boolean(),
  personalExperience: z.literal(true, { error: "请确认这是你的亲身经历" }),
});
export const updateSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(10).max(5000),
});
export const revisionSchema = postSchema
  .pick({
    title: true,
    body: true,
    occurredOn: true,
  })
  .extend({
    baseVersion: z.number().int().min(1),
    changeReason: z.string().trim().min(5).max(500),
  });
export const historyVisibilitySchema = z.object({
  reason: z.string().trim().min(2).max(500),
});
export const materialLimits = {
  maxBytes: 10 * 1024 * 1024,
  maxPerPost: 6,
  maxPixels: 20000000,
} as const;
export const materialSchema = z.object({
  source: z.string().trim().min(5).max(500),
  visibility: z.enum(["PUBLIC", "REVIEW_ONLY"]),
  clientKey: z.uuid(),
});
export const redactionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.width <= 1 && r.y + r.height <= 1, "遮挡范围超出图片");
export const materialReviewSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().min(2).max(500),
    privacyChecked: z.boolean(),
    redactions: z.array(redactionSchema).max(30),
    baseVersion: z.number().int().min(1).default(1),
  })
  .refine(
    (v) => v.action === "REJECT" || v.privacyChecked,
    "请确认已检查图片和来源说明中的隐私信息",
  );
export type Redaction = z.infer<typeof redactionSchema>;
export type PublicMaterial = {
  id: string;
  source: string;
  width: number;
  height: number;
  createdAt: string;
  version: number;
};
export type OwnMaterial = PublicMaterial & {
  visibility: "PUBLIC" | "REVIEW_ONLY";
  status: string;
  reason: string | null;
  submittedVersion: number | null;
};
export type MaterialReview = OwnMaterial & {
  postId: string;
  postTitle: string;
  subjectName: string;
  postBody: string;
  postOccurredOn: string;
};
export const materialVersionQuerySchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
});
export const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(2).max(500),
});
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(100).default(""),
  city: z.string().trim().max(30).default(""),
  category: z.enum(["COMPANY", "RESTAURANT", "ATTRACTION", "OTHER"]).optional(),
});
export type Subject = {
  id: string;
  name: string;
  category: Category;
  city: string;
  address: string;
  postCount: number;
};
export type PublicPost = {
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  createdAt: string;
  authorName: string;
  anonymous: boolean;
  evidence: EvidenceLevel;
  disputed: boolean;
  subject: Subject;
  following?: boolean;
  currentVersion: number;
  correction: { reason: string; publishedAt: string } | null;
};
export type TimelineItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  createdAt: string;
};
export type PublicRevision = {
  id: string;
  version: number;
  publishedAt: string;
} & (
  | {
      visible: true;
      title: string;
      body: string;
      occurredOn: string;
      changeReason: string;
    }
  | { visible: false }
);
export type OwnRevision = {
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  changeReason: string;
  status: string;
  reviewReason: string | null;
};
export type RevisionEditor = {
  post: Pick<
    PublicPost,
    "id" | "title" | "body" | "occurredOn" | "currentVersion"
  >;
  latestRevision: OwnRevision | null;
};
export type PostDetail = PublicPost & {
  timeline: TimelineItem[];
  history: PublicRevision[];
};
export type Page<T> = { items: T[]; total: number; page: number };
export type Account = { id: string; nickname: string; role: "USER" | "ADMIN" };
export type Notification = {
  id: string;
  title: string;
  body: string;
  postId: string;
  read: boolean;
  createdAt: string;
};
export type Review = {
  id: string;
  title: string;
  body: string;
  kind: "POST" | "UPDATE" | "REVISION";
  changeReason?: string;
  occurredOn?: string;
  previous?: {
    title: string;
    body: string;
    occurredOn: string;
    version: number;
  };
  subjectName: string;
  createdAt: string;
};
export type OwnPost = {
  id: string;
  title: string;
  status: string;
  reason: string | null;
  subjectName: string;
};
