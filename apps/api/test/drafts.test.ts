import { beforeAll, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase, type Database } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
import { submitDraft } from "../src/drafts.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-drafts-"));
const url = `file:${join(dir, "test.db")}`,
  db = openDatabase(url),
  app = createApp(db);
let author: string,
  authorId: string,
  other: string,
  admin: string,
  subjectId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const input = () => ({
  subjectId: null as string | null,
  title: "草稿",
  body: "",
  occurredOn: "2026-",
  anonymous: true,
  personalExperience: false,
  version: 0,
  mutationKey: randomUUID(),
});
const ready = () => ({
  ...input(),
  subjectId,
  title: "这是一条完整的虚构草稿",
  body: "这是一条用于验证草稿恢复与投稿结果确认的虚构经历，不涉及真实对象。",
  occurredOn: "2026-01-01",
  personalExperience: true,
});
const save = (id: string, data: object, token = author) =>
  request(app).put(`/api/v1/me/drafts/${id}`).set(auth(token)).send(data);
const get = (id: string, token = author) =>
  request(app).get(`/api/v1/me/drafts/${id}`).set(auth(token));
const submit = (id: string, version = 1, token = author) =>
  request(app)
    .post(`/api/v1/me/drafts/${id}/submit`)
    .set(auth(token))
    .send({ version });
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const name of ["author", "other", "admin"]) {
    const user = await db.user.create({
      data: {
        username: `draft_${name}`,
        nickname: name,
        role: name === "admin" ? "ADMIN" : "USER",
        passwordHash: "unused-test-only",
      },
    });
    const token = await issueSession(db, user.id);
    if (name === "author") {
      author = token;
      authorId = user.id;
    } else if (name === "other") other = token;
    else admin = token;
  }
  subjectId = (
    await db.subject.create({
      data: {
        name: "草稿测试虚构饭店",
        category: "RESTAURANT",
        city: "测试市",
      },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("keeps incomplete drafts private and separate from public posts and review queues", async () => {
  const id = randomUUID(),
    data = input(),
    saved = await save(id, data);
  expect(saved.status).toBe(200);
  expect(saved.headers["cache-control"]).toBe("private, no-store");
  expect(saved.body).toMatchObject({
    id,
    title: data.title,
    version: 1,
    postId: null,
    subject: null,
  });
  expect((await get(id)).body.body).toBe("");
  expect((await request(app).get("/api/v1/posts")).body.total).toBe(0);
  expect(
    (await request(app).get("/api/v1/admin/reviews").set(auth(admin))).body,
  ).toEqual([]);
  expect((await request(app).get(`/api/v1/posts/${id}`)).status).toBe(404);
  expect(JSON.stringify(saved.body)).not.toContain(authorId);
  expect(JSON.stringify(saved.body)).not.toContain("mutationKey");
});
it("requires authentication and protects read, overwrite, submit and list across accounts", async () => {
  const id = randomUUID(),
    data = ready();
  await save(id, data);
  expect((await request(app).get("/api/v1/me/drafts")).status).toBe(401);
  expect(
    (await request(app).put(`/api/v1/me/drafts/${id}`).send(data)).status,
  ).toBe(401);
  for (const token of [other, admin]) {
    expect((await get(id, token)).status).toBe(404);
    expect((await save(id, { ...data, version: 1 }, token)).status).toBe(404);
    expect((await submit(id, 1, token)).status).toBe(404);
    expect(
      (await request(app).get("/api/v1/me/drafts").set(auth(token))).body.total,
    ).toBe(0);
  }
});
it("replays a save after a lost response without increasing the version", async () => {
  const id = randomUUID(),
    data = ready();
  const first = await save(id, data),
    second = await save(id, data);
  expect(second.body).toEqual(first.body);
  expect(
    (await save(id, { ...data, body: data.body + "改变内容。" })).status,
  ).toBe(409);
  expect((await get(id)).body.version).toBe(1);
});
it("rejects stale updates instead of overwriting newer edits", async () => {
  const id = randomUUID(),
    data = ready();
  await save(id, data);
  const changed = {
    ...data,
    version: 1,
    mutationKey: randomUUID(),
    title: "另一个设备保存的新标题",
  };
  expect((await save(id, changed)).body.version).toBe(2);
  expect(
    (
      await save(id, {
        ...changed,
        mutationKey: randomUUID(),
        title: "过期的旧编辑器内容",
      })
    ).status,
  ).toBe(409);
  expect((await save(id, data)).status).toBe(409);
  expect((await get(id)).body.title).toBe(changed.title);
});
it("validates identifiers, bounds and references before writing a draft", async () => {
  for (const [id, data, status] of [
    ["bad-id", input(), 400],
    [randomUUID(), { ...input(), body: "x".repeat(5001) }, 400],
    [randomUUID(), { ...input(), subjectId: "missing-object" }, 404],
    [randomUUID(), { ...input(), version: -1 }, 400],
    [randomUUID(), { ...input(), mutationKey: "bad" }, 400],
  ] as const)
    expect((await save(id, data)).status).toBe(status);
});
it("cannot submit incomplete or stale drafts", async () => {
  const id = randomUUID();
  await save(id, input());
  expect((await submit(id)).status).toBe(400);
  await save(id, { ...ready(), version: 1 });
  expect((await submit(id, 1)).status).toBe(409);
  expect((await get(id)).body.postId).toBeNull();
  expect((await submit(id, 2)).status).toBe(201);
});
it("links the submitted post atomically and prevents editing or reopening the draft", async () => {
  const id = randomUUID(),
    data = ready();
  await save(id, data);
  const first = await submit(id),
    replayed = await submit(id);
  expect(first.status).toBe(201);
  expect(replayed.body).toEqual(first.body);
  expect((await get(id)).body.postId).toBe(first.body.id);
  expect(
    (
      await save(id, {
        ...data,
        version: 1,
        mutationKey: randomUUID(),
        title: "不能再直接修改已投稿草稿",
      })
    ).status,
  ).toBe(409);
  expect((await save(id, data)).body.postId).toBe(first.body.id);
  expect(await db.post.count({ where: { submissionKey: `draft:${id}` } })).toBe(
    1,
  );
  await request(app)
    .post(`/api/v1/admin/reviews/POST/${first.body.id}/decision`)
    .set(auth(admin))
    .send({ action: "REJECT", reason: "虚构审核拒绝理由" });
  expect((await submit(id)).body).toEqual({
    id: first.body.id,
    status: "REJECTED",
  });
});
it("resolves simultaneous submissions to one post", async () => {
  const id = randomUUID();
  await save(id, ready());
  const results = await Promise.all(
    Array.from({ length: 5 }, () => submit(id)),
  );
  expect(results.map((r) => r.status)).toEqual(Array(5).fill(201));
  expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
});
it("makes an edit racing with submission either a version conflict or an immutable result", async () => {
  const id = randomUUID(),
    data = ready();
  await save(id, data);
  const [edited, submitted] = await Promise.all([
    save(id, {
      ...data,
      version: 1,
      mutationKey: randomUUID(),
      title: "竞争保存之后的新标题",
    }),
    submit(id),
  ]);
  expect(
    [edited.status, submitted.status].filter((status) => status < 300),
  ).toHaveLength(1);
  expect([edited.status, submitted.status]).toContain(409);
  const current = (await get(id)).body;
  if (current.postId) {
    expect(edited.status).toBe(409);
    expect(submitted.status).toBe(201);
    expect(
      (await db.post.findUniqueOrThrow({ where: { id: current.postId } }))
        .title,
    ).toBe(data.title);
  } else {
    expect(current.version).toBe(2);
    expect(submitted.status).toBe(409);
  }
});
it("paginates private drafts with totals isolated to the owner", async () => {
  for (let i = 0; i < 15; i++)
    await save(randomUUID(), { ...input(), title: `分页虚构草稿 ${i}` }, other);
  const first = (
    await request(app).get("/api/v1/me/drafts?limit=12").set(auth(other))
  ).body;
  const next = (
    await request(app).get("/api/v1/me/drafts?limit=12&page=2").set(auth(other))
  ).body;
  expect(first.total).toBe(15);
  expect(first.items).toHaveLength(12);
  expect(next.items).toHaveLength(3);
  expect(
    new Set([...first.items, ...next.items].map((d: { id: string }) => d.id))
      .size,
  ).toBe(15);
  expect(
    (await request(app).get("/api/v1/me/drafts?limit=999").set(auth(other)))
      .status,
  ).toBe(400);
});
it("restores draft and result links after opening a fresh database connection", async () => {
  const id = randomUUID();
  await save(id, ready());
  const post = await submit(id);
  const reopened = openDatabase(url),
    fresh = createApp(reopened);
  try {
    const result = await request(fresh)
      .get(`/api/v1/me/drafts/${id}`)
      .set(auth(author));
    expect(result.body.postId).toBe(post.body.id);
    expect(result.body.subject.id).toBe(subjectId);
    expect(
      (
        await request(fresh)
          .post(`/api/v1/me/drafts/${id}/submit`)
          .set(auth(author))
          .send({ version: 1 })
      ).body.id,
    ).toBe(post.body.id);
  } finally {
    await reopened.$disconnect();
  }
});
it("rolls back post creation if linking it to the draft fails", async () => {
  const id = randomUUID();
  await save(id, ready());
  const original = db.$transaction.bind(db);
  const mocked = vi.spyOn(db, "$transaction").mockImplementationOnce(((
    fn: (tx: unknown) => unknown,
  ) =>
    original(async (tx) =>
      fn(
        new Proxy(tx, {
          get(target, prop) {
            if (prop === "postDraft")
              return new Proxy(target.postDraft, {
                get(delegate, key) {
                  if (key === "update")
                    return () => {
                      throw new Error("draft link failure");
                    };
                  return Reflect.get(delegate, key);
                },
              });
            return Reflect.get(target, prop);
          },
        }),
      ),
    )) as Database["$transaction"]);
  try {
    await expect(submitDraft(db, authorId, id, 1)).rejects.toThrow(
      "draft link failure",
    );
  } finally {
    mocked.mockRestore();
  }
  expect(await db.post.count({ where: { submissionKey: `draft:${id}` } })).toBe(
    0,
  );
  expect((await get(id)).body.postId).toBeNull();
  expect((await submit(id)).status).toBe(201);
});
