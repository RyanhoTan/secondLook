import type { Prisma } from "./generated/prisma/client.js";

// Called in the same publication transaction. A user following both targets gets one event.
export async function notifyFollowers(
  tx: Prisma.TransactionClient,
  postId: string,
  eventId: string,
) {
  const post = await tx.post.findFirst({
    where: { id: postId, status: "PUBLISHED" },
    select: { subjectId: true },
  });
  if (!post) return;
  const recipients = await tx.user.findMany({
    where: {
      OR: [
        { follows: { some: { postId } } },
        { subjectFollows: { some: { subjectId: post.subjectId } } },
      ],
    },
    select: { id: true },
  });
  if (recipients.length)
    await tx.notification.createMany({
      data: recipients.map(({ id: userId }) => ({ userId, eventId })),
    });
}
