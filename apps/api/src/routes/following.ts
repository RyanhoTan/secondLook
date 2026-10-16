import { Router } from "express";
import { followingQuerySchema, type Following } from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate } from "../auth.js";
import { publicSubject, subjectInclude } from "../posts.js";

export function followingRoutes(db: Database) {
  const router = Router();
  router.get("/me/follows", authenticate(db, true), async (req, res) => {
    const { target, page, limit } = followingQuerySchema.parse(req.query);
    const where = { userId: res.locals.user.id };
    const pagination = {
      orderBy: { id: "desc" as const },
      skip: (page - 1) * limit,
      take: limit,
    };
    const result = await db.$transaction(async (tx) => {
      if (target === "SUBJECT") {
        const rows = await tx.subjectFollow.findMany({
          where,
          ...pagination,
          include: { subject: { include: subjectInclude } },
        });
        return {
          items: rows.map((row): Following => ({
            target: "SUBJECT",
            targetId: row.subjectId,
            subject: publicSubject(row.subject),
          })),
          total: await tx.subjectFollow.count({ where }),
          page,
        };
      }
      const rows = await tx.follow.findMany({
        where,
        ...pagination,
        select: {
          postId: true,
          post: {
            select: {
              title: true,
              status: true,
              subject: { include: subjectInclude },
            },
          },
        },
      });
      return {
        items: rows.map((row): Following =>
          row.post.status === "PUBLISHED"
            ? {
                target: "POST",
                targetId: row.postId,
                available: true,
                title: row.post.title,
                subject: publicSubject(row.post.subject),
              }
            : { target: "POST", targetId: row.postId, available: false },
        ),
        total: await tx.follow.count({ where }),
        page,
      };
    });
    res.json(result);
  });
  return router;
}
