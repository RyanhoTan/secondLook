import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import {
  categoryIssues,
  type Category,
  type IssueType,
} from "@secondlook/contracts";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-issues-"));
const url = `file:${join(dir, "test.db")}`,
  db = openDatabase(url),
  app = createApp(db);
const subjects = {} as Record<Category, string>;
let author: string, admin: string, reader: string, authorId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const content = (issueTypes: IssueType[] = ["TASTE", "PRICING"]) => ({
  subjectId: subjects.RESTAURANT,
  title: "问题分类：虚构亲历记录",
  body: "这是一条用于验证问题分类与版本审核的虚构经历，不对应任何真实个人或商家。",
  occurredOn: "2026-01-01",
  anonymous: true,
  personalExperience: true,
  issueTypes,
});
const submit = (data = content()) =>
  request(app)
    .post("/api/v1/posts")
    .set(auth(author))
    .send({ ...data, clientKey: randomUUID() });
const decide = (kind: string, id: string, action = "APPROVE") =>
  request(app)
    .post(`/api/v1/admin/reviews/${kind}/${id}/decision`)
    .set(auth(admin))
    .send({ action, reason: "虚构内容的分类审核说明" });
const detail = async (id: string) =>
  (await request(app).get(`/api/v1/posts/${id}`)).body;
const revise = (
  id: string,
  issueTypes: IssueType[],
  baseVersion = 1,
  token = author,
) =>
  request(app)
    .post(`/api/v1/posts/${id}/revisions`)
    .set(auth(token))
    .send({
      ...content(issueTypes),
      baseVersion,
      changeReason: "核对之后更正问题分类，正文保持原意。",
    });
async function published() {
  const created = await submit();
  expect(created.status).toBe(201);
  expect((await decide("POST", created.body.id)).status).toBe(204);
  return created.body.id as string;
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const name of ["author", "admin", "reader"]) {
    const user = await db.user.create({
      data: {
        username: `issues_${name}`,
        nickname: `内部昵称_${name}`,
        passwordHash: "unused-test",
        role: name === "admin" ? "ADMIN" : "USER",
      },
    });
    const token = await issueSession(db, user.id);
    if (name === "author") {
      author = token;
      authorId = user.id;
    } else if (name === "admin") admin = token;
    else reader = token;
  }
  for (const category of Object.keys(categoryIssues) as Category[]) {
    subjects[category] = (
      await db.subject.create({
        data: {
          name: `分类测试虚构对象-${category}`,
          category,
          city: "测试市",
          address: "分类测试虚构路 1 号",
        },
      })
    ).id;
  }
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("accepts all confirmed category sets and excludes pending classifications from search", async () => {
  for (const category of Object.keys(categoryIssues) as Category[]) {
    const created = await submit({
      ...content([...categoryIssues[category]]),
      subjectId: subjects[category],
    });
    expect(created.status).toBe(201);
    expect(
      (
        await request(app).get(
          `/api/v1/posts?subjectId=${subjects[category]}&issue=${categoryIssues[category][0]}`,
        )
      ).body.total,
    ).toBe(0);
  }
  const queue = (
    await request(app).get("/api/v1/admin/reviews").set(auth(admin))
  ).body;
  expect(queue).toHaveLength(4);
  expect(
    queue.every(
      (item: { issueTypes: string[] }) => item.issueTypes.length >= 3,
    ),
  ).toBe(true);
});
it("rejects absent, empty, unknown, duplicate, excessive and cross-category tags without creating posts", async () => {
  const count = await db.post.count();
  for (const issueTypes of [
    undefined,
    [],
    ["NO_SUCH_TYPE"],
    ["TASTE", "TASTE"],
    ["TASTE", "PRICING", "QUEUE", "HYGIENE", "SERVICE"],
    ["WORK"],
  ]) {
    const result = await request(app)
      .post("/api/v1/posts")
      .set(auth(author))
      .send({ ...content(), clientKey: randomUUID(), issueTypes });
    expect(result.status, JSON.stringify(issueTypes)).toBe(400);
  }
  expect(await db.post.count()).toBe(count);
});
it("deduplicates reordered tag selections and rejects changed classifications for the same submission", async () => {
  const input = { ...content(), clientKey: randomUUID() };
  const a = await request(app)
    .post("/api/v1/posts")
    .set(auth(author))
    .send(input);
  const b = await request(app)
    .post("/api/v1/posts")
    .set(auth(author))
    .send({ ...input, issueTypes: ["PRICING", "TASTE"] });
  expect(a.status).toBe(201);
  expect(b.body).toEqual(a.body);
  expect(
    (
      await request(app)
        .post("/api/v1/posts")
        .set(auth(author))
        .send({ ...input, issueTypes: ["TASTE"] })
    ).status,
  ).toBe(409);
  expect(await db.postIssue.count({ where: { postId: a.body.id } })).toBe(2);
});
it("restores incomplete draft classifications, replays arrays by value and enforces classification on submission", async () => {
  const id = randomUUID(),
    mutationKey = randomUUID();
  const input = { ...content(), version: 0, mutationKey, issueTypes: [] };
  const save = (data: object) =>
    request(app).put(`/api/v1/me/drafts/${id}`).set(auth(author)).send(data);
  const a = await save(input);
  expect(a.status).toBe(200);
  expect((await save(input)).body).toEqual(a.body);
  const send = () =>
    request(app)
      .post(`/api/v1/me/drafts/${id}/submit`)
      .set(auth(author))
      .send({ version: 1 });
  expect((await send()).status).toBe(400);
  const b = await save({
    ...input,
    issueTypes: ["TASTE", "PRICING"],
    version: 1,
    mutationKey: randomUUID(),
  });
  expect(b.body.issueTypes).toEqual(["PRICING", "TASTE"]);
  expect(
    (await request(app).get(`/api/v1/me/drafts/${id}`).set(auth(reader)))
      .status,
  ).toBe(404);
  const result = await request(app)
    .post(`/api/v1/me/drafts/${id}/submit`)
    .set(auth(author))
    .send({ version: 2 });
  expect(result.status).toBe(201);
  expect(await db.postIssue.count({ where: { postId: result.body.id } })).toBe(
    2,
  );
});
it("keeps a category-mismatched draft recoverable but refuses to publish it", async () => {
  const id = randomUUID();
  const saved = await request(app)
    .put(`/api/v1/me/drafts/${id}`)
    .set(auth(author))
    .send({ ...content(["WORK"]), version: 0, mutationKey: randomUUID() });
  expect(saved.status).toBe(200);
  expect(
    (
      await request(app)
        .post(`/api/v1/me/drafts/${id}/submit`)
        .set(auth(author))
        .send({ version: 1 })
    ).status,
  ).toBe(400);
  expect(
    (await request(app).get(`/api/v1/me/drafts/${id}`).set(auth(author))).body
      .issueTypes,
  ).toEqual(["WORK"]);
});
it("publishes tag-only revisions atomically with version history and one follower notification", async () => {
  const id = await published();
  await request(app).put(`/api/v1/posts/${id}/follow`).set(auth(reader));
  const revision = await revise(id, ["HYGIENE"]);
  expect(revision.status).toBe(201);
  expect((await detail(id)).issueTypes).toEqual(["PRICING", "TASTE"]);
  expect(
    (
      await request(app).get(
        `/api/v1/posts?subjectId=${subjects.RESTAURANT}&issue=HYGIENE`,
      )
    ).body.items.some((p: { id: string }) => p.id === id),
  ).toBe(false);
  expect((await decide("REVISION", revision.body.id)).status).toBe(204);
  const result = await detail(id);
  expect(result.issueTypes).toEqual(["HYGIENE"]);
  expect(result.currentVersion).toBe(2);
  expect(
    result.history.map((r: { issueTypes: string[] }) => r.issueTypes),
  ).toEqual([["HYGIENE"], ["PRICING", "TASTE"]]);
  const filtered = await request(app).get(
    `/api/v1/posts?subjectId=${subjects.RESTAURANT}&issue=HYGIENE&city=测试&occurredFrom=2026-01-01&occurredTo=2026-01-01&limit=1`,
  );
  expect(filtered.body.items.map((p: { id: string }) => p.id)).toEqual([id]);
  expect(filtered.body.total).toBe(1);
  expect(JSON.stringify(result)).not.toContain(authorId);
  expect((await decide("REVISION", revision.body.id)).status).toBe(409);
  expect(
    await db.notification.count({ where: { event: { postId: id } } }),
  ).toBe(1);
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/history/${result.history[1].id}/hide`)
        .set(auth(admin))
        .send({ reason: "测试隐藏旧分类" })
    ).status,
  ).toBe(204);
  expect((await detail(id)).history[1]).not.toHaveProperty("issueTypes");
});
it("preserves current tags on rejection and rejects unauthorized, unchanged or mismatched corrections", async () => {
  const id = await published();
  expect((await revise(id, ["HYGIENE"], 1, reader)).status).toBe(403);
  expect((await revise(id, ["WORK"])).status).toBe(400);
  expect((await revise(id, ["TASTE", "PRICING"])).status).toBe(400);
  const revision = await revise(id, ["QUEUE"]);
  expect((await decide("REVISION", revision.body.id, "REJECT")).status).toBe(
    204,
  );
  expect((await detail(id)).issueTypes).toEqual(["PRICING", "TASTE"]);
  expect(
    (
      await request(app)
        .get(`/api/v1/me/posts/${id}/revisions`)
        .set(auth(author))
    ).body.latestRevision.issueTypes,
  ).toEqual(["QUEUE"]);
});
it("rolls back both classification replacement and publication if writing new tags fails", async () => {
  const id = await published(),
    revision = await revise(id, ["HYGIENE"]);
  const transaction = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementationOnce((async (
    fn: (tx: unknown) => unknown,
  ) =>
    transaction(async (tx) =>
      fn(
        new Proxy(tx, {
          get(target, prop) {
            if (prop === "postIssue")
              return {
                ...target.postIssue,
                createMany: () => {
                  throw new Error("simulated tag write failure");
                },
              };
            return Reflect.get(target, prop);
          },
        }),
      ),
    )) as typeof db.$transaction);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await decide("REVISION", revision.body.id)).status).toBe(500);
  } finally {
    spy.mockRestore();
    log.mockRestore();
  }
  expect((await detail(id)).issueTypes).toEqual(["PRICING", "TASTE"]);
  expect((await detail(id)).currentVersion).toBe(1);
  expect(
    (
      await db.postRevision.findUniqueOrThrow({
        where: { id: revision.body.id },
      })
    ).status,
  ).toBe("PENDING");
  expect(
    await db.auditLog.count({ where: { targetId: revision.body.id } }),
  ).toBe(0);
  expect((await decide("REVISION", revision.body.id)).status).toBe(204);
});
it("keeps historical unclassified records empty and validates filter values", async () => {
  const post = await db.post.create({
    data: {
      subjectId: subjects.OTHER,
      authorId,
      title: "虚构旧记录没有分类",
      body: "旧数据不能由平台根据正文猜测问题分类。",
      occurredOn: "2026-01-01",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  expect((await detail(post.id)).issueTypes).toEqual([]);
  expect(
    (
      await request(app).get(
        `/api/v1/posts?subjectId=${subjects.OTHER}&issue=INFORMATION`,
      )
    ).body.items.map((p: { id: string }) => p.id),
  ).not.toContain(post.id);
  for (const query of ["issue=UNKNOWN", "issue=", "issue=TASTE&issue=PRICING"])
    expect((await request(app).get(`/api/v1/posts?${query}`)).status).toBe(400);
});
