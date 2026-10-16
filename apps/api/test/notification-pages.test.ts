import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession, tokenHash } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-notification-pages-"));
const db = openDatabase(`file:${join(dir, "test.db")}`),
  app = createApp(db);
let token: string,
  other: string,
  userId: string,
  otherId: string,
  postId: string,
  hiddenEventId: string;
const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
const page = (page = 1, limit = 50, value = token) =>
  request(app)
    .get(`/api/v1/me/notifications?page=${page}&limit=${limit}`)
    .set(auth(value));
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, "test.db")}` },
      stdio: "pipe",
    },
  );
  for (const name of ["owner", "other"]) {
    const user = await db.user.create({
      data: {
        username: `notice_${name}`,
        nickname: "内部账号信息",
        passwordHash: "test-unused",
      },
    });
    const t = await issueSession(db, user.id);
    if (name === "owner") {
      userId = user.id;
      token = t;
    } else {
      otherId = user.id;
      other = t;
    }
  }
  const subject = await db.subject.create({
    data: { name: "虚构通知分页对象", city: "测试市", category: "OTHER" },
  });
  const post = await db.post.create({
    data: {
      subjectId: subject.id,
      authorId: userId,
      title: "当前虚构公开经历",
      body: "不应进入通知 DTO 的正文",
      anonymous: true,
      occurredOn: "2024-01-01",
      status: "PUBLISHED",
      currentVersion: 2,
    },
  });
  postId = post.id;
  const revision = await db.postRevision.create({
    data: {
      postId,
      version: 1,
      baseVersion: 1,
      title: "被隐藏的修订标题",
      body: "被隐藏的修订正文",
      changeReason: "被隐藏的修订理由",
      occurredOn: "2024-01-01",
      status: "PUBLISHED",
      visible: false,
      publishedAt: new Date("2024-01-01"),
    },
  });
  const events = Array.from({ length: 120 }, (_, i) => ({
    id: randomUUID(),
    postId,
    title: `虚构通知 ${i}`,
    body: `虚构重要进展 ${i}`,
    kind: "AUTHOR_UPDATE",
  }));
  await db.timelineEvent.createMany({ data: events });
  await db.notification.createMany({
    data: events.map((e) => ({
      userId,
      eventId: e.id,
      createdAt: new Date("2024-01-01"),
    })),
  });
  const hidden = await db.timelineEvent.create({
    data: {
      postId,
      revisionId: revision.id,
      title: "旧更正副本标题",
      body: "旧更正副本理由",
      kind: "CORRECTION",
    },
  });
  hiddenEventId = hidden.id;
  await db.notification.create({
    data: { userId, eventId: hidden.id, createdAt: new Date("2025-01-01") },
  });
  await db.notification.create({
    data: { userId: otherId, eventId: events[0].id },
  });
  const restricted = await db.post.create({
    data: {
      subjectId: subject.id,
      authorId: userId,
      title: "受限帖标题",
      body: "受限帖正文",
      occurredOn: "2024-01-01",
      status: "LIMITED",
    },
  });
  const event = await db.timelineEvent.create({
    data: {
      postId: restricted.id,
      title: "受限通知不能出现",
      body: "受限通知正文",
      kind: "AUTHOR_UPDATE",
    },
  });
  await db.notification.create({ data: { userId, eventId: event.id } });
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("reads beyond one hundred notifications with stable tied-time pagination and public-only totals", async () => {
  const items: { id: string }[] = [];
  for (let n = 1; n <= 3; n++) {
    const result = await page(n);
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(121);
    expect(result.body.page).toBe(n);
    expect(result.body.items).toHaveLength(n < 3 ? 50 : 21);
    items.push(...result.body.items);
  }
  expect(new Set(items.map((n) => n.id)).size).toBe(121);
  expect((await page(2)).body.items.map((n: { id: string }) => n.id)).toEqual(
    items.slice(50, 100).map((n) => n.id),
  );
  expect((await page(4)).body).toMatchObject({ items: [], total: 121 });
  const legacy = await request(app).get("/api/v1/notifications").set(auth());
  expect(legacy.body).toHaveLength(100);
  expect(legacy.body.map((n: { id: string }) => n.id)).toEqual(
    items.slice(0, 100).map((n) => n.id),
  );
});

it("keeps ownership, cache protection, anonymous identity and hidden revision text intact", async () => {
  const result = await page();
  expect(result.headers["cache-control"]).toContain("no-store");
  const text = JSON.stringify(result.body);
  for (const secret of [
    userId,
    otherId,
    "内部账号信息",
    "旧更正副本标题",
    "旧更正副本理由",
    "不应进入通知 DTO",
    "受限通知",
  ])
    expect(text).not.toContain(secret);
  expect(result.body.items[0]).toMatchObject({
    title: "历史更正已隐藏",
    subjectName: "虚构通知分页对象",
    postId,
  });
  expect((await page(1, 50, other)).body.total).toBe(1);
  const spoofed = await request(app)
    .get(`/api/v1/me/notifications?userId=${otherId}`)
    .set(auth());
  expect(spoofed.body.total).toBe(121);
  expect(
    await db.notification.count({ where: { userId, eventId: hiddenEventId } }),
  ).toBe(1);
});

it("marks an older-page item read idempotently without reordering pages or altering another account", async () => {
  const before = (await page(3)).body.items;
  const id = before[0].id;
  expect(
    (
      await request(app)
        .patch(`/api/v1/notifications/${id}/read`)
        .set(auth(other))
    ).status,
  ).toBe(404);
  expect((await page(3)).body.items[0].read).toBe(false);
  for (let n = 0; n < 2; n++)
    expect(
      (await request(app).patch(`/api/v1/notifications/${id}/read`).set(auth()))
        .status,
    ).toBe(204);
  const after = (await page(3)).body.items;
  expect(after.map((n: { id: string }) => n.id)).toEqual(
    before.map((n: { id: string }) => n.id),
  );
  expect(after[0].read).toBe(true);
  expect(after[1].read).toBe(false);
  expect((await page(1, 50, other)).body.items[0].read).toBe(false);
});

it("removes all notification content and totals when its post stops being public, without deleting records", async () => {
  await db.post.update({ where: { id: postId }, data: { status: "LIMITED" } });
  try {
    expect((await page()).body).toMatchObject({ items: [], total: 0 });
    expect(
      (await request(app).get("/api/v1/notifications").set(auth())).body,
    ).toEqual([]);
    expect(await db.notification.count({ where: { userId } })).toBe(122);
  } finally {
    await db.post.update({
      where: { id: postId },
      data: { status: "PUBLISHED" },
    });
  }
});

it("rejects unauthenticated/expired requests and invalid or repeated pagination values", async () => {
  expect(
    (await request(app).get("/api/v1/me/notifications?page=0")).status,
  ).toBe(401);
  const expired = await issueSession(db, userId);
  await db.session.update({
    where: { tokenHash: tokenHash(expired) },
    data: { expiresAt: new Date(0) },
  });
  expect((await page(1, 12, expired)).status).toBe(401);
  for (const query of [
    "page=0",
    "page=10001",
    "page=1&page=2",
    "limit=1&limit=2",
    "limit=51",
    "limit=bad",
  ])
    expect(
      (await request(app).get(`/api/v1/me/notifications?${query}`).set(auth()))
        .status,
      query,
    ).toBe(400);
  expect(
    (await request(app).get("/api/v1/me/notifications").set(auth())).body.items,
  ).toHaveLength(12);
});
