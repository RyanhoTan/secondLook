import { Router } from "express";
import { decisionSchema } from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate, requireAdmin } from "../auth.js";
import { HttpError } from "../http.js";
import { reviewItem } from "../posts.js";
export function adminRoutes(db: Database) {
  const router = Router();
  router.use("/admin", authenticate(db, true), requireAdmin);
  router.get("/admin/reviews", async (_req, res) => {
    const [posts, updates] = await db.$transaction([
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
    ]);
  });
  router.post("/admin/reviews/:kind/:id/decision", async (req, res) => {
    const { action, reason } = decisionSchema.parse(req.body);
    const kind = String(req.params.kind);
    if (kind !== "POST" && kind !== "UPDATE")
      throw new HttpError(400, "审核类型无效");
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
