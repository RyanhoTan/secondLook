import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-subject-follows-"));
const db = openDatabase(`file:${join(dir, "test.db")}`),
  app = createApp(db, { uploadRoot: join(dir, "uploads") });
const tokens: Record<string, string> = {},
  ids: Record<string, string> = {};
let subjectId: string, otherId: string;
const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const content = () => ({
  subjectId,
  title: "对象关注的虚构亲历记录",
  body: "这是用于验证对象关注与重要通知的虚构内容，不涉及真实对象或个人。",
  occurredOn: "2024-01-01",
  issueTypes: ["INFORMATION"],
  personalExperience: true,
  anonymous: true,
});
const submit = (target = subjectId) =>
  request(app)
    .post("/api/v1/posts")
    .set(auth("author"))
    .send({ ...content(), subjectId: target, clientKey: randomUUID() });
const decide = (kind: string, id: string, action = "APPROVE") =>
  request(app)
    .post(`/api/v1/admin/reviews/${kind}/${id}/decision`)
    .set(auth("admin"))
    .send({ action, reason: "虚构关注测试审核" });
async function publish(target = subjectId) {
  const p = await submit(target);
  expect(p.status).toBe(201);
  expect((await decide("POST", p.body.id)).status).toBe(204);
  return p.body.id as string;
}
const follow = (
  who: string,
  target = subjectId,
  method: "put" | "delete" = "put",
) => request(app)[method](`/api/v1/subjects/${target}/follow`).set(auth(who));
const notifications = async (who: string) =>
  (await request(app).get("/api/v1/notifications").set(auth(who))).body as {
    id: string;
    postId: string;
    subjectName: string;
  }[];
async function update(postId: string) {
  const result = await request(app)
    .post(`/api/v1/posts/${postId}/updates`)
    .set(auth("author"))
    .send({ title: "虚构后续进展", body: "仅用于验证关注取消后的通知分发。" });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, "test.db")}` },
      stdio: "pipe",
    },
  );
  for (const who of ["author", "admin", "object", "post", "both", "outsider"]) {
    const u = await db.user.create({
      data: {
        username: `subject_${who}`,
        nickname: `内部${who}`,
        passwordHash: "unused-test",
        role: who === "admin" ? "ADMIN" : "USER",
      },
    });
    tokens[who] = await issueSession(db, u.id);
    ids[who] = u.id;
  }
  for (const address of ["一号门店", "二号门店"]) {
    const s = await db.subject.create({
      data: {
        name: "同名虚构对象",
        city: "测试市",
        category: "OTHER",
        address,
      },
    });
    if (!subjectId) subjectId = s.id;
    else otherId = s.id;
  }
}, 30000);
beforeEach(async () => {
  await db.notification.deleteMany();
  await db.follow.deleteMany();
  await db.subjectFollow.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("keeps object subscriptions private, authenticated, idempotent and scoped to one concrete branch", async () => {
  expect(
    (await request(app).put(`/api/v1/subjects/${subjectId}/follow`)).status,
  ).toBe(401);
  expect((await follow("object", "missing")).status).toBe(404);
  for (let n = 0; n < 2; n++) expect((await follow("object")).status).toBe(204);
  expect(await db.subjectFollow.count()).toBe(1);
  const own = await request(app)
    .get(`/api/v1/subjects/${subjectId}`)
    .set(auth("object"));
  expect(own.body.following).toBe(true);
  expect(own.headers["cache-control"]).toContain("no-store");
  for (const query of [
    request(app).get(`/api/v1/subjects/${subjectId}`),
    request(app).get(`/api/v1/subjects/${subjectId}`).set(auth("outsider")),
    request(app).get(`/api/v1/subjects/${otherId}`).set(auth("object")),
  ]) {
    const result = await query;
    expect(result.body.following).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain(ids.object);
  }
  expect((await follow("outsider", subjectId, "delete")).status).toBe(204);
  expect(await db.subjectFollow.count()).toBe(1);
  expect((await follow("object", subjectId, "delete")).status).toBe(204);
  expect((await follow("object", subjectId, "delete")).status).toBe(204);
  expect(await db.subjectFollow.count()).toBe(0);
});

it("notifies only current object followers on first publication, never pending/rejected/other-branch posts", async () => {
  await follow("object");
  await follow("outsider", otherId);
  const p = await submit();
  expect(await notifications("object")).toEqual([]);
  expect((await decide("POST", p.body.id)).status).toBe(204);
  expect((await decide("POST", p.body.id)).status).toBe(409);
  const events = await notifications("object");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    postId: p.body.id,
    subjectName: "同名虚构对象",
  });
  expect(JSON.stringify(events)).not.toContain(ids.author);
  expect(await notifications("outsider")).toEqual([]);
  const rejected = await submit();
  await decide("POST", rejected.body.id, "REJECT");
  expect(await notifications("object")).toHaveLength(1);
  await publish(otherId);
  expect(await notifications("object")).toHaveLength(1);
  expect(await notifications("outsider")).toHaveLength(1);
});

it("unions post and object recipients once per approved update and cancellation removes only that subscription", async () => {
  const id = await publish();
  for (const who of ["object", "both"]) await follow(who);
  for (const who of ["post", "both"])
    await request(app).put(`/api/v1/posts/${id}/follow`).set(auth(who));
  const first = await update(id);
  expect(await notifications("object")).toEqual([]);
  expect((await decide("UPDATE", first)).status).toBe(204);
  expect((await decide("UPDATE", first)).status).toBe(409);
  for (const who of ["object", "post", "both"])
    expect(await notifications(who)).toHaveLength(1);
  expect(await notifications("outsider")).toEqual([]);
  await follow("object", subjectId, "delete");
  await follow("both", subjectId, "delete");
  await decide("UPDATE", await update(id));
  expect(await notifications("object")).toHaveLength(1);
  expect(await notifications("both")).toHaveLength(2);
  await request(app).delete(`/api/v1/posts/${id}/follow`).set(auth("both"));
  await decide("UPDATE", await update(id));
  expect(await notifications("both")).toHaveLength(2);
  // Re-following does not replay historical events.
  await follow("object");
  expect(await notifications("object")).toHaveLength(1);
});

it("sends approved corrections to object followers and keeps restricted posts out of notifications", async () => {
  const id = await publish();
  await follow("object");
  const revise = () =>
    request(app)
      .post(`/api/v1/posts/${id}/revisions`)
      .set(auth("author"))
      .send({
        ...content(),
        title: "更正后的对象关注记录",
        baseVersion: 1,
        changeReason: "虚构更正说明不可提前公开",
      });
  const r = await revise();
  expect(r.status).toBe(201);
  expect(await notifications("object")).toHaveLength(0);
  await decide("REVISION", r.body.id);
  expect(await notifications("object")).toHaveLength(1);
  const updateId = await update(id);
  await decide("UPDATE", updateId);
  await db.post.update({ where: { id }, data: { status: "LIMITED" } });
  expect(await notifications("object")).toEqual([]);
  const hidden = await request(app).get(`/api/v1/posts/${id}`);
  expect(hidden.status).toBe(404);
});

it("delivers public material approval and withdrawal, but not private-only or rejected material decisions", async () => {
  const id = await publish();
  await follow("object");
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const upload = async (visibility: string) => {
    const m = await request(app)
      .post(`/api/v1/posts/${id}/materials`)
      .set(auth("author"))
      .field("clientKey", randomUUID())
      .field("source", "虚构材料来源")
      .field("visibility", visibility)
      .attach("file", bytes, "test.png");
    expect(m.status).toBe(201);
    return m.body.id as string;
  };
  const review = (id: string, action = "APPROVE") =>
    request(app)
      .post(`/api/v1/admin/materials/${id}/decision`)
      .set(auth("admin"))
      .send({
        action,
        reason: "虚构隐私审核",
        privacyChecked: true,
        redactions: [],
        baseVersion: 1,
      });
  await review(await upload("REVIEW_ONLY"));
  await review(await upload("PUBLIC"), "REJECT");
  expect(await notifications("object")).toHaveLength(0);
  const publicId = await upload("PUBLIC");
  expect((await review(publicId)).status).toBe(204);
  expect((await review(publicId)).status).toBe(409);
  expect(await notifications("object")).toHaveLength(1);
  expect(
    (
      await request(app)
        .delete(`/api/v1/materials/${publicId}`)
        .set(auth("author"))
    ).status,
  ).toBe(204);
  expect(await notifications("object")).toHaveLength(2);
});

it("rolls back publication, history and audit if creating object notifications fails", async () => {
  await follow("object");
  const p = await submit();
  const transaction = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementationOnce((async (
    fn: (tx: unknown) => unknown,
  ) =>
    transaction(async (tx) =>
      fn(
        new Proxy(tx, {
          get(target, prop) {
            if (prop === "notification")
              return {
                ...target.notification,
                createMany: () => {
                  throw new Error("simulated notification failure");
                },
              };
            return Reflect.get(target, prop);
          },
        }),
      ),
    )) as typeof db.$transaction);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await decide("POST", p.body.id)).status).toBe(500);
  } finally {
    spy.mockRestore();
    log.mockRestore();
  }
  expect(
    (await db.post.findUniqueOrThrow({ where: { id: p.body.id } })).status,
  ).toBe("PENDING");
  expect(await db.postRevision.count({ where: { postId: p.body.id } })).toBe(0);
  expect(await db.timelineEvent.count({ where: { postId: p.body.id } })).toBe(
    0,
  );
  expect(await db.auditLog.count({ where: { targetId: p.body.id } })).toBe(0);
  expect((await decide("POST", p.body.id)).status).toBe(204);
  expect(await notifications("object")).toHaveLength(1);
});
