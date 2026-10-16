import { Router } from "express";
import { historyVisibilitySchema, revisionSchema } from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate, requireAdmin } from "../auth.js";
import { HttpError } from "../http.js";
import { postIssues, storedIssues } from "../issues.js";
import { hideHistoricalRevision, submitRevision } from "../revisions.js";

export function revisionRoutes(db: Database) {
  const router = Router();
  router.get(
    "/me/posts/:id/revisions",
    authenticate(db, true),
    async (req, res) => {
      const post = await db.post.findFirst({
        where: {
          id: String(req.params.id),
          authorId: res.locals.user.id,
          status: "PUBLISHED",
        },
        select: {
          id: true,
          title: true,
          body: true,
          occurredOn: true,
          currentVersion: true,
          issues: true,
          subject: { select: { category: true } },
          revisions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              title: true,
              body: true,
              occurredOn: true,
              issueTypes: true,
              changeReason: true,
              status: true,
              reviewReason: true,
            },
          },
        },
      });
      if (!post) throw new HttpError(404, "找不到可修改的本人公开记录");
      const { revisions, issues, subject, ...content } = post;
      res.json({
        post: {
          ...content,
          issueTypes: postIssues(issues),
          category: subject.category,
        },
        latestRevision: revisions[0]
          ? {
              ...revisions[0],
              issueTypes: storedIssues(revisions[0].issueTypes),
            }
          : null,
      });
    },
  );
  router.post(
    "/posts/:id/revisions",
    authenticate(db, true),
    async (req, res) => {
      const revision = await submitRevision(
        db,
        String(req.params.id),
        res.locals.user.id,
        revisionSchema.parse(req.body),
      );
      res.status(201).json({ id: revision.id, status: revision.status });
    },
  );
  router.post(
    "/admin/history/:id/hide",
    authenticate(db, true),
    requireAdmin,
    async (req, res) => {
      const { reason } = historyVisibilitySchema.parse(req.body);
      await hideHistoricalRevision(
        db,
        String(req.params.id),
        res.locals.user.id,
        reason,
      );
      res.status(204).end();
    },
  );
  return router;
}
