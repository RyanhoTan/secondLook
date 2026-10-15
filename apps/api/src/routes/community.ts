import { Router } from "express";
import {
  paginationSchema,
  postSchema,
  subjectSchema,
  updateSchema,
} from "@secondlook/contracts";
import type { Database } from "../db.js";
import { authenticate } from "../auth.js";
import { HttpError } from "../http.js";
import {
  postInclude,
  publicPost,
  publicSubject,
  publishedPost,
  subjectInclude,
} from "../posts.js";
export function communityRoutes(db: Database) {
  const router = Router();
  router.get("/subjects", async (req, res) => {
    const { q, category, city, page, limit } = paginationSchema.parse(
      req.query,
    );
    const where = {
      ...(q ? { name: { contains: q } } : {}),
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
  router.get("/subjects/:id", async (req, res) => {
    const subject = await db.subject.findUnique({
      where: { id: String(req.params.id) },
      include: subjectInclude,
    });
    if (!subject) throw new HttpError(404, "对象不存在");
    res.json(publicSubject(subject));
  });
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
    const { q, category, city, page, limit } = paginationSchema.parse(
      req.query,
    );
    const subjectId =
      typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
    const where = {
      status: "PUBLISHED",
      ...(subjectId ? { subjectId } : {}),
      ...(category || city
        ? {
            subject: {
              ...(category ? { category } : {}),
              ...(city ? { city: { contains: city } } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { body: { contains: q } },
              { subject: { name: { contains: q } } },
            ],
          }
        : {}),
    };
    const [items, total] = await db.$transaction([
      db.post.findMany({
        where,
        include: postInclude,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.post.count({ where }),
    ]);
    res.json({ items: items.map(publicPost), total, page });
  });
  router.get("/posts/:id", authenticate(db), async (req, res) => {
    const post = await publishedPost(db, String(req.params.id));
    const events = await db.timelineEvent.findMany({
      where: { postId: post.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const follow = res.locals.user
      ? await db.follow.findUnique({
          where: {
            userId_postId: { userId: res.locals.user.id, postId: post.id },
          },
        })
      : null;
    res.json({
      ...publicPost(post),
      following: !!follow,
      timeline: events.map((e) => ({
        id: e.id,
        title: e.title,
        body: e.body,
        kind: e.kind,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });
  router.post("/posts", authenticate(db, true), async (req, res) => {
    const { personalExperience, ...data } = postSchema.parse(req.body);
    if (!(await db.subject.findUnique({ where: { id: data.subjectId } })))
      throw new HttpError(404, "请先选择有效对象");
    const post = await db.post.create({
      data: { ...data, authorId: res.locals.user.id },
    });
    res.status(201).json({ id: post.id, status: post.status });
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
  router.get("/me/posts", authenticate(db, true), async (_req, res) => {
    const posts = await db.post.findMany({
      where: { authorId: res.locals.user.id },
      include: { subject: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      posts.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        reason: p.reason,
        subjectName: p.subject.name,
      })),
    );
  });
  router.get("/notifications", authenticate(db, true), async (_req, res) => {
    const notifications = await db.notification.findMany({
      where: { userId: res.locals.user.id },
      include: { event: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(
      notifications.map((n) => ({
        id: n.id,
        title: n.event.title,
        body: n.event.body,
        postId: n.event.postId,
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
