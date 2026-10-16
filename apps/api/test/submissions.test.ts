import { beforeAll, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
import { submitPost } from "../src/submissions.js";
import type { PostSubmission } from "@secondlook/contracts";

const dir = mkdtempSync(join(tmpdir(), "secondlook-submissions-"));
const url = `file:${join(dir, "test.db")}`;
const db = openDatabase(url),
  app = createApp(db);
let author: string,
  other: string,
  admin: string,
  authorId: string,
  subjectId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const data = (): PostSubmission => ({
  subjectId,
  clientKey: randomUUID(),
  title: "投稿重试测试：虚构经历",
  body: "这是一条专门用于测试重复投稿与网络结果确认的虚构经历，不涉及真实单位。",
  occurredOn: "2026-01-01",
  anonymous: true,
  personalExperience: true,
});
const send = (body: object, token = author) =>
  request(app).post("/api/v1/posts").set(auth(token)).send(body);
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const name of ["author", "other", "admin"]) {
    const user = await db.user.create({
      data: {
        username: `submission_${name}`,
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
        name: "重试测试虚构饭店",
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

it("returns the same pending post for a repeated request without another queue item", async () => {
  const body = data();
  const first = await send(body),
    second = await send(body);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body).toEqual(first.body);
  expect(
    await db.post.count({ where: { authorId, submissionKey: body.clientKey } }),
  ).toBe(1);
  expect(
    (
      await request(app).get("/api/v1/admin/reviews").set(auth(admin))
    ).body.filter((r: { id: string }) => r.id === first.body.id),
  ).toHaveLength(1);
  expect(Object.keys(second.body).sort()).toEqual(["id", "status"]);
});
it("deduplicates simultaneous requests using the database unique constraint", async () => {
  const body = data();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => send(body)),
  );
  expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
  expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
  expect(
    await db.post.count({ where: { authorId, submissionKey: body.clientKey } }),
  ).toBe(1);
});
it("rejects reusing an identifier with any changed creation field", async () => {
  const body = data();
  const created = await send(body);
  for (const patch of [
    { title: "这是一篇修改过标题的记录" },
    { body: body.body + "内容已经改变。" },
    { occurredOn: "2026-01-02" },
    { anonymous: false },
    { subjectId: "another-object" },
  ])
    expect((await send({ ...body, ...patch })).status).toBe(409);
  expect(
    (await db.post.findUniqueOrThrow({ where: { id: created.body.id } })).title,
  ).toBe(body.title);
});
it("recovers the winner if the initial lookup lost a unique-insert race", async () => {
  const body = data();
  const created = await send(body);
  const lookup = vi.spyOn(db.post, "findUnique").mockResolvedValueOnce(null);
  try {
    expect(await submitPost(db, authorId, body)).toEqual(created.body);
  } finally {
    lookup.mockRestore();
  }
  expect(
    await db.post.count({ where: { submissionKey: body.clientKey } }),
  ).toBe(1);
});
it("isolates identifiers by account and still requires a valid session", async () => {
  const body = data();
  const first = await send(body),
    second = await send(body, other);
  expect(second.status).toBe(201);
  expect(second.body.id).not.toBe(first.body.id);
  expect((await request(app).post("/api/v1/posts").send(body)).status).toBe(
    401,
  );
  const another = data();
  expect((await send(another)).body.id).not.toBe(first.body.id);
});
it("requires a UUID and validates the declaration without consuming an invalid attempt", async () => {
  const body = data();
  const { clientKey: _key, ...withoutKey } = body;
  for (const invalid of [
    withoutKey,
    { ...body, clientKey: "bad-key" },
    { ...body, personalExperience: false },
  ])
    expect((await send(invalid)).status).toBe(400);
  expect(
    await db.post.count({ where: { submissionKey: body.clientKey } }),
  ).toBe(0);
  expect((await send(body)).status).toBe(201);
});
it("keeps the original digest across approval and correction without overwriting the new text", async () => {
  const body = data(),
    created = await send(body),
    id = created.body.id;
  const decide = (kind: string, target: string) =>
    request(app)
      .post(`/api/v1/admin/reviews/${kind}/${target}/decision`)
      .set(auth(admin))
      .send({ action: "APPROVE", reason: "虚构审核通过" });
  expect((await decide("POST", id)).status).toBe(204);
  const revision = await request(app)
    .post(`/api/v1/posts/${id}/revisions`)
    .set(auth(author))
    .send({
      title: "修订之后的虚构正文标题",
      body: body.body + "这里是更正之后的内容。",
      occurredOn: body.occurredOn,
      baseVersion: 1,
      changeReason: "这是一条虚构更正说明。",
    });
  expect((await decide("REVISION", revision.body.id)).status).toBe(204);
  const replayed = await send(body);
  expect(replayed.body).toEqual({ id, status: "PUBLISHED" });
  const detail = (await request(app).get(`/api/v1/posts/${id}`)).body;
  expect(detail.currentVersion).toBe(2);
  expect(detail.title).toBe("修订之后的虚构正文标题");
  expect(JSON.stringify(detail)).not.toContain(body.clientKey);
  expect(JSON.stringify(detail)).not.toContain("submissionDigest");
  expect(await db.timelineEvent.count({ where: { postId: id } })).toBe(2);
});
it("returns a rejected post without silently reopening it", async () => {
  const body = data(),
    created = await send(body);
  await request(app)
    .post(`/api/v1/admin/reviews/POST/${created.body.id}/decision`)
    .set(auth(admin))
    .send({ action: "REJECT", reason: "虚构测试拒绝理由" });
  expect((await send(body)).body).toEqual({
    id: created.body.id,
    status: "REJECTED",
  });
  expect(
    await db.post.count({ where: { authorId, submissionKey: body.clientKey } }),
  ).toBe(1);
});
it("can safely retry after a failed database transaction", async () => {
  const body = data();
  const transaction = vi
    .spyOn(db, "$transaction")
    .mockRejectedValueOnce(new Error("test transaction failure"));
  try {
    await expect(submitPost(db, authorId, body)).rejects.toThrow(
      "test transaction failure",
    );
  } finally {
    transaction.mockRestore();
  }
  expect(
    await db.post.count({ where: { submissionKey: body.clientKey } }),
  ).toBe(0);
  expect((await send(body)).status).toBe(201);
});
