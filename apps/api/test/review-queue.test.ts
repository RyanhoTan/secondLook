import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-review-queue-"));
const db = openDatabase(`file:${join(dir, "test.db")}`),
  app = createApp(db);
let admin: string, author: string, authorId: string, subjectId: string;
const parents: string[] = [],
  shared = "same-id-across-review-tables";
const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
const queue = (query = "", token = admin) =>
  request(app).get(`/api/v1/admin/review-queue${query}`).set(auth(token));
const base = () => ({
  authorId,
  subjectId,
  title: "虚构审核标题",
  body: "虚构审核正文，不涉及真实对象或个人。",
  occurredOn: "2024-01-01",
});
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, "test.db")}` },
      stdio: "pipe",
    },
  );
  for (const name of ["admin", "author"]) {
    const u = await db.user.create({
      data: {
        username: `queue_${name}`,
        nickname: "内部昵称不应返回",
        passwordHash: "test-unused",
        role: name === "admin" ? "ADMIN" : "USER",
      },
    });
    const t = await issueSession(db, u.id);
    if (name === "admin") admin = t;
    else {
      author = t;
      authorId = u.id;
    }
  }
  subjectId = (
    await db.subject.create({
      data: { name: "后台分页虚构对象", city: "测试市", category: "OTHER" },
    })
  ).id;
  const linkedSubject = await db.subject.create({
    data: { name: "QueueSubjectNeedle", city: "测试市", category: "OTHER" },
  });
  await db.post.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      ...base(),
      id: `pending-${String(i).padStart(3, "0")}`,
      title: i === 0 ? "QueueTitleNeedle" : `虚构待审记录 ${i}`,
      body:
        i === 1
          ? "QueueBodyNeedle：仅用于验证正文检索"
          : "这是虚构的待审记录，用于长列表验证。",
      createdAt: new Date("2024-01-02"),
    })),
  });
  await db.post.create({
    data: { ...base(), id: shared, createdAt: new Date("2024-01-01") },
  });
  // Old SQLite DEFAULT timestamps can be text, while Prisma stores numeric milliseconds.
  await db.$executeRawUnsafe(
    'UPDATE "Post" SET "createdAt"=? WHERE id=?',
    "2024-01-01 00:00:00",
    shared,
  );
  for (let i = 0; i < 3; i++) {
    const p = await db.post.create({
      data: {
        ...base(),
        subjectId: linkedSubject.id,
        status: "PUBLISHED",
        publishedAt: new Date("2023-01-01"),
      },
    });
    parents.push(p.id);
    await db.progressUpdate.create({
      data: {
        id: i === 0 ? shared : `update-${i}`,
        postId: parents[0],
        title: `虚构待审进展 ${i}`,
        body: "待审进展正文",
        createdAt: new Date(i === 0 ? "2024-01-01" : "2024-01-03"),
      },
    });
    await db.postRevision.create({
      data: {
        id: i === 0 ? shared : `revision-${i}`,
        postId: p.id,
        pendingKey: p.id,
        baseVersion: 1,
        title: `虚构待审修订 ${i}`,
        body: "待审修订正文",
        occurredOn: "2024-02-01",
        occurredPrecision: "MONTH",
        occurredUntil: "2024-02-29",
        changeReason: "虚构修订原因",
        createdAt: new Date(i === 0 ? "2024-01-01" : "2024-01-04"),
      },
    });
  }
  const hidden = await db.post.create({
    data: { ...base(), status: "LIMITED" },
  });
  await db.progressUpdate.create({
    data: {
      postId: hidden.id,
      title: "受限帖子不可审核的进展",
      body: "不得进入队列",
    },
  });
  await db.postRevision.create({
    data: {
      postId: hidden.id,
      baseVersion: 1,
      pendingKey: hidden.id,
      title: "受限帖子不可审核的修订",
      body: "不得进入队列",
      occurredOn: "2024-01-01",
      changeReason: "虚构原因",
    },
  });
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("requires admin before validating filters and never exposes queue content to ordinary users", async () => {
  expect(
    (await request(app).get("/api/v1/admin/review-queue?page=bad")).status,
  ).toBe(401);
  const denied = await queue("?page=bad", author);
  expect(denied.status).toBe(403);
  expect(JSON.stringify(denied.body)).not.toContain("虚构待审");
  const own = await queue();
  expect(own.status).toBe(200);
  expect(own.headers["cache-control"]).toContain("no-store");
  expect(own.body.items).toHaveLength(12);
  expect(own.body.counts).toEqual({
    ALL: 127,
    POST: 121,
    UPDATE: 3,
    REVISION: 3,
  });
  expect(JSON.stringify(own.body)).not.toContain(authorId);
});

it("paginates the combined oldest-first queue past one hundred with stable cross-kind identity and timestamp formats", async () => {
  const rows: { kind: string; id: string }[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await queue(`?limit=50&page=${page}`);
    expect(result.body.total).toBe(127);
    expect(result.body.page).toBe(page);
    rows.push(...result.body.items);
  }
  expect(rows).toHaveLength(127);
  expect(new Set(rows.map((r) => `${r.kind}:${r.id}`)).size).toBe(127);
  expect(rows.slice(0, 3).map((r) => `${r.kind}:${r.id}`)).toEqual([
    `POST:${shared}`,
    `REVISION:${shared}`,
    `UPDATE:${shared}`,
  ]);
  expect(
    (await queue("?limit=50&page=2")).body.items.map(
      (r: { kind: string; id: string }) => `${r.kind}:${r.id}`,
    ),
  ).toEqual(rows.slice(50, 100).map((r) => `${r.kind}:${r.id}`));
  expect((await queue("?limit=50&page=4")).body).toMatchObject({
    items: [],
    total: 127,
  });
});

it("filters each kind while preserving query-scoped counts and precision-aware revision comparison", async () => {
  expect((await queue("?kind=POST&limit=50&page=3")).body.items).toHaveLength(
    21,
  );
  const revisions = (await queue("?kind=REVISION")).body;
  expect(revisions.total).toBe(3);
  expect(revisions.counts.ALL).toBe(127);
  expect(revisions.items[0]).toMatchObject({
    kind: "REVISION",
    occurredOn: "2024-02",
    occurredPrecision: "MONTH",
    occurredUntil: "",
    previous: { version: 1, occurredPrecision: "DAY" },
  });
  const legacy = await request(app).get("/api/v1/admin/reviews").set(auth());
  expect(Array.isArray(legacy.body)).toBe(true);
  expect(legacy.body).toHaveLength(106);
});

it("finds title/body/object substrings, treats SQL metacharacters literally and validates repeated/invalid input", async () => {
  for (const q of ["queuetitleneedle", "queuebodyneedle"])
    expect((await queue(`?q=${q}`)).body.total).toBe(1);
  const linked = await queue("?q=queuesubjectneedle&kind=UPDATE");
  expect(linked.body.total).toBe(3);
  expect(linked.body.counts).toEqual({
    ALL: 6,
    POST: 0,
    UPDATE: 3,
    REVISION: 3,
  });
  for (const q of ["' OR 1=1 --", "%", "_"])
    expect((await queue(`?q=${encodeURIComponent(q)}`)).body.total).toBe(0);
  for (const query of [
    "?kind=MATERIAL",
    "?kind=POST&kind=UPDATE",
    "?q=a&q=b",
    "?page=0",
    "?page=1&page=2",
    "?limit=51",
    `?q=${"a".repeat(101)}`,
  ])
    expect((await queue(query)).status, query).toBe(400);
});

it("refreshes the queue and counts after a decision without repeating publication events", async () => {
  const p = await db.post.create({
    data: { ...base(), title: "ApprovalCheckUnique" },
  });
  expect((await queue("?q=approvalcheckunique")).body.total).toBe(1);
  const decide = () =>
    request(app)
      .post(`/api/v1/admin/reviews/POST/${p.id}/decision`)
      .set(auth())
      .send({ action: "APPROVE", reason: "虚构队列审核" });
  expect((await decide()).status).toBe(204);
  expect((await decide()).status).toBe(409);
  expect((await queue("?q=approvalcheckunique")).body).toMatchObject({
    items: [],
    total: 0,
    counts: { ALL: 0 },
  });
  expect(await db.timelineEvent.count({ where: { postId: p.id } })).toBe(1);
  expect(await db.postRevision.count({ where: { postId: p.id } })).toBe(1);
});

it("excludes pending updates and revisions whose parent stops being public", async () => {
  await db.post.update({
    where: { id: parents[0] },
    data: { status: "LIMITED" },
  });
  try {
    expect((await queue()).body.counts).toEqual({
      ALL: 123,
      POST: 121,
      UPDATE: 0,
      REVISION: 2,
    });
  } finally {
    await db.post.update({
      where: { id: parents[0] },
      data: { status: "PUBLISHED" },
    });
  }
});
