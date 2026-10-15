import { Router } from "express";
import { decisionSchema } from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate, requireAdmin } from "../auth.js";
import { HttpError } from "../http.js";
import { reviewItem } from "../posts.js";
import { reviewRevision } from "../revisions.js";
export function adminRoutes(db: Database) {
  const router = Router();
  router.use("/admin", authenticate(db, true), requireAdmin);
  router.get("/admin/reviews", async (_req, res) => {
    const [posts, updates, revisions] = await db.$transaction([
      db.post.findMany({
        where: { status: "PENDING" },
        include: { subject: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      db.progressUpdate.findMany({
        where: { status: "PENDING", post: { status: "PUBLISHED" } },
        include: { post: { include: { subject: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      db.postRevision.findMany({
        where: { status: "PENDING", post: { status: "PUBLISHED" } },
        include: { post: { include: { subject: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
    ]);
    res.json([
      ...posts.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        kind: "POST",
        subjectName: p.subject.name,
        createdAt: p.createdAt.toISOString(),
      })),
      ...updates.map((u) => ({
        id: u.id,
        title: u.title,
        body: u.body,
        kind: "UPDATE",
        subjectName: u.post.subject.name,
        createdAt: u.createdAt.toISOString(),
      })),
      ...revisions.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        kind: "REVISION",
        changeReason: r.changeReason,
        occurredOn: r.occurredOn,
        subjectName: r.post.subject.name,
        createdAt: r.createdAt.toISOString(),
        previous: {
          title: r.post.title,
          body: r.post.body,
          occurredOn: r.post.occurredOn,
          version: r.post.currentVersion,
        },
      })),
    ]);
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
