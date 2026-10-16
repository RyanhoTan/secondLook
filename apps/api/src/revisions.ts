import type { z } from "zod";
import type { revisionSchema } from "@secondlook/contracts";
import type { Database } from "./db.js";
import { HttpError } from "./http.js";
import { scheduleMaterialReviews } from "./materials.js";
import { checkIssueCategory, storedIssues, postIssues } from "./issues.js";

export const revisionSelect = {
  id: true,
  version: true,
  title: true,
  body: true,
  occurredOn: true,
  issueTypes: true,
  changeReason: true,
  publishedAt: true,
  visible: true,
} as const;

export function publicRevision(row: {
  id: string;
  version: number | null;
  title: string;
  body: string;
  occurredOn: string;
  issueTypes: unknown;
  changeReason: string;
  publishedAt: Date | null;
  visible: boolean;
}) {
  const base = {
    id: row.id,
    version: row.version!,
    publishedAt: row.publishedAt!.toISOString(),
  };
  return row.visible
    ? {
        ...base,
        visible: true as const,
        title: row.title,
        body: row.body,
        occurredOn: row.occurredOn,
        issueTypes: storedIssues(row.issueTypes),
        changeReason: row.changeReason,
      }
    : { ...base, visible: false as const };
}

// Reuse this filter for notifications too: hiding history must also hide its event copy.
export function publicEventText(event: {
  title: string;
  body: string;
  revision?: { visible: boolean } | null;
}) {
  return event.revision?.visible === false
    ? {
        title: "历史更正已隐藏",
        body: "该版本已由管理员限制公开，保留处理记录。",
      }
    : { title: event.title, body: event.body };
}

export async function submitRevision(
  db: Database,
  postId: string,
  authorId: string,
  data: z.infer<typeof revisionSchema>,
) {
  return db.$transaction(async (tx) => {
    const post = await tx.post.findFirst({
      where: { id: postId, status: "PUBLISHED" },
      include: { subject: true, issues: true },
    });
    if (!post) throw new HttpError(404, "记录不存在或尚未公开");
    if (post.authorId !== authorId)
      throw new HttpError(403, "只能修改自己的经历");
    checkIssueCategory(post.subject.category, data.issueTypes);
    if (post.currentVersion !== data.baseVersion)
      throw new HttpError(409, "公开版本已变化，请重新打开修改页面");
    if (await tx.postRevision.findUnique({ where: { pendingKey: postId } }))
      throw new HttpError(409, "已有修改等待审核，请勿重复提交");
    if (
      post.title === data.title &&
      post.body === data.body &&
      post.occurredOn === data.occurredOn &&
      JSON.stringify(postIssues(post.issues)) ===
        JSON.stringify(data.issueTypes)
    )
      throw new HttpError(400, "请先修改标题、正文、发生日期或问题类型");
    return tx.postRevision.create({
      data: { ...data, postId, pendingKey: postId },
    });
  });
}

export async function reviewRevision(
  db: Database,
  id: string,
  action: "APPROVE" | "REJECT",
  reason: string,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    const revision = await tx.postRevision.findFirst({
      where: { id, status: "PENDING", post: { status: "PUBLISHED" } },
      include: { post: true },
    });
    if (!revision) throw new HttpError(409, "该修改已处理或不可审核");
    if (
      action === "APPROVE" &&
      revision.baseVersion !== revision.post.currentVersion
    )
      throw new HttpError(409, "公开版本已变化，请让作者重新提交");
    const approved = action === "APPROVE";
    const publishedAt = new Date();
    const version = revision.baseVersion + 1;
    const changed = await tx.postRevision.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: approved ? "PUBLISHED" : "REJECTED",
        pendingKey: null,
        reviewReason: reason,
        ...(approved ? { version, publishedAt } : {}),
      },
    });
    if (changed.count !== 1) throw new HttpError(409, "该修改已处理");
    await tx.auditLog.create({
      data: { actorId, targetId: id, action: `REVISION_${action}`, reason },
    });
    if (!approved) return;
    const postChanged = await tx.post.updateMany({
      where: {
        id: revision.postId,
        status: "PUBLISHED",
        currentVersion: revision.baseVersion,
      },
      data: {
        title: revision.title,
        body: revision.body,
        occurredOn: revision.occurredOn,
        currentVersion: version,
      },
    });
    if (postChanged.count !== 1)
      throw new HttpError(409, "公开版本已变化，未发布本次修改");
    await tx.postIssue.deleteMany({ where: { postId: revision.postId } });
    await tx.postIssue.createMany({
      data: storedIssues(revision.issueTypes).map((code) => ({
        postId: revision.postId,
        code,
      })),
    });
    await scheduleMaterialReviews(tx, revision.postId, version);
    const event = await tx.timelineEvent.create({
      data: {
        postId: revision.postId,
        revisionId: id,
        kind: "CORRECTION",
        title: `作者更正了经历（第 ${version} 版）`,
        body: revision.changeReason,
      },
    });
    const followers = await tx.follow.findMany({
      where: { postId: revision.postId },
    });
    if (followers.length)
      await tx.notification.createMany({
        data: followers.map((f) => ({ userId: f.userId, eventId: event.id })),
      });
  });
}

export async function hideHistoricalRevision(
  db: Database,
  id: string,
  actorId: string,
  reason: string,
) {
  return db.$transaction(async (tx) => {
    const revision = await tx.postRevision.findFirst({
      where: { id, status: "PUBLISHED", visible: true },
      include: { post: true },
    });
    if (!revision) throw new HttpError(409, "该历史版本不存在或已隐藏");
    if (revision.version === revision.post.currentVersion)
      throw new HttpError(
        409,
        "当前公开版本不能作为历史隐藏，请先处理当前内容",
      );
    await tx.postRevision.update({ where: { id }, data: { visible: false } });
    await tx.auditLog.create({
      data: { actorId, targetId: id, action: "HISTORY_HIDE", reason },
    });
  });
}
