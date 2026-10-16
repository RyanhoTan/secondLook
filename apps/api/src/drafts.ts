import type { z } from "zod";
import { postSchema, type saveDraftSchema } from "@secondlook/contracts";
import type { Database } from "./db.js";
import { HttpError } from "./http.js";
import { checkIssueCategory, storedIssues } from "./issues.js";
import { publicSubject, subjectInclude } from "./posts.js";
import { postDigest } from "./submissions.js";
import type { Prisma } from "./generated/prisma/client.js";

export const draftInclude = { subject: { include: subjectInclude } } as const;
type DraftRow = Prisma.PostDraftGetPayload<{ include: typeof draftInclude }>;
export const ownDraft = (d: DraftRow) => ({
  id: d.id,
  title: d.title,
  body: d.body,
  subjectId: d.subjectId,
  occurredOn: d.occurredOn,
  issueTypes: storedIssues(d.issueTypes),
  anonymous: d.anonymous,
  personalExperience: d.personalExperience,
  version: d.version,
  postId: d.postId,
  updatedAt: d.updatedAt.toISOString(),
  subject: d.subject ? publicSubject(d.subject) : null,
});

export async function saveDraft(
  db: Database,
  authorId: string,
  id: string,
  input: z.infer<typeof saveDraftSchema>,
) {
  const { version, mutationKey, ...content } = input;
  return db.$transaction(async (tx) => {
    const existing = await tx.postDraft.findUnique({
      where: { id },
      include: draftInclude,
    });
    if (existing && existing.authorId !== authorId)
      throw new HttpError(404, "找不到本人草稿");
    if (existing?.mutationKey === mutationKey) {
      if (
        !Object.entries(content).every(
          ([k, value]) =>
            JSON.stringify(
              k === "issueTypes"
                ? storedIssues(existing.issueTypes)
                : existing[k as keyof typeof content],
            ) === JSON.stringify(value),
        )
      )
        throw new HttpError(409, "保存标识已用于另一份内容，请重新读取草稿");
      return ownDraft(existing);
    }
    if ((existing?.version ?? 0) !== version || existing?.postId)
      throw new HttpError(
        409,
        "草稿已在其他地方修改或提交，请重新读取；当前输入仍保留",
      );
    if (
      content.subjectId &&
      !(await tx.subject.findUnique({ where: { id: content.subjectId } }))
    )
      throw new HttpError(404, "选择的对象已不存在，请重新选择");
    const draft = existing
      ? await tx.postDraft.update({
          where: { id, version, AND: [{ postId: null }] },
          data: { ...content, mutationKey, version: { increment: 1 } },
          include: draftInclude,
        })
      : await tx.postDraft.create({
          data: { ...content, id, authorId, mutationKey },
          include: draftInclude,
        });
    return ownDraft(draft);
  });
}

export async function submitDraft(
  db: Database,
  authorId: string,
  id: string,
  version: number,
) {
  return db.$transaction(async (tx) => {
    const draft = await tx.postDraft.findFirst({ where: { id, authorId } });
    if (!draft) throw new HttpError(404, "找不到本人草稿");
    if (draft.postId) {
      return tx.post.findUniqueOrThrow({
        where: { id: draft.postId },
        select: { id: true, status: true },
      });
    }
    if (draft.version !== version)
      throw new HttpError(409, "草稿版本已变化，请重新读取后确认内容");
    const checked = postSchema.parse(draft);
    const subject = await tx.subject.findUniqueOrThrow({
      where: { id: checked.subjectId },
    });
    checkIssueCategory(subject.category, checked.issueTypes);
    const {
      personalExperience: _declaration,
      issueTypes,
      ...content
    } = checked;
    const post = await tx.post.create({
      data: {
        ...content,
        issues: { create: issueTypes.map((code) => ({ code })) },
        authorId,
        submissionKey: `draft:${id}`,
        submissionDigest: postDigest(checked),
      },
      select: { id: true, status: true },
    });
    await tx.postDraft.update({
      where: { id, version, AND: [{ postId: null }] },
      data: { postId: post.id },
    });
    return post;
  });
}
