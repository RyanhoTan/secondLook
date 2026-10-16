import { Router } from "express";
import {
  privatePaginationSchema,
  type Notification,
  type Page,
  type PrivatePagination,
} from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate } from "../auth.js";
import { HttpError } from "../http.js";
import { publicEventText } from "../revisions.js";

export function notificationRoutes(db: Database) {
  const router = Router();
  async function pageFor(
    userId: string,
    query: PrivatePagination,
  ): Promise<Page<Notification>> {
    const where = { userId, event: { post: { status: "PUBLISHED" } } };
    return db.$transaction(async (tx) => {
      const rows = await tx.notification.findMany({
        where,
        include: {
          event: {
            include: {
              revision: { select: { visible: true } },
              post: { select: { subject: { select: { name: true } } } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      return {
        items: rows.map((n) => ({
          id: n.id,
          ...publicEventText(n.event),
          postId: n.event.postId,
          subjectName: n.event.post.subject.name,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })),
        total: await tx.notification.count({ where }),
        page: query.page,
      };
    });
  }
  router.get("/me/notifications", authenticate(db, true), async (req, res) => {
    res.json(
      await pageFor(
        res.locals.user.id,
        privatePaginationSchema.parse(req.query),
      ),
    );
  });
  // Legacy array endpoint remains for older callers; current Web/App use the complete paginated API.
  router.get("/notifications", authenticate(db, true), async (_req, res) => {
    res.json(
      (await pageFor(res.locals.user.id, { page: 1, limit: 100 })).items,
    );
  });
  router.patch(
    "/notifications/:id/read",
    authenticate(db, true),
    async (req, res) => {
      const result = await db.notification.updateMany({
        where: { id: String(req.params.id), userId: res.locals.user.id },
        data: { read: true },
      });
      if (!result.count) throw new HttpError(404, "通知不存在");
      res.status(204).end();
    },
  );
  return router;
}
