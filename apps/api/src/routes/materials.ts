import { Router } from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import {
  materialLimits,
  materialReviewSchema,
  materialSchema,
} from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate, requireAdmin } from "../auth.js";
import { HttpError } from "../http.js";
import { MaterialFiles } from "../material-files.js";
import {
  ownMaterial,
  publicMaterial,
  reviewMaterial,
  uploadMaterial,
  withdrawMaterial,
} from "../materials.js";

export function materialRoutes(db: Database, files: MaterialFiles) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: materialLimits.maxBytes,
      files: 1,
      fields: 3,
      fieldSize: 2000,
      parts: 4,
    },
  });
  router.post(
    "/posts/:id/materials",
    authenticate(db, true),
    rateLimit({
      windowMs: 60000,
      limit: 30,
      keyGenerator: (_req, res) => res.locals.user.id,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    upload.single("file"),
    async (req, res) => {
      const data = materialSchema.parse(req.body);
      if (!req.file) throw new HttpError(400, "请选择一张图片");
      const item = await uploadMaterial(
        db,
        files,
        String(req.params.id),
        res.locals.user.id,
        data,
        req.file.buffer,
      );
      res.status(201).json(ownMaterial(item));
    },
  );
  router.get("/posts/:id/materials", async (req, res) => {
    const postId = String(req.params.id);
    if (
      !(await db.post.findFirst({ where: { id: postId, status: "PUBLISHED" } }))
    )
      throw new HttpError(404, "记录尚未公开");
    const items = await db.material.findMany({
      where: { postId, status: "APPROVED", visibility: "PUBLIC" },
      orderBy: { createdAt: "asc" },
    });
    res.json(items.map(publicMaterial));
  });
  router.get(
    "/me/posts/:id/materials",
    authenticate(db, true),
    async (req, res) => {
      const postId = String(req.params.id);
      if (
        !(await db.post.findFirst({
          where: { id: postId, authorId: res.locals.user.id },
        }))
      )
        throw new HttpError(404, "找不到本人记录");
      const items = await db.material.findMany({
        where: { postId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      });
      res.json(items.map(ownMaterial));
    },
  );
  router.get("/materials/:id/:variant", authenticate(db), async (req, res) => {
    const variant = String(req.params.variant);
    if (!["public", "original", "preview"].includes(variant))
      throw new HttpError(404, "图片不存在");
    const item = await db.material.findUnique({
      where: { id: String(req.params.id) },
      include: { post: { select: { status: true } } },
    });
    if (!item) throw new HttpError(404, "图片不存在");
    let key: string,
      mime = "image/webp";
    if (variant === "public") {
      if (
        item.status !== "APPROVED" ||
        item.visibility !== "PUBLIC" ||
        !item.publicKey ||
        item.post.status !== "PUBLISHED"
      )
        throw new HttpError(404, "图片尚未公开或已撤回");
      key = item.publicKey;
    } else {
      if (!res.locals.user) throw new HttpError(401, "请先登录");
      if (
        res.locals.user.id !== item.uploaderId &&
        res.locals.user.role !== "ADMIN"
      )
        throw new HttpError(404, "图片不存在");
      key = variant === "original" ? item.originalKey : item.previewKey;
      if (variant === "original") mime = item.mime;
      await db.auditLog.create({
        data: {
          actorId: res.locals.user.id,
          targetId: item.id,
          action:
            variant === "original"
              ? "MATERIAL_ORIGINAL_READ"
              : "MATERIAL_PREVIEW_READ",
          reason: "授权查看受限材料",
        },
      });
    }
    const bytes = await files.read(key);
    res
      .set({
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="material"',
      })
      .send(bytes);
  });
  router.delete("/materials/:id", authenticate(db, true), async (req, res) => {
    await withdrawMaterial(db, String(req.params.id), res.locals.user.id);
    res.status(204).end();
  });
  router.get(
    "/admin/materials",
    authenticate(db, true),
    requireAdmin,
    async (_req, res) => {
      const items = await db.material.findMany({
        where: {
          status: "PENDING",
          post: { status: { in: ["PENDING", "PUBLISHED"] } },
        },
        include: { post: { include: { subject: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      res.json(
        items.map((item) => ({
          ...ownMaterial(item),
          postId: item.postId,
          postTitle: item.post.title,
          subjectName: item.post.subject.name,
        })),
      );
    },
  );
  router.post(
    "/admin/materials/:id/decision",
    authenticate(db, true),
    requireAdmin,
    async (req, res) => {
      await reviewMaterial(
        db,
        files,
        String(req.params.id),
        res.locals.user.id,
        materialReviewSchema.parse(req.body),
      );
      res.status(204).end();
    },
  );
  return router;
}
