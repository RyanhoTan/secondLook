import type { z } from "zod";
import type {
  materialSchema,
  materialReviewSchema,
} from "@secondlook/contracts";
import { materialLimits } from "@secondlook/contracts";
import type { Database } from "./db.js";
import type { Material, Prisma } from "./generated/prisma/client.js";
import { HttpError } from "./http.js";
import { MaterialFiles, prepareImage } from "./material-files.js";

export const publicMaterial = (m: Material) => ({
  id: m.id,
  source: m.source,
  width: m.width,
  height: m.height,
  createdAt: m.createdAt.toISOString(),
});
export const ownMaterial = (m: Material) => ({
  ...publicMaterial(m),
  visibility: m.visibility,
  status: m.status,
  reason: m.reason,
});

export async function uploadMaterial(
  db: Database,
  files: MaterialFiles,
  postId: string,
  uploaderId: string,
  data: z.infer<typeof materialSchema>,
  bytes: Buffer,
) {
  const post = await db.post.findFirst({
    where: {
      id: postId,
      authorId: uploaderId,
      status: { in: ["PENDING", "PUBLISHED"] },
    },
  });
  if (!post) throw new HttpError(404, "只能为自己待审或公开的经历上传材料");
  const image = await prepareImage(bytes);
  const keys: string[] = [];
  try {
    const result = await db.$transaction(async (tx) => {
      if (
        !(await tx.post.findFirst({
          where: {
            id: postId,
            authorId: uploaderId,
            status: { in: ["PENDING", "PUBLISHED"] },
          },
        }))
      )
        throw new HttpError(404, "记录状态已变化，无法继续上传");
      const duplicate = await tx.material.findUnique({
        where: {
          uploaderId_clientKey: { uploaderId, clientKey: data.clientKey },
        },
      });
      if (duplicate) {
        if (duplicate.status === "WITHDRAWN" || duplicate.status === "REJECTED")
          throw new HttpError(
            409,
            "该次上传已撤回或被拒绝，请重新选择图片后提交",
          );
        if (
          duplicate.postId !== postId ||
          duplicate.digest !== image.digest ||
          duplicate.source !== data.source ||
          duplicate.visibility !== data.visibility
        )
          throw new HttpError(409, "上传标识已用于另一份材料，请重新选择图片");
        return duplicate;
      }
      if (
        (await tx.material.count({
          where: { postId, status: { in: ["PENDING", "APPROVED"] } },
        })) >= materialLimits.maxPerPost
      )
        throw new HttpError(409, "每条经历最多保留 6 份待审或通过的材料");
      const originalKey = await files.save(bytes);
      keys.push(originalKey);
      const previewKey = await files.save(image.preview);
      keys.push(previewKey);
      return tx.material.create({
        data: {
          ...data,
          postId,
          uploaderId,
          originalKey,
          previewKey,
          digest: image.digest,
          mime: image.mime,
          width: image.width,
          height: image.height,
          size: bytes.length,
        },
      });
    });
    return result;
  } catch (e) {
    await Promise.all(keys.map((key) => files.remove(key)));
    throw e;
  }
}

async function updateEvidence(tx: Prisma.TransactionClient, postId: string) {
  const count = await tx.material.count({
    where: { postId, status: "APPROVED", visibility: "PUBLIC" },
  });
  // Independent corroboration is managed separately; raw upload counts cannot grant it.
  await tx.post.updateMany({
    where: { id: postId, evidence: { in: ["STATEMENT", "MATERIAL"] } },
    data: { evidence: count ? "MATERIAL" : "STATEMENT" },
  });
}

export async function reviewMaterial(
  db: Database,
  files: MaterialFiles,
  id: string,
  actorId: string,
  data: z.infer<typeof materialReviewSchema>,
) {
  const item = await db.material.findFirst({
    where: {
      id,
      status: "PENDING",
      post: { status: { in: ["PENDING", "PUBLISHED"] } },
    },
  });
  if (!item) throw new HttpError(409, "该材料已处理或无法审核");
  let publicKey: string | null = null;
  try {
    if (data.action === "APPROVE" && item.visibility === "PUBLIC") {
      publicKey = await files.save(
        await files.redacted(
          item.previewKey,
          item.width,
          item.height,
          data.redactions,
        ),
      );
    }
    await db.$transaction(async (tx) => {
      const changed = await tx.material.updateMany({
        where: {
          id,
          status: "PENDING",
          post: { status: { in: ["PENDING", "PUBLISHED"] } },
        },
        data: {
          status: data.action === "APPROVE" ? "APPROVED" : "REJECTED",
          publicKey,
          reason: data.reason,
          reviewedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new HttpError(409, "材料已处理，请刷新审核队列");
      await tx.auditLog.create({
        data: {
          actorId,
          targetId: id,
          action: `MATERIAL_${data.action}`,
          reason: JSON.stringify({
            reason: data.reason,
            privacyChecked: data.privacyChecked,
            redactions: data.redactions,
          }),
        },
      });
      await updateEvidence(tx, item.postId);
      if (data.action === "APPROVE" && item.visibility === "PUBLIC") {
        const post = await tx.post.findUniqueOrThrow({
          where: { id: item.postId },
        });
        if (post.status === "PUBLISHED") {
          const event = await tx.timelineEvent.create({
            data: {
              postId: item.postId,
              title: "新增一份公开材料",
              body: "材料已通过相关性与隐私检查，可在详情查看。材料通过不等于事实已被证实。",
              kind: "MATERIAL_APPROVED",
            },
          });
          const follows = await tx.follow.findMany({
            where: { postId: item.postId },
          });
          if (follows.length)
            await tx.notification.createMany({
              data: follows.map((f) => ({
                userId: f.userId,
                eventId: event.id,
              })),
            });
        }
      }
    });
  } catch (e) {
    if (publicKey) await files.remove(publicKey);
    throw e;
  }
}

export async function withdrawMaterial(
  db: Database,
  id: string,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    const item = await tx.material.findFirst({
      where: {
        id,
        uploaderId: userId,
        status: { in: ["PENDING", "APPROVED", "REJECTED"] },
      },
    });
    if (!item) throw new HttpError(404, "材料不存在或已撤回");
    await tx.material.update({ where: { id }, data: { status: "WITHDRAWN" } });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        targetId: id,
        action: "MATERIAL_WITHDRAW",
        reason: "提交者撤回材料",
      },
    });
    await updateEvidence(tx, item.postId);
    if (item.status === "APPROVED" && item.visibility === "PUBLIC") {
      const event = await tx.timelineEvent.create({
        data: {
          postId: item.postId,
          title: "作者撤回了一份公开材料",
          body: "材料不再公开，当前标签已重新评估。撤回本身不代表原经历失实。",
          kind: "MATERIAL_WITHDRAWAL",
        },
      });
      const follows = await tx.follow.findMany({
        where: { postId: item.postId },
      });
      if (follows.length)
        await tx.notification.createMany({
          data: follows.map((f) => ({ userId: f.userId, eventId: event.id })),
        });
    }
  });
}
