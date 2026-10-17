import { Router } from "express";
import { decisionSchema, reviewQueueSchema } from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate, requireAdmin } from "../auth.js";
import { HttpError } from "../http.js";
import { reviewItem } from "../posts.js";
import { reviewRevision } from "../revisions.js";
import {
  reviewDtos,
  reviewPostInclude,
  reviewLinkedInclude,
  reviewQueue,
} from "../review-queue.js";
export function adminRoutes(db: Database) {
  const router = Router();
  router.use("/admin", authenticate(db, true), requireAdmin);
  router.get("/admin/review-queue", async (req, res) => {
    res.json(await reviewQueue(db, reviewQueueSchema.parse(req.query)));
  });
  router.get("/admin/reviews", async (_req, res) => {
    const [posts, updates, revisions] = await db.$transaction([
      db.post.findMany({
        where: { status: "PENDING" },
        include: reviewPostInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      }),
      db.progressUpdate.findMany({
        where: { status: "PENDING", post: { status: "PUBLISHED" } },
        include: reviewLinkedInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      }),
      db.postRevision.findMany({
        where: { status: "PENDING", post: { status: "PUBLISHED" } },
        include: reviewLinkedInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      }),
    ]);
    res.json(reviewDtos(posts, updates, revisions));
  });
  router.post("/admin/reviews/:kind/:id/decision", async (req, res) => {
    const { action, reason } = decisionSchema.parse(req.body);
    const kind = String(req.params.kind);
    if (kind !== "POST" && kind !== "UPDATE" && kind !== "REVISION")
      throw new HttpError(400, "审核类型无效");
    if (kind === "REVISION") {
      await reviewRevision(
        db,
        String(req.params.id),
        action,
        reason,
        res.locals.user.id,
      );
      res.status(204).end();
      return;
    }
    await reviewItem(
      db,
      String(req.params.id),
      kind,
      action,
      reason,
      res.locals.user.id,
    );
    res.status(204).end();
  });
  return router;
}
