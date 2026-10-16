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

export const publicMaterial = (m: Material, version = m.reviewVersion) => ({
  id: m.id,
  source: m.source,
  width: m.width,
  height: m.height,
  createdAt: m.createdAt.toISOString(),
  version,
});
export const ownMaterial = (m: Material) => ({
  ...publicMaterial(m),
  visibility: m.visibility,
  status: m.status,
  reason: m.reason,
  submittedVersion: m.submittedVersion,
});

export async function readableMaterialVersion(
  db: Pick<Database, "post" | "postRevision">,
  postId: string,
  requested?: number,
) {
  const post = await db.post.findFirst({
    where: { id: postId, status: "PUBLISHED" },
  });
  if (!post) throw new HttpError(404, "记录尚未公开");
  const version = requested ?? post.currentVersion;
  if (
    version !== post.currentVersion &&
    !(await db.postRevision.findFirst({
      where: { postId, version, status: "PUBLISHED", visible: true },
    }))
  )
    throw new HttpError(404, "该版本不存在或已限制公开");
  return version;
}

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
      const currentPost = await tx.post.findFirst({
        where: {
          id: postId,
          authorId: uploaderId,
          status: { in: ["PENDING", "PUBLISHED"] },
        },
      });
      if (!currentPost)
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
          where: {
            postId,
            status: { not: "WITHDRAWN" },
            OR: [
              { status: { in: ["PENDING", "APPROVED", "NEEDS_REVIEW"] } },
              { versions: { some: { status: "APPROVED" } } },
            ],
          },
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
          submittedVersion: currentPost.currentVersion,
          reviewVersion: currentPost.currentVersion,
          versions: { create: { version: currentPost.currentVersion } },
        },
      });
    });
    return result;
  } catch (e) {
    await Promise.all(keys.map((key) => files.remove(key)));
    throw e;
  }
}

export async function updateMaterialEvidence(
  tx: Prisma.TransactionClient,
  postId: string,
) {
  const post = await tx.post.findUniqueOrThrow({ where: { id: postId } });
  const count = await tx.materialVersion.count({
    where: {
      version: post.currentVersion,
      status: "APPROVED",
      material: { postId, status: { not: "WITHDRAWN" }, visibility: "PUBLIC" },
    },
  });
  // Independent corroboration is managed separately; raw upload counts cannot grant it.
  await tx.post.updateMany({
    where: { id: postId, evidence: { in: ["STATEMENT", "MATERIAL"] } },
    data: { evidence: count ? "MATERIAL" : "STATEMENT" },
  });
}

export async function scheduleMaterialReviews(
  tx: Prisma.TransactionClient,
  postId: string,
  version: number,
) {
  const items = await tx.material.findMany({
    where: {
      postId,
      status: { not: "WITHDRAWN" },
      OR: [
        { status: { in: ["PENDING", "APPROVED", "NEEDS_REVIEW"] } },
        { versions: { some: { status: "APPROVED" } } },
      ],
    },
  });
  for (const item of items) {
    await tx.materialVersion.updateMany({
      where: { materialId: item.id, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    });
    await tx.materialVersion.create({ data: { materialId: item.id, version } });
    await tx.material.update({
      where: { id: item.id },
      data: {
        reviewVersion: version,
        status: "NEEDS_REVIEW",
        reason: "正文已更正，需针对当前版本重新复核材料",
      },
    });
  }
  await updateMaterialEvidence(tx, postId);
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
      status: { in: ["PENDING", "NEEDS_REVIEW"] },
      post: { status: { in: ["PENDING", "PUBLISHED"] } },
    },
  });
  if (!item) throw new HttpError(409, "该材料已处理或无法审核");
  if (item.reviewVersion !== data.baseVersion)
    throw new HttpError(409, "待审核版本已变化，请刷新队列后重试");
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
          status: { in: ["PENDING", "NEEDS_REVIEW"] },
          reviewVersion: data.baseVersion,
          post: {
            status: { in: ["PENDING", "PUBLISHED"] },
            currentVersion: data.baseVersion,
          },
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
      const assessment = await tx.materialVersion.updateMany({
        where: { materialId: id, version: data.baseVersion, status: "PENDING" },
        data: {
          status: data.action === "APPROVE" ? "APPROVED" : "REJECTED",
          publicKey,
          reason: data.reason,
          reviewedAt: new Date(),
        },
      });
      if (assessment.count !== 1)
        throw new HttpError(409, "版本审核记录已变化，请刷新后重试");
      await tx.auditLog.create({
        data: {
          actorId,
          targetId: id,
          action: `MATERIAL_${data.action}`,
          reason: JSON.stringify({
            reason: data.reason,
            privacyChecked: data.privacyChecked,
            redactions: data.redactions,
            version: data.baseVersion,
          }),
        },
      });
      await updateMaterialEvidence(tx, item.postId);
      if (data.action === "APPROVE" && item.visibility === "PUBLIC") {
        const post = await tx.post.findUniqueOrThrow({
          where: { id: item.postId },
        });
        if (post.status === "PUBLISHED") {
          const event = await tx.timelineEvent.create({
            data: {
              postId: item.postId,
              title:
                item.status === "NEEDS_REVIEW"
                  ? `材料已完成第 ${data.baseVersion} 版复核`
                  : "新增一份公开材料",
              body: `材料已针对第 ${data.baseVersion} 版完成相关性与隐私检查，可在详情查看。材料通过不等于事实已被证实。`,
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
        status: { in: ["PENDING", "APPROVED", "REJECTED", "NEEDS_REVIEW"] },
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
    await updateMaterialEvidence(tx, item.postId);
    if (
      item.visibility === "PUBLIC" &&
      (await tx.materialVersion.count({
        where: { materialId: id, status: "APPROVED" },
      }))
    ) {
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
