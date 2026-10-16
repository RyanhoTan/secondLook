import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-follow-list-"));
const db = openDatabase(`file:${join(dir, "test.db")}`),
  app = createApp(db);
let token: string, empty: string, userId: string, hiddenId: string;
const subjects: string[] = [],
  posts: string[] = [];
const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
const list = (query = "", value = token) =>
  request(app).get(`/api/v1/me/follows${query}`).set(auth(value));
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, "test.db")}` },
      stdio: "pipe",
    },
  );
  const user = await db.user.create({
    data: {
      username: "following_owner",
      nickname: "不可出现在订阅 DTO 的昵称",
      passwordHash: "test-unused",
    },
  });
  userId = user.id;
  token = await issueSession(db, user.id);
  const second = await db.user.create({
    data: {
      username: "following_other",
      nickname: "other",
      passwordHash: "test-unused",
    },
  });
  empty = await issueSession(db, second.id);
  for (let i = 0; i < 15; i++) {
    const s = await db.subject.create({
      data: {
        name: `虚构关注对象 ${i}`,
        city: "测试市",
        address: `虚构路 ${i} 号`,
        category: "OTHER",
      },
    });
    subjects.push(s.id);
    await db.subjectFollow.create({
      data: { userId, subjectId: s.id, createdAt: new Date("2024-01-01") },
    });
    const p = await db.post.create({
      data: {
        subjectId: s.id,
        authorId: userId,
        title: i === 0 ? "受限标题不能出现在关注响应" : `公开虚构经历 ${i}`,
        body: "内部正文不会出现在关注列表。",
        occurredOn: "2024-01-01",
        status: i === 0 ? "LIMITED" : "PUBLISHED",
        anonymous: true,
        publishedAt: new Date("2024-01-01"),
      },
    });
    posts.push(p.id);
    if (i === 0) hiddenId = p.id;
    await db.follow.create({ data: { userId, postId: p.id } });
  }
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("requires a current session, ignores attempted account selection and returns only safe target DTOs", async () => {
  expect((await request(app).get("/api/v1/me/follows?page=0")).status).toBe(
    401,
  );
  expect((await list("", "unknown")).status).toBe(401);
  const own = await list("?limit=50&userId=some-other-user");
  expect(own.status).toBe(200);
  expect(own.headers["cache-control"]).toContain("no-store");
  expect(own.body.total).toBe(15);
  const text = JSON.stringify(own.body);
  for (const privateValue of [
    userId,
    "passwordHash",
    "受限标题不能出现在关注响应",
    "内部正文",
    "不可出现在订阅 DTO 的昵称",
  ])
    expect(text).not.toContain(privateValue);
  expect(
    own.body.items.find(
      (item: { targetId: string }) => item.targetId === hiddenId,
    ),
  ).toEqual({ target: "POST", targetId: hiddenId, available: false });
  expect((await list(`?userId=${userId}`, empty)).body).toMatchObject({
    total: 0,
    items: [],
  });
});

it("paginates both target kinds stably with correct per-account totals, including zero-public-count objects", async () => {
  for (const target of ["POST", "SUBJECT"]) {
    const all = await list(`?target=${target}&limit=50`),
      found: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const result = await list(`?target=${target}&limit=3&page=${page}`);
      expect(result.body.total).toBe(15);
      expect(result.body.page).toBe(page);
      found.push(
        ...result.body.items.map((item: { targetId: string }) => item.targetId),
      );
    }
    expect(found).toEqual(
      all.body.items.map((item: { targetId: string }) => item.targetId),
    );
    expect(new Set(found).size).toBe(15);
    const outside = await list(`?target=${target}&limit=3&page=6`);
    expect(outside.body.items).toEqual([]);
    expect(outside.body.total).toBe(15);
  }
  const result = await list("?target=SUBJECT&limit=50");
  expect(
    result.body.items.find(
      (item: { targetId: string }) => item.targetId === subjects[0],
    ).subject.postCount,
  ).toBe(0);
});

it("allows removal of an unavailable followed post without revealing it or changing independent object subscriptions", async () => {
  expect(
    (
      await request(app)
        .delete(`/api/v1/posts/${hiddenId}/follow`)
        .set(auth(empty))
    ).status,
  ).toBe(204);
  expect((await list()).body.total).toBe(15);
  expect(
    (await request(app).delete(`/api/v1/posts/${hiddenId}/follow`).set(auth()))
      .status,
  ).toBe(204);
  expect(
    (await list("?limit=50")).body.items.map(
      (item: { targetId: string }) => item.targetId,
    ),
  ).not.toContain(hiddenId);
  expect((await list()).body.total).toBe(14);
  expect((await list("?target=SUBJECT")).body.total).toBe(15);
});

it("reflects published title changes and conceals newly restricted targets on the next read", async () => {
  const id = posts[1];
  await db.post.update({
    where: { id },
    data: { title: "当前公开的更正标题" },
  });
  expect(
    (await list("?limit=50")).body.items.find(
      (item: { targetId: string }) => item.targetId === id,
    ).title,
  ).toBe("当前公开的更正标题");
  await db.post.update({ where: { id }, data: { status: "LIMITED" } });
  expect(
    (await list("?limit=50")).body.items.find(
      (item: { targetId: string }) => item.targetId === id,
    ),
  ).toEqual({ target: "POST", targetId: id, available: false });
});

it("rejects unknown target kinds, repeated numeric parameters and invalid page sizes", async () => {
  for (const query of [
    "?target=USER",
    "?target=POST&target=SUBJECT",
    "?page=0",
    "?limit=51",
    "?page=1&page=2",
    "?limit=3&limit=4",
    "?limit=bad",
  ])
    expect((await list(query)).status, query).toBe(400);
  const expired = await issueSession(db, userId);
  const { tokenHash } = await import("../src/auth.js");
  await db.session.update({
    where: { tokenHash: tokenHash(expired) },
    data: { expiresAt: new Date(0) },
  });
  expect((await list("", expired)).status).toBe(401);
});
