import { Router } from "express";
import {
  paginationSchema,
  postBrowseSchema,
  postSubmissionSchema,
  subjectSchema,
  updateSchema,
} from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate } from "../auth.js";
import { HttpError } from "../http.js";
import { submitPost } from "../submissions.js";
import {
  publicEventText,
  publicRevision,
  revisionSelect,
} from "../revisions.js";
import {
  postInclude,
  publicPost,
  publicSubject,
  publishedPost,
  subjectInclude,
  searchPosts,
} from "../posts.js";
export function communityRoutes(db: Database) {
  const router = Router();
  router.get("/subjects", async (req, res) => {
    const { q, category, city, page, limit } = paginationSchema.parse(
      req.query,
    );
    const where = {
      ...(q
        ? { OR: [{ name: { contains: q } }, { address: { contains: q } }] }
        : {}),
      ...(category ? { category } : {}),
      ...(city ? { city: { contains: city } } : {}),
    };
    const [items, total] = await db.$transaction([
      db.subject.findMany({
        where,
        include: subjectInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.subject.count({ where }),
    ]);
    res.json({ items: items.map(publicSubject), total, page });
  });
  router.get("/subjects/:id", authenticate(db), async (req, res) => {
    const payload = await db.$transaction(async (tx) => {
      const id = String(req.params.id);
      const subject = await tx.subject.findUnique({
        where: { id },
        include: subjectInclude,
      });
      if (!subject) throw new HttpError(404, "对象不存在");
      const following = res.locals.user
        ? await tx.subjectFollow.findUnique({
            where: {
              userId_subjectId: { userId: res.locals.user.id, subjectId: id },
            },
          })
        : null;
      return { ...publicSubject(subject), following: !!following };
    });
    res.json(payload);
  });
  router.put(
    "/subjects/:id/follow",
    authenticate(db, true),
    async (req, res) => {
      const subjectId = String(req.params.id),
        userId = res.locals.user.id;
      if (!(await db.subject.findUnique({ where: { id: subjectId } })))
        throw new HttpError(404, "对象不存在");
      await db.subjectFollow.upsert({
        where: { userId_subjectId: { userId, subjectId } },
        create: { userId, subjectId },
        update: {},
      });
      res.status(204).end();
    },
  );
  router.delete(
    "/subjects/:id/follow",
    authenticate(db, true),
    async (req, res) => {
      await db.subjectFollow.deleteMany({
        where: { userId: res.locals.user.id, subjectId: String(req.params.id) },
      });
      res.status(204).end();
    },
  );
  router.post("/subjects", authenticate(db, true), async (req, res) => {
    const data = subjectSchema.parse(req.body);
    const existing = await db.subject.findFirst({ where: data });
    if (existing) {
      res.json(publicSubject(existing));
      return;
    }
    res.status(201).json(publicSubject(await db.subject.create({ data })));
  });
  router.get("/posts", async (req, res) => {
    res.json(await searchPosts(db, postBrowseSchema.parse(req.query)));
  });
  router.get("/posts/:id", authenticate(db), async (req, res) => {
    const payload = await db.$transaction(async (tx) => {
      const post = await publishedPost(tx, String(req.params.id));
      const events = await tx.timelineEvent.findMany({
        where: { postId: post.id },
        include: { revision: { select: { visible: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const follow = res.locals.user
        ? await tx.follow.findUnique({
            where: {
              userId_postId: { userId: res.locals.user.id, postId: post.id },
            },
          })
        : null;
      return {
        ...publicPost(post),
        history: (
          await tx.postRevision.findMany({
            where: { postId: post.id, status: "PUBLISHED" },
            orderBy: { version: "desc" },
            select: revisionSelect,
          })
        ).map(publicRevision),
        following: !!follow,
        timeline: events.map((e) => ({
          id: e.id,
          ...publicEventText(e),
          kind: e.kind,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    });
    res.json(payload);
  });
  router.post("/posts", authenticate(db, true), async (req, res) => {
    const post = await submitPost(
      db,
      res.locals.user.id,
      postSubmissionSchema.parse(req.body),
    );
    res.status(201).json(post);
  });
  router.post(
    "/posts/:id/updates",
    authenticate(db, true),
    async (req, res) => {
      const post = await publishedPost(db, String(req.params.id));
      if (post.authorId !== res.locals.user.id)
        throw new HttpError(403, "只能为自己的经历补充进展");
      const data = updateSchema.parse(req.body);
      const update = await db.progressUpdate.create({
        data: { ...data, postId: post.id },
      });
      res.status(201).json({ id: update.id, status: update.status });
    },
  );
  router.put("/posts/:id/follow", authenticate(db, true), async (req, res) => {
    const post = await publishedPost(db, String(req.params.id));
    await db.follow.upsert({
      where: { userId_postId: { userId: res.locals.user.id, postId: post.id } },
      create: { userId: res.locals.user.id, postId: post.id },
      update: {},
    });
    res.status(204).end();
  });
  router.delete(
    "/posts/:id/follow",
    authenticate(db, true),
    async (req, res) => {
      await db.follow.deleteMany({
        where: { userId: res.locals.user.id, postId: String(req.params.id) },
      });
      res.status(204).end();
    },
  );
  router.get("/me/posts", authenticate(db, true), async (req, res) => {
    const { page, limit } = paginationSchema
      .pick({ page: true, limit: true })
      .parse(req.query);
    const where = { authorId: res.locals.user.id };
    const [posts, total] = await db.$transaction([
      db.post.findMany({
        where,
        include: { subject: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.post.count({ where }),
    ]);
    res.json({
      total,
      page,
      items: posts.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        reason: p.reason,
        subjectName: p.subject.name,
      })),
    });
  });
  router.get("/notifications", authenticate(db, true), async (_req, res) => {
    const notifications = await db.notification.findMany({
      where: {
        userId: res.locals.user.id,
        event: { post: { status: "PUBLISHED" } },
      },
      include: {
        event: {
          include: {
            revision: { select: { visible: true } },
            post: { select: { subject: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(
      notifications.map((n) => ({
        id: n.id,
        ...publicEventText(n.event),
        postId: n.event.postId,
        subjectName: n.event.post.subject.name,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
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
