import { Router } from "express";
import { z } from "zod";
import {
  paginationSchema,
  saveDraftSchema,
  draftSubmissionSchema,
} from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate } from "../auth.js";
import { HttpError } from "../http.js";
import { draftInclude, ownDraft, saveDraft, submitDraft } from "../drafts.js";

export function draftRoutes(db: Database) {
  const router = Router();
  router.use("/me/drafts", authenticate(db, true), (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.get("/me/drafts", async (req, res) => {
    const { page, limit } = paginationSchema
      .pick({ page: true, limit: true })
      .parse(req.query);
    const where = { authorId: res.locals.user.id };
    const payload = await db.$transaction(async (tx) => ({
      items: (
        await tx.postDraft.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          include: draftInclude,
        })
      ).map(ownDraft),
      total: await tx.postDraft.count({ where }),
      page,
    }));
    res.json(payload);
  });
  router.get("/me/drafts/:id", async (req, res) => {
    const draft = await db.postDraft.findFirst({
      where: {
        id: z.uuid().parse(req.params.id),
        authorId: res.locals.user.id,
      },
      include: draftInclude,
    });
    if (!draft) throw new HttpError(404, "找不到本人草稿");
    res.json(ownDraft(draft));
  });
  router.put("/me/drafts/:id", async (req, res) => {
    res.json(
      await saveDraft(
        db,
        res.locals.user.id,
        z.uuid().parse(req.params.id),
        saveDraftSchema.parse(req.body),
      ),
    );
  });
  router.post("/me/drafts/:id/submit", async (req, res) => {
    const { version } = draftSubmissionSchema.parse(req.body);
    res
      .status(201)
      .json(
        await submitDraft(
          db,
          res.locals.user.id,
          z.uuid().parse(req.params.id),
          version,
        ),
      );
  });
  return router;
}
