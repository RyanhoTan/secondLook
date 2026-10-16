import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hashPassword, issueSession } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-test-"));
const url = `file:${join(dir, "test.db")}`;
const db = openDatabase(url);
const app = createApp(db);
let authorToken: string,
  readerToken: string,
  adminToken: string,
  authorId: string,
  subjectId: string,
  postId: string,
  updateId: string,
  notificationId: string;
const draft = {
  title: "这是一条测试亲历记录",
  body: "这是一段仅用于自动测试的虚构经历，描述发生的事情以及具体的问题。",
  occurredOn: "2026-01-01",
  anonymous: true,
  personalExperience: true,
};
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  const admin = await db.user.create({
    data: {
      username: "admin_test",
      nickname: "管理员",
      role: "ADMIN",
      passwordHash: await hashPassword("test-password-2026"),
    },
  });
  adminToken = await issueSession(db, admin.id);
  const author = await request(app).post("/api/v1/auth/register").send({
    username: "author_test",
    nickname: "不得公开的昵称",
    password: "test-password-2026",
    role: "ADMIN",
  });
  expect(author.status).toBe(201);
  expect(author.body.user.role).toBe("USER");
  authorToken = author.body.token;
  authorId = author.body.user.id;
  const reader = await request(app).post("/api/v1/auth/register").send({
    username: "reader_test",
    nickname: "读者",
    password: "test-password-2026",
  });
  readerToken = reader.body.token;
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
describe("local community workflow and privacy boundaries", () => {
  it("exposes health but requires authentication and administrator permissions", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    expect((await request(app).post("/api/v1/subjects").send({})).status).toBe(
      401,
    );
    expect(
      (await request(app).get("/api/v1/admin/reviews").set(auth(authorToken)))
        .status,
    ).toBe(403);
  });
  it("stores hashed passwords and session tokens rather than raw secrets", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: authorId } });
    expect(user.passwordHash).not.toContain("test-password");
    expect(
      await db.session.findUnique({ where: { tokenHash: authorToken } }),
    ).toBeNull();
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ username: "author_test", password: "wrong-password" })
      ).status,
    ).toBe(401);
  });
  it("creates an object and deduplicates exact matches", async () => {
    const data = {
      name: "虚构测试饭店",
      category: "RESTAURANT",
      city: "测试市",
      address: "测试路",
    };
    const first = await request(app)
      .post("/api/v1/subjects")
      .set(auth(authorToken))
      .send(data);
    expect(first.status).toBe(201);
    subjectId = first.body.id;
    const second = await request(app)
      .post("/api/v1/subjects")
      .set(auth(authorToken))
      .send(data);
    expect(second.body.id).toBe(subjectId);
  });
  it("rejects invalid dates, future dates, missing declarations and invalid pagination", async () => {
    for (const patch of [
      { occurredOn: "2026-02-30" },
      { occurredOn: "2999-01-01" },
      { personalExperience: false },
    ])
      expect(
        (
          await request(app)
            .post("/api/v1/posts")
            .set(auth(authorToken))
            .send({ ...draft, clientKey: randomUUID(), subjectId, ...patch })
        ).status,
      ).toBe(400);
    expect((await request(app).get("/api/v1/posts?limit=10000")).status).toBe(
      400,
    );
  });
  it("keeps pending posts out of public search, detail and object counts", async () => {
    const created = await request(app)
      .post("/api/v1/posts")
      .set(auth(authorToken))
      .send({ ...draft, clientKey: randomUUID(), subjectId });
    expect(created.status).toBe(201);
    postId = created.body.id;
    expect((await request(app).get("/api/v1/posts")).body.total).toBe(0);
    expect((await request(app).get(`/api/v1/posts/${postId}`)).status).toBe(
      404,
    );
    expect(
      (await request(app).get(`/api/v1/subjects/${subjectId}`)).body.postCount,
    ).toBe(0);
  });
  it("publishes a reviewed post and records the review audit", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
      .set(auth(adminToken))
      .send({ action: "APPROVE", reason: "测试审核通过" });
    expect(res.status).toBe(204);
    expect(await db.auditLog.count({ where: { targetId: postId } })).toBe(1);
    expect(
      (await request(app).get("/api/v1/posts?q=测试饭店")).body.total,
    ).toBe(1);
  });
  it("does not expose anonymous account identifiers through public endpoints", async () => {
    for (const path of ["/api/v1/posts", `/api/v1/posts/${postId}`]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(authorId);
      expect(text).not.toContain("不得公开的昵称");
      expect(text).not.toContain("passwordHash");
    }
    const detail = (await request(app).get(`/api/v1/posts/${postId}`)).body;
    expect(detail.authorName).toBe("匿名亲历者");
    expect(detail.evidence).toBe("STATEMENT");
  });
  it("rejects repeated review decisions without duplicate public events", async () => {
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
          .set(auth(adminToken))
          .send({ action: "APPROVE", reason: "重复审核" })
      ).status,
    ).toBe(409);
    expect(await db.timelineEvent.count({ where: { postId } })).toBe(1);
  });
  it("allows only the author to submit progress updates", async () => {
    const data = {
      title: "作者报告已退款",
      body: "这是测试中的后续更新，退款不代表原经历失实。",
    };
    expect(
      (
        await request(app)
          .post(`/api/v1/posts/${postId}/updates`)
          .set(auth(readerToken))
          .send(data)
      ).status,
    ).toBe(403);
    const res = await request(app)
      .post(`/api/v1/posts/${postId}/updates`)
      .set(auth(authorToken))
      .send(data);
    expect(res.status).toBe(201);
    updateId = res.body.id;
    expect(
      JSON.stringify(
        (await request(app).get(`/api/v1/posts/${postId}`)).body.timeline,
      ),
    ).not.toContain("已退款");
  });
  it("follows idempotently and notifies once when an update is approved", async () => {
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(app)
            .put(`/api/v1/posts/${postId}/follow`)
            .set(auth(readerToken))
        ).status,
      ).toBe(204);
    expect(await db.follow.count()).toBe(1);
    const path = `/api/v1/admin/reviews/UPDATE/${updateId}/decision`;
    expect(
      (
        await request(app)
          .post(path)
          .set(auth(adminToken))
          .send({ action: "APPROVE", reason: "进展审核通过" })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .post(path)
          .set(auth(adminToken))
          .send({ action: "APPROVE", reason: "重复操作" })
      ).status,
    ).toBe(409);
    const notifications = (
      await request(app).get("/api/v1/notifications").set(auth(readerToken))
    ).body;
    expect(notifications).toHaveLength(1);
    notificationId = notifications[0].id;
    expect(notifications[0].title).toBe("作者报告已退款");
    const detail = (await request(app).get(`/api/v1/posts/${postId}`)).body;
    expect(detail.evidence).toBe("STATEMENT");
    expect(detail.body).toBe(draft.body);
  });
  it("scopes notification access to the recipient", async () => {
    expect(
      (await request(app).get("/api/v1/notifications").set(auth(authorToken)))
        .body,
    ).toHaveLength(0);
    expect(
      (
        await request(app)
          .patch(`/api/v1/notifications/${notificationId}/read`)
          .set(auth(authorToken))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/v1/notifications/${notificationId}/read`)
          .set(auth(readerToken))
      ).status,
    ).toBe(204);
  });
  it("stops future notifications after unfollowing", async () => {
    expect(
      (
        await request(app)
          .delete(`/api/v1/posts/${postId}/follow`)
          .set(auth(readerToken))
      ).status,
    ).toBe(204);
    const update = await request(app)
      .post(`/api/v1/posts/${postId}/updates`)
      .set(auth(authorToken))
      .send({
        title: "新的补充",
        body: "取消关注以后不应该再收到这条补充通知。",
      });
    await request(app)
      .post(`/api/v1/admin/reviews/UPDATE/${update.body.id}/decision`)
      .set(auth(adminToken))
      .send({ action: "APPROVE", reason: "再次审核通过" });
    expect(await db.notification.count()).toBe(1);
  });
  it("keeps rejected posts private and provides the author the reason", async () => {
    const created = await request(app)
      .post("/api/v1/posts")
      .set(auth(authorToken))
      .send({
        ...draft,
        clientKey: randomUUID(),
        subjectId,
        title: "这条内容被拒绝公开",
      });
    await request(app)
      .post(`/api/v1/admin/reviews/POST/${created.body.id}/decision`)
      .set(auth(adminToken))
      .send({ action: "REJECT", reason: "请补充具体经过" });
    expect(
      (await request(app).get(`/api/v1/posts/${created.body.id}`)).status,
    ).toBe(404);
    const own = (
      await request(app).get("/api/v1/me/posts").set(auth(authorToken))
    ).body;
    expect(
      own.items.find((p: { id: string }) => p.id === created.body.id).reason,
    ).toBe("请补充具体经过");
  });
  it("revokes the session on logout", async () => {
    expect(
      (await request(app).post("/api/v1/auth/logout").set(auth(authorToken)))
        .status,
    ).toBe(204);
    expect(
      (await request(app).get("/api/v1/me").set(auth(authorToken))).status,
    ).toBe(401);
  });
});
