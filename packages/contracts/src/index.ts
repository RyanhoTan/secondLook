import { z } from "zod";
import { issueTypesSchema, issueTypeSchema, type IssueType } from "./issues";
export * from "./issues";
import {
  occurrenceFields,
  validateOccurrence,
  type OccurrencePrecision,
} from "./occurrence";
export * from "./occurrence";
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
const postFieldsSchema = z.object({
  issueTypes: issueTypesSchema.refine(
    (v) => v.length > 0,
    "请至少选择一个问题类型",
  ),
  subjectId: z.string().min(1),
  title: z.string().trim().min(5).max(80),
  body: z.string().trim().min(20).max(5000),
  ...occurrenceFields,
  anonymous: z.boolean(),
  personalExperience: z.literal(true, { error: "请确认这是你的亲身经历" }),
});
export const postSchema = postFieldsSchema.superRefine(validateOccurrence);
export const updateSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(10).max(5000),
});
export const postSubmissionSchema = postFieldsSchema
  .extend({ clientKey: z.uuid() })
  .superRefine(validateOccurrence);
export type PostSubmission = z.infer<typeof postSubmissionSchema>;
export const draftContentSchema = z.object({
  issueTypes: issueTypesSchema.default([]),
  subjectId: z.string().min(1).nullable(),
  title: z.string().max(80),
  body: z.string().max(5000),
  occurredOn: z.string().max(10),
  occurredPrecision: occurrenceFields.occurredPrecision,
  occurredUntil: z.string().max(10).default(""),
  anonymous: z.boolean(),
  personalExperience: z.boolean(),
});
export const saveDraftSchema = draftContentSchema.extend({
  version: z.number().int().min(0),
  mutationKey: z.uuid(),
});
export const draftSubmissionSchema = z.object({
  version: z.number().int().min(1),
});
export type DraftContent = z.infer<typeof draftContentSchema>;
export type PostDraft = DraftContent & {
  id: string;
  version: number;
  subject: Subject | null;
  postId: string | null;
  updatedAt: string;
};
export const revisionSchema = postFieldsSchema
  .pick({
    title: true,
    body: true,
    occurredOn: true,
    occurredPrecision: true,
    occurredUntil: true,
    issueTypes: true,
  })
  .extend({
    baseVersion: z.number().int().min(1),
    changeReason: z.string().trim().min(5).max(500),
  })
  .superRefine(validateOccurrence);
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
  postOccurrenceLabel: string;
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
export type SubjectBrowse = z.infer<typeof paginationSchema>;
export function subjectBrowseParams(value: SubjectBrowse) {
  const params = new URLSearchParams();
  if (value.q) params.set("q", value.q);
  if (value.city) params.set("city", value.city);
  if (value.category) params.set("category", value.category);
  if (value.page > 1) params.set("page", String(value.page));
  if (value.limit !== 12) params.set("limit", String(value.limit));
  return params;
}
export const postSortLabels = {
  PUBLISHED_DESC: "最新发布",
  OCCURRED_DESC: "最近发生",
  OCCURRED_ASC: "最早发生",
} as const;
const optionalBrowseDate = z
  .union([z.literal(""), z.iso.date({ error: "请输入有效日期（YYYY-MM-DD）" })])
  .optional()
  .transform((value) => value || undefined);
export const postBrowseSchema = paginationSchema
  .extend({
    subjectId: z.string().min(1).max(128).optional(),
    issue: issueTypeSchema.optional(),
    occurredFrom: optionalBrowseDate,
    occurredTo: optionalBrowseDate,
    sort: z
      .enum(["PUBLISHED_DESC", "OCCURRED_DESC", "OCCURRED_ASC"])
      .default("PUBLISHED_DESC"),
  })
  .refine(
    (value) =>
      !value.occurredFrom ||
      !value.occurredTo ||
      value.occurredFrom <= value.occurredTo,
    {
      message: "起始日期不能晚于结束日期",
      path: ["occurredTo"],
    },
  );
export type PostBrowse = z.infer<typeof postBrowseSchema>;
export function postBrowseParams(value: PostBrowse) {
  const params = new URLSearchParams();
  if (value.q) params.set("q", value.q);
  if (value.city) params.set("city", value.city);
  if (value.category) params.set("category", value.category);
  if (value.subjectId) params.set("subjectId", value.subjectId);
  if (value.issue) params.set("issue", value.issue);
  if (value.occurredFrom) params.set("occurredFrom", value.occurredFrom);
  if (value.occurredTo) params.set("occurredTo", value.occurredTo);
  if (value.sort !== "PUBLISHED_DESC") params.set("sort", value.sort);
  if (value.page > 1) params.set("page", String(value.page));
  if (value.limit !== 12) params.set("limit", String(value.limit));
  return params;
}
export type Subject = {
  id: string;
  name: string;
  category: Category;
  city: string;
  address: string;
  postCount: number;
};
export type SubjectDetail = Subject & { following: boolean };
export const privatePaginationSchema = z.object({
  page: z.preprocess(
    (value) => (Array.isArray(value) ? null : value),
    paginationSchema.shape.page,
  ),
  limit: z.preprocess(
    (value) => (Array.isArray(value) ? null : value),
    paginationSchema.shape.limit,
  ),
});
export type PrivatePagination = z.infer<typeof privatePaginationSchema>;
export function privatePageParams(value: PrivatePagination) {
  return new URLSearchParams({
    page: String(value.page),
    limit: String(value.limit),
  });
}
export const followingQuerySchema = privatePaginationSchema.extend({
  target: z.enum(["POST", "SUBJECT"]).default("POST"),
});
export const reviewKinds = {
  ALL: "全部文字",
  POST: "新亲历",
  UPDATE: "后续更新",
  REVISION: "原文修订",
} as const;
export const reviewQueueSchema = privatePaginationSchema.extend({
  kind: z.enum(["ALL", "POST", "UPDATE", "REVISION"]).default("ALL"),
  q: z.string().trim().max(100).default(""),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueSchema>;
export function reviewQueueParams(value: ReviewQueueQuery) {
  return new URLSearchParams({
    kind: value.kind,
    q: value.q,
    page: String(value.page),
    limit: String(value.limit),
  });
}
export type ReviewQueuePage = Page<Review> & {
  counts: Record<keyof typeof reviewKinds, number>;
};
export type FollowingQuery = z.infer<typeof followingQuerySchema>;
export function followingParams(value: FollowingQuery) {
  return new URLSearchParams({
    target: value.target,
    page: String(value.page),
    limit: String(value.limit),
  });
}
export type Following =
  | { target: "SUBJECT"; targetId: string; subject: Subject }
  | { target: "POST"; targetId: string; available: false }
  | {
      target: "POST";
      targetId: string;
      available: true;
      title: string;
      subject: Subject;
    };
export type PublicPost = {
  issueTypes: IssueType[];
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  occurredPrecision: OccurrencePrecision;
  occurredUntil: string;
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
      occurredPrecision: OccurrencePrecision;
      occurredUntil: string;
      issueTypes: IssueType[];
      changeReason: string;
    }
  | { visible: false }
);
export type OwnRevision = {
  issueTypes: IssueType[];
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  occurredPrecision: OccurrencePrecision;
  occurredUntil: string;
  changeReason: string;
  status: string;
  reviewReason: string | null;
};
export type RevisionEditor = {
  post: Pick<
    PublicPost,
    | "id"
    | "title"
    | "body"
    | "occurredOn"
    | "currentVersion"
    | "issueTypes"
    | "occurredPrecision"
    | "occurredUntil"
  > & { category: Category };
  latestRevision: OwnRevision | null;
};
export type PostDetail = PublicPost & {
  timeline: TimelineItem[];
  history: PublicRevision[];
};
export type Page<T> = { items: T[]; total: number; page: number };
export type Account = { id: string; nickname: string; role: "USER" | "ADMIN" };
export type Notification = {
  subjectName: string;
  id: string;
  title: string;
  body: string;
  postId: string;
  read: boolean;
  createdAt: string;
};
export type Review = {
  issueTypes?: IssueType[];
  id: string;
  title: string;
  body: string;
  kind: "POST" | "UPDATE" | "REVISION";
  changeReason?: string;
  occurredOn?: string;
  occurredPrecision?: OccurrencePrecision;
  occurredUntil?: string;
  previous?: {
    title: string;
    body: string;
    occurredOn: string;
    occurredPrecision: OccurrencePrecision;
    occurredUntil: string;
    version: number;
    issueTypes: IssueType[];
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
