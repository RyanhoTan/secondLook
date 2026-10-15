import type { Database } from "./db.js";
import type { Category, EvidenceLevel } from "@secondlook/contracts";
import { HttpError } from "./http.js";
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
  author: { select: { nickname: true } },
  subject: { include: subjectInclude },
} as const;
type PostRow = {
  id: string;
  title: string;
  body: string;
  occurredOn: string;
  anonymous: boolean;
  evidence: string;
  disputed: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  author: { nickname: string };
  subject: SubjectRow;
};
export function publicPost(post: PostRow) {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    occurredOn: post.occurredOn,
    createdAt: (post.publishedAt ?? post.createdAt).toISOString(),
    anonymous: post.anonymous,
    authorName: post.anonymous ? "匿名亲历者" : post.author.nickname,
    evidence: post.evidence as EvidenceLevel,
    disputed: post.disputed,
    subject: publicSubject(post.subject),
  };
}
export async function publishedPost(db: Database, id: string) {
  const post = await db.post.findFirst({
    where: { id, status: "PUBLISHED" },
    include: postInclude,
  });
  if (!post) throw new HttpError(404, "记录不存在或尚未公开");
  return post;
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
      await tx.timelineEvent.create({
        data: {
          postId: id,
          title: "亲历记录公开",
          body: "仅本人陈述，可持续补充后续进展。",
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
