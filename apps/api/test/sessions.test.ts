import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hashPassword, issueSession, tokenHash } from "../src/auth.js";
import { MaterialFiles } from "../src/material-files.js";
import sharp from "sharp";

const dir = mkdtempSync(join(tmpdir(), "secondlook-sessions-"));
const url = `file:${join(dir, "test.db")}`,
  uploads = join(dir, "uploads");
const db = openDatabase(url),
  app = createApp(db, { uploadRoot: uploads });
const instant = Date.parse("2026-10-16T02:00:00.000Z");
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let userId: string,
  adminId: string,
  subjectId: string,
  postId: string,
  materialId: string,
  draftId: string;
let token: string, adminToken: string, image: Buffer;
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  userId = (
    await db.user.create({
      data: {
        username: "session_author",
        nickname: "私有昵称",
        passwordHash: await hashPassword("test-session-2026"),
      },
    })
  ).id;
  adminId = (
    await db.user.create({
      data: {
        username: "session_admin",
        nickname: "管理员",
        passwordHash: "unused-test-only",
        role: "ADMIN",
      },
    })
  ).id;
  subjectId = (
    await db.subject.create({
      data: { name: "会话测试虚构单位", category: "OTHER", city: "测试市" },
    })
  ).id;
  postId = (
    await db.post.create({
      data: {
        authorId: userId,
        subjectId,
        title: "会话测试中的虚构公开经历",
        body: "这是一条用于验证会话过期后公开与受限访问边界的虚构经历。",
        occurredOn: "2026-01-01",
        anonymous: true,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    })
  ).id;
  image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const files = new MaterialFiles(uploads),
    originalKey = await files.save(image),
    previewKey = await files.save(image);
  materialId = (
    await db.material.create({
      data: {
        postId,
        uploaderId: userId,
        clientKey: randomUUID(),
        source: "会话测试的私有材料说明。",
        visibility: "REVIEW_ONLY",
        originalKey,
        previewKey,
        digest: "test-only",
        mime: "image/png",
        width: 8,
        height: 8,
        size: image.length,
      },
    })
  ).id;
  draftId = randomUUID();
  await db.postDraft.create({
    data: {
      id: draftId,
      authorId: userId,
      subjectId,
      title: "私有未发布草稿",
      body: "不应被过期会话读取",
      occurredOn: "",
      anonymous: true,
      personalExperience: false,
      mutationKey: randomUUID(),
    },
  });
}, 30000);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instant);
  await db.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
  token = await issueSession(db, userId);
  adminToken = await issueSession(db, adminId);
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
const expire = (value = token, at = instant - 1) =>
  db.session.update({
    where: { tokenHash: tokenHash(value) },
    data: { expiresAt: new Date(at) },
  });

it("issues independent seven-day sessions and keeps authenticated reads out of caches", async () => {
  const session = await db.session.findUniqueOrThrow({
    where: { tokenHash: tokenHash(token) },
  });
  expect(session.expiresAt.getTime()).toBe(instant + 7 * 86400000);
  expect(session.tokenHash).not.toBe(token);
  expect(token).not.toBe(await issueSession(db, userId));
  const me = await request(app).get("/api/v1/me").set(auth(token));
  expect(me.status).toBe(200);
  expect(me.headers["cache-control"]).toBe("private, no-store");
  const original = await request(app)
    .get(`/api/v1/materials/${materialId}/original`)
    .set(auth(token));
  expect(original.status).toBe(200);
  expect(original.body).toEqual(image);
});
it("rejects a session at its exact expiry instant, while one millisecond remains valid", async () => {
  await expire(token, instant + 1);
  expect((await request(app).get("/api/v1/me").set(auth(token))).status).toBe(
    200,
  );
  vi.setSystemTime(instant + 1);
  expect((await request(app).get("/api/v1/me").set(auth(token))).status).toBe(
    401,
  );
});
it("blocks expired access to all implemented private reading surfaces before disclosing content", async () => {
  await expire();
  await expire(adminToken);
  for (const path of [
    "/me",
    "/me/posts",
    "/notifications",
    "/me/drafts",
    `/me/drafts/${draftId}`,
    `/me/posts/${postId}/revisions`,
    `/me/posts/${postId}/materials`,
    `/materials/${materialId}/original`,
    `/materials/${materialId}/preview`,
    "/admin/reviews",
    "/admin/materials",
    `/posts/${postId}`,
  ]) {
    const result = await request(app)
      .get(`/api/v1${path}`)
      .set(auth(path.startsWith("/admin") ? adminToken : token));
    expect(result.status, path).toBe(401);
    expect(result.headers["cache-control"], path).toBe("private, no-store");
    expect(JSON.stringify(result.body)).not.toContain("私有未发布草稿");
    expect(result.headers["content-type"]).toContain("application/json");
  }
});
it("rejects expired writes before validation with no content, follow or audit side effects", async () => {
  await expire();
  await expire(adminToken);
  const before = [
    await db.post.count(),
    await db.postDraft.count(),
    await db.auditLog.count(),
    await db.follow.count(),
    await db.progressUpdate.count(),
    await db.postRevision.count(),
  ];
  const writes = [
    ["post", "/auth/logout"],
    ["post", "/subjects"],
    ["post", "/posts"],
    ["put", `/me/drafts/${randomUUID()}`],
    ["post", `/me/drafts/${draftId}/submit`],
    ["post", `/posts/${postId}/updates`],
    ["post", `/posts/${postId}/revisions`],
    ["post", `/posts/${postId}/materials`],
    ["put", `/posts/${postId}/follow`],
    ["delete", `/posts/${postId}/follow`],
    ["delete", `/materials/${materialId}`],
    ["patch", "/notifications/missing/read"],
    ["post", `/admin/reviews/POST/${postId}/decision`],
    ["post", `/admin/materials/${materialId}/decision`],
    ["post", "/admin/history/missing/hide"],
  ] as const;
  for (const [method, path] of writes)
    expect(
      (
        await request(app)
          [method](`/api/v1${path}`)
          .set(auth(path.startsWith("/admin") ? adminToken : token))
          .send({})
      ).status,
      path,
    ).toBe(401);
  expect([
    await db.post.count(),
    await db.postDraft.count(),
    await db.auditLog.count(),
    await db.follow.count(),
    await db.progressUpdate.count(),
    await db.postRevision.count(),
  ]).toEqual(before);
});
it("rejects unknown, malformed and revoked credentials on protected routes", async () => {
  await db.session.delete({ where: { tokenHash: tokenHash(token) } });
  for (const header of [
    `Bearer ${token}`,
    "Bearer unknown-token",
    "Basic wrong",
    "Bearer",
    "Bearer ",
  ]) {
    expect(
      (
        await request(app)
          .get(`/api/v1/me/drafts/${draftId}`)
          .set("Authorization", header)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/v1/materials/${materialId}/original`)
          .set("Authorization", header)
      ).status,
    ).toBe(401);
  }
});
it("revokes only the logged-out session while another login remains usable", async () => {
  const other = await issueSession(db, userId);
  expect(
    (await request(app).post("/api/v1/auth/logout").set(auth(token))).status,
  ).toBe(204);
  expect((await request(app).get("/api/v1/me").set(auth(token))).status).toBe(
    401,
  );
  expect(
    (await request(app).get(`/api/v1/me/drafts/${draftId}`).set(auth(other)))
      .status,
  ).toBe(200);
  expect(
    await db.session.findUnique({ where: { tokenHash: tokenHash(token) } }),
  ).toBeNull();
});
it("reads the current account role on every request instead of trusting an old administrator session", async () => {
  expect(
    (await request(app).get("/api/v1/admin/reviews").set(auth(adminToken)))
      .status,
  ).toBe(200);
  await db.user.update({ where: { id: adminId }, data: { role: "USER" } });
  expect(
    (await request(app).get("/api/v1/admin/reviews").set(auth(adminToken)))
      .status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
        .set(auth(adminToken))
        .send({ action: "APPROVE", reason: "降权后不得执行审核" })
    ).status,
  ).toBe(403);
  expect(
    (await request(app).get("/api/v1/me").set(auth(adminToken))).body.role,
  ).toBe("USER");
});
it("continues anonymous public reading after expiry without exposing private identity", async () => {
  await expire();
  const publicResult = await request(app).get(`/api/v1/posts/${postId}`);
  expect(publicResult.status).toBe(200);
  expect(publicResult.body.authorName).toBe("匿名亲历者");
  expect(JSON.stringify(publicResult.body)).not.toContain(userId);
  expect(
    (await request(app).get(`/api/v1/materials/${materialId}/public`)).status,
  ).toBe(404);
});
it("marks registration and login token responses as non-cacheable", async () => {
  const registered = await request(app).post("/api/v1/auth/register").send({
    username: "cache_test_user",
    nickname: "缓存测试",
    password: "test-session-2026",
  });
  expect(registered.status).toBe(201);
  expect(registered.headers["cache-control"]).toBe("private, no-store");
  const loggedIn = await request(app)
    .post("/api/v1/auth/login")
    .send({ username: "session_author", password: "test-session-2026" });
  expect(loggedIn.status).toBe(200);
  expect(loggedIn.headers["cache-control"]).toBe("private, no-store");
});
