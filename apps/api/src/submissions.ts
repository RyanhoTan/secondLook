import { createHash } from "node:crypto";
import type { PostSubmission } from "@secondlook/contracts";
import type { Database } from "./db.js";
import { HttpError } from "./http.js";
import type { z } from "zod";
import type { postSchema } from "@secondlook/contracts";

export function postDigest(data: z.infer<typeof postSchema>) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        data.subjectId,
        data.title,
        data.body,
        data.occurredOn,
        data.anonymous,
      ]),
    )
    .digest("hex");
}

export async function submitPost(
  db: Database,
  authorId: string,
  { clientKey, personalExperience: _declaration, ...data }: PostSubmission,
) {
  // Keep the initial request digest immutable when the published text is revised.
  const digest = postDigest({ ...data, personalExperience: true });
  const where = {
    authorId_submissionKey: { authorId, submissionKey: clientKey },
  };
  const replay = (post: {
    id: string;
    status: string;
    submissionDigest: string | null;
  }) => {
    if (post.submissionDigest !== digest)
      throw new HttpError(409, "本次提交已用于另一份内容，请先确认原投稿结果");
    return { id: post.id, status: post.status };
  };
  const existing = await db.post.findUnique({ where });
  if (existing) return replay(existing);
  try {
    return await db.$transaction(async (tx) => {
      if (!(await tx.subject.findUnique({ where: { id: data.subjectId } })))
        throw new HttpError(404, "请先选择有效对象");
      const post = await tx.post.create({
        data: {
          ...data,
          authorId,
          submissionKey: clientKey,
          submissionDigest: digest,
        },
      });
      return { id: post.id, status: post.status };
    });
  } catch (error) {
    // A second request can win between the initial read and the unique insert.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await db.post.findUnique({ where });
      if (winner) return replay(winner);
    }
    throw error;
  }
}
