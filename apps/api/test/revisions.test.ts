import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hashPassword, issueSession } from "../src/auth.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-revisions-"));
const url = `file:${join(dir, "test.db")}`;
const db = openDatabase(url);
const app = createApp(db);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let author: string,
  admin: string,
  reader: string,
  authorId: string,
  readerId: string,
  subjectId: string,
  postId: string;
const original = {
  title: "测试原文：这是第一次公开的记录",
  body: "测试原文中的虚构经历，仅供验证修订流程，原始细节尚未更正。",
  occurredOn: "2026-01-01",
  anonymous: true,
  personalExperience: true,
};
const correction = {
  title: "测试更正：重新核对后的经历记录",
  body: "测试更正中的虚构经历，重新核对发生时间与经过后，修正原文的具体细节。",
  occurredOn: "2026-01-02",
  changeReason: "核对记录后修正发生时间与经过。",
  baseVersion: 1,
};
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const role of ["author", "admin", "reader"]) {
    const user = await db.user.create({
      data: {
        username: `revision_${role}`,
        nickname: `内部昵称_${role}`,
        role: role === "admin" ? "ADMIN" : "USER",
        passwordHash: await hashPassword("test-only-password"),
      },
    });
    const token = await issueSession(db, user.id);
    if (role === "author") {
      author = token;
      authorId = user.id;
    } else if (role === "admin") admin = token;
    else {
      reader = token;
      readerId = user.id;
    }
  }
  const subject = await db.subject.create({
    data: { name: "修订测试虚构对象", category: "OTHER", city: "测试市" },
  });
  subjectId = subject.id;
}, 30000);
beforeEach(async () => {
  const created = await request(app)
    .post("/api/v1/posts")
    .set(auth(author))
    .send({ ...original, clientKey: randomUUID(), subjectId });
  postId = created.body.id;
  expect((await decide("POST", postId, "APPROVE")).status).toBe(204);
  await request(app).put(`/api/v1/posts/${postId}/follow`).set(auth(reader));
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
const submit = (patch = {}) =>
  request(app)
    .post(`/api/v1/posts/${postId}/revisions`)
    .set(auth(author))
    .send({ ...correction, ...patch });
const detail = () => request(app).get(`/api/v1/posts/${postId}`);
const decide = (kind: string, id: string, action: string) =>
  request(app)
    .post(`/api/v1/admin/reviews/${kind}/${id}/decision`)
    .set(auth(admin))
    .send({ action, reason: "虚构案例审核说明" });

describe("reviewed corrections, version privacy and atomic publication", () => {
  it("creates the initial public snapshot without exposing account fields", async () => {
    const { body } = await detail();
    expect(body.currentVersion).toBe(1);
    expect(body.correction).toBeNull();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].body).toBe(original.body);
    expect(JSON.stringify(body)).not.toContain(authorId);
    expect(JSON.stringify(body)).not.toContain("内部昵称_author");
  });
  it("requires the author for editing and admin for reviewing or hiding history", async () => {
    const path = `/api/v1/posts/${postId}/revisions`;
    expect((await request(app).post(path).send(correction)).status).toBe(401);
    expect(
      (await request(app).post(path).set(auth(reader)).send(correction)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/api/v1/me/posts/${postId}/revisions`)
          .set(auth(reader))
      ).status,
    ).toBe(404);
    const created = await submit();
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/reviews/REVISION/${created.body.id}/decision`)
          .set(auth(author))
          .send({ action: "APPROVE", reason: "试图越权审核" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/history/${created.body.id}/hide`)
          .set(auth(reader))
          .send({ reason: "试图越权隐藏" })
      ).status,
    ).toBe(403);
  });
  it("validates changed content, explanation, dates and optimistic version", async () => {
    for (const patch of [
      { changeReason: "" },
      { occurredOn: "2999-01-01" },
      { occurredOn: "2026-02-30" },
      { baseVersion: 0 },
    ])
      expect((await submit(patch)).status).toBe(400);
    expect(
      (
        await submit({
          title: original.title,
          body: original.body,
          occurredOn: original.occurredOn,
        })
      ).status,
    ).toBe(400);
    expect((await submit({ baseVersion: 2 })).status).toBe(409);
  });
  it("isolates pending changes from search, history, timeline and notifications", async () => {
    const created = await submit();
    expect(created.status).toBe(201);
    expect((await submit()).status).toBe(409);
    const publicData = (await detail()).body;
    expect(publicData.body).toBe(original.body);
    expect(publicData.history).toHaveLength(1);
    expect(JSON.stringify(publicData)).not.toContain(correction.title);
    expect(
      (await request(app).get("/api/v1/posts?q=测试更正")).body.items.map(
        (p: { id: string }) => p.id,
      ),
    ).not.toContain(postId);
    expect(await db.notification.count({ where: { event: { postId } } })).toBe(
      0,
    );
    const own = await request(app)
      .get(`/api/v1/me/posts/${postId}/revisions`)
      .set(auth(author));
    expect(own.body.latestRevision.body).toBe(correction.body);
    const queue = await request(app)
      .get("/api/v1/admin/reviews")
      .set(auth(admin));
    const item = queue.body.find(
      (r: { id: string }) => r.id === created.body.id,
    );
    expect(item.previous.body).toBe(original.body);
    expect(item.changeReason).toBe(correction.changeReason);
  });
  it("publishes one immutable version, synchronizes public results and notifies once", async () => {
    const created = await submit();
    expect((await decide("REVISION", created.body.id, "APPROVE")).status).toBe(
      204,
    );
    expect((await decide("REVISION", created.body.id, "APPROVE")).status).toBe(
      409,
    );
    const publicData = (await detail()).body;
    expect(publicData.currentVersion).toBe(2);
    expect(publicData.title).toBe(correction.title);
    expect(
      publicData.history.map((r: { version: number }) => r.version),
    ).toEqual([2, 1]);
    expect(publicData.history[1].body).toBe(original.body);
    expect(publicData.correction.reason).toBe(correction.changeReason);
    expect(publicData.evidence).toBe("STATEMENT");
    for (const query of [`q=测试更正`, `subjectId=${subjectId}`]) {
      const found = (
        await request(app).get(`/api/v1/posts?${query}&limit=50`)
      ).body.items.find((p: { id: string }) => p.id === postId);
      expect(found.title).toBe(correction.title);
      expect(found.correction.reason).toBe(correction.changeReason);
    }
    expect(
      await db.notification.count({
        where: { userId: readerId, event: { postId } },
      }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { targetId: created.body.id, action: "REVISION_APPROVE" },
      }),
    ).toBe(1);
    expect((await submit({ baseVersion: 1 })).status).toBe(409);
  });
  it("keeps rejected revisions private and permits an adjusted resubmission", async () => {
    const created = await submit();
    expect((await decide("REVISION", created.body.id, "REJECT")).status).toBe(
      204,
    );
    const own = await request(app)
      .get(`/api/v1/me/posts/${postId}/revisions`)
      .set(auth(author));
    expect(own.body.latestRevision.status).toBe("REJECTED");
    expect(own.body.latestRevision.reviewReason).toBe("虚构案例审核说明");
    expect((await detail()).body.history).toHaveLength(1);
    expect(await db.notification.count({ where: { event: { postId } } })).toBe(
      0,
    );
    const retry = await submit({
      changeReason: "补充核对依据后重新提交更正。",
    });
    expect(retry.status).toBe(201);
    expect((await decide("REVISION", retry.body.id, "APPROVE")).status).toBe(
      204,
    );
    expect((await detail()).body.currentVersion).toBe(2);
  });
  it("rejects corrections to nonpublic posts and does not review after restriction", async () => {
    const created = await submit();
    await db.post.update({
      where: { id: postId },
      data: { status: "RESTRICTED" },
    });
    expect((await submit()).status).toBe(404);
    expect((await detail()).status).toBe(404);
    expect((await decide("REVISION", created.body.id, "APPROVE")).status).toBe(
      409,
    );
  });
  it("rolls back text, version, event and audit together if publishing fails", async () => {
    const created = await submit();
    // Fail inside the publication transaction rather than merely asserting transaction syntax.
    const originalTransaction = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((
      fn: (tx: unknown) => unknown,
    ) =>
      originalTransaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, prop) {
            if (prop === "timelineEvent")
              return {
                ...target.timelineEvent,
                create: () => {
                  throw new Error("simulated event failure");
                },
              };
            return Reflect.get(target, prop);
          },
        });
        return fn(proxy);
      })) as typeof db.$transaction);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        (await decide("REVISION", created.body.id, "APPROVE")).status,
      ).toBe(500);
    } finally {
      spy.mockRestore();
      consoleSpy.mockRestore();
    }
    const post = await db.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.currentVersion).toBe(1);
    expect(post.body).toBe(original.body);
    expect(
      (
        await db.postRevision.findUniqueOrThrow({
          where: { id: created.body.id },
        })
      ).status,
    ).toBe("PENDING");
    expect(
      await db.auditLog.count({ where: { targetId: created.body.id } }),
    ).toBe(0);
    expect(await db.notification.count({ where: { event: { postId } } })).toBe(
      0,
    );
  });
  it("removes restricted content from notifications and allows stale proposals to be rejected", async () => {
    const first = await submit();
    await decide("REVISION", first.body.id, "APPROVE");
    const stale = await submit({
      baseVersion: 2,
      title: "测试修改：本次提议随后失效",
    });
    // Simulate a version advanced by a later moderation operation.
    await db.post.update({
      where: { id: postId },
      data: { currentVersion: 3 },
    });
    expect((await decide("REVISION", stale.body.id, "APPROVE")).status).toBe(
      409,
    );
    expect((await decide("REVISION", stale.body.id, "REJECT")).status).toBe(
      204,
    );
    expect(
      (
        await db.postRevision.findUniqueOrThrow({
          where: { id: stale.body.id },
        })
      ).pendingKey,
    ).toBeNull();
    await db.post.update({
      where: { id: postId },
      data: { status: "RESTRICTED" },
    });
    const notifications = await request(app)
      .get("/api/v1/notifications")
      .set(auth(reader));
    expect(
      notifications.body.some((n: { postId: string }) => n.postId === postId),
    ).toBe(false);
  });
  it("hides sensitive historical text and its timeline/notification copies, retaining a private audit", async () => {
    const first = await submit({
      changeReason: "模拟旧说明中的隐私片段_只用于测试",
    });
    await decide("REVISION", first.body.id, "APPROVE");
    const second = await submit({
      baseVersion: 2,
      title: "再次更正：公开说明移除隐私片段",
      changeReason: "本次更正已移除旧说明中的私人信息。",
    });
    await decide("REVISION", second.body.id, "APPROVE");
    const hide = await request(app)
      .post(`/api/v1/admin/history/${first.body.id}/hide`)
      .set(auth(admin))
      .send({ reason: "模拟隐私处理理由，不公开" });
    expect(hide.status).toBe(204);
    const publicData = (await detail()).body;
    expect(
      publicData.history.find((r: { id: string }) => r.id === first.body.id),
    ).toEqual(expect.objectContaining({ visible: false, version: 2 }));
    expect(JSON.stringify(publicData)).not.toContain("隐私片段_只用于测试");
    expect(JSON.stringify(publicData)).not.toContain("模拟隐私处理理由");
    const notifications = await request(app)
      .get("/api/v1/notifications")
      .set(auth(reader));
    expect(JSON.stringify(notifications.body)).not.toContain(
      "隐私片段_只用于测试",
    );
    expect(
      await db.auditLog.count({
        where: { targetId: first.body.id, action: "HISTORY_HIDE" },
      }),
    ).toBe(1);
    const retained = await db.postRevision.findUniqueOrThrow({
      where: { id: first.body.id },
    });
    expect(retained.changeReason).toContain("隐私片段_只用于测试");
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/history/${second.body.id}/hide`)
          .set(auth(admin))
          .send({ reason: "当前版本不能这样隐藏" })
      ).status,
    ).toBe(409);
  });
  it("stops correction notifications after unfollowing", async () => {
    await request(app)
      .delete(`/api/v1/posts/${postId}/follow`)
      .set(auth(reader));
    const created = await submit();
    await decide("REVISION", created.body.id, "APPROVE");
    expect(
      await db.notification.count({
        where: { userId: readerId, event: { postId } },
      }),
    ).toBe(0);
  });
});
