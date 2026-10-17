import type { ReviewNotification } from "@secondlook/contracts";
import type { Prisma } from "./generated/prisma/client.js";

type Result = Pick<
  ReviewNotification,
  "postId" | "targetId" | "kind" | "version" | "decision" | "title" | "reason"
> & { userId: string; auditId: string };
// A review result belongs to its submitter and is never a public timeline event.
export async function notifyReviewResult(
  tx: Prisma.TransactionClient,
  result: Result,
) {
  await tx.reviewNotification.create({ data: result });
}
