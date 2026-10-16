import type { Database } from "./db.js";
import type {
  Category,
  EvidenceLevel,
  PostBrowse,
} from "@secondlook/contracts";
import type { Prisma } from "./generated/prisma/client.js";
import { HttpError } from "./http.js";
import { postIssues } from "./issues.js";
const subjectCount = { posts: { where: { status: "PUBLISHED" } } } as const;
export const subjectInclude = { _count: { select: subjectCount } };
type SubjectRow = {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  _count?: { posts: number };
};
export function publicSubject(subject: SubjectRow) {
  return {
    id: subject.id,
    name: subject.name,
    category: subject.category as Category,
    city: subject.city,
    address: subject.address,
    postCount: subject._count?.posts ?? 0,
  };
}
export const postInclude = {
  issues: true,
  author: { select: { nickname: true } },
  subject: { include: subjectInclude },
  revisions: {
    where: { status: "PUBLISHED" },
    orderBy: { version: "desc" },
    take: 1,
    select: { changeReason: true, publishedAt: true, version: true },
  },
} as const;
type PostRow = {
  issues: { code: string }[];
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  anonymous: boolean;
  evidence: string;
  disputed: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  currentVersion: number;
  revisions: {
    changeReason: string;
    publishedAt: Date | null;
    version: number | null;
  }[];
  author: { nickname: string };
  subject: SubjectRow;
};
export function publicPost(post: PostRow) {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    occurredOn: post.occurredOn,
    issueTypes: postIssues(post.issues),
    createdAt: (post.publishedAt ?? post.createdAt).toISOString(),
    anonymous: post.anonymous,
    authorName: post.anonymous ? "匿名亲历者" : post.author.nickname,
    evidence: post.evidence as EvidenceLevel,
    disputed: post.disputed,
    subject: publicSubject(post.subject),
    currentVersion: post.currentVersion,
    correction:
      post.currentVersion > 1 && post.revisions[0]?.publishedAt
        ? {
            reason: post.revisions[0].changeReason,
            publishedAt: post.revisions[0].publishedAt.toISOString(),
          }
        : null,
  };
}
export async function publishedPost(db: Pick<Database, "post">, id: string) {
  const post = await db.post.findFirst({
    where: { id, status: "PUBLISHED" },
    include: postInclude,
  });
  if (!post) throw new HttpError(404, "记录不存在或尚未公开");
  return post;
}
export async function searchPosts(db: Database, query: PostBrowse) {
  const {
    q,
    category,
    city,
    subjectId,
    occurredFrom,
    occurredTo,
    sort,
    page,
    limit,
    issue,
  } = query;
  const where: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    ...(issue ? { issues: { some: { code: issue } } } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(category || city
      ? {
          subject: {
            ...(category ? { category } : {}),
            ...(city ? { city: { contains: city } } : {}),
          },
        }
      : {}),
    ...(occurredFrom || occurredTo
      ? {
          occurredOn: {
            ...(occurredFrom ? { gte: occurredFrom } : {}),
            ...(occurredTo ? { lte: occurredTo } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { body: { contains: q } },
            { subject: { name: { contains: q } } },
            { subject: { address: { contains: q } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.PostOrderByWithRelationInput[] = [
    ...(sort === "PUBLISHED_DESC"
      ? []
      : [
          {
            occurredOn:
              sort === "OCCURRED_ASC" ? ("asc" as const) : ("desc" as const),
          },
        ]),
    { publishedAt: "desc" },
    { id: "desc" },
  ];
  const [items, total] = await db.$transaction([
    db.post.findMany({
      where,
      include: postInclude,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.post.count({ where }),
  ]);
  return { items: items.map(publicPost), total, page };
}
export async function reviewItem(
  db: Database,
  id: string,
  kind: "POST" | "UPDATE",
  action: "APPROVE" | "REJECT",
  reason: string,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    // Update a pending record atomically: repeated decisions cannot duplicate timeline events.
    const changed =
      kind === "POST"
        ? await tx.post.updateMany({
            where: { id, status: "PENDING" },
            data: {
              status: action === "APPROVE" ? "PUBLISHED" : "REJECTED",
              reason,
              ...(action === "APPROVE" ? { publishedAt: new Date() } : {}),
            },
          })
        : await tx.progressUpdate.updateMany({
            where: { id, status: "PENDING", post: { status: "PUBLISHED" } },
            data: {
              status: action === "APPROVE" ? "PUBLISHED" : "REJECTED",
              reason,
            },
          });
    if (changed.count !== 1) throw new HttpError(409, "该记录已处理或不可审核");
    await tx.auditLog.create({
      data: { actorId, targetId: id, action: `${kind}_${action}`, reason },
    });
    if (action === "REJECT") return;
    if (kind === "POST") {
      const post = await tx.post.findUniqueOrThrow({
        where: { id },
        include: { issues: true },
      });
      await tx.postRevision.create({
        data: {
          postId: id,
          version: 1,
          baseVersion: 1,
          title: post.title,
          body: post.body,
          occurredOn: post.occurredOn,
          issueTypes: postIssues(post.issues),
          changeReason: "首次公开",
          status: "PUBLISHED",
          publishedAt: post.publishedAt,
        },
      });
      await tx.timelineEvent.create({
        data: {
          postId: id,
          title: "亲历记录公开",
          body: "亲历已完成发布规则检查，可持续补充材料与后续进展。",
          kind: "PUBLISHED",
        },
      });
    } else {
      const update = await tx.progressUpdate.findUniqueOrThrow({
        where: { id },
      });
      const event = await tx.timelineEvent.create({
        data: {
          postId: update.postId,
          title: update.title,
          body: update.body,
          kind: "AUTHOR_UPDATE",
        },
      });
      const followers = await tx.follow.findMany({
        where: { postId: update.postId },
      });
      if (followers.length)
        await tx.notification.createMany({
          data: followers.map((f) => ({ userId: f.userId, eventId: event.id })),
        });
    }
  });
}
