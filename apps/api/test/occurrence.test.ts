import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  occurrenceBounds,
  formatOccurrence,
  type OccurrencePrecision,
} from "@secondlook/contracts";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-occurrence-"));
const url = `file:${join(dir, "test.db")}`,
  db = openDatabase(url),
  app = createApp(db);
let author: string, admin: string, authorId: string, subjectId: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const content = (
  occurredPrecision: OccurrencePrecision = "DAY",
  occurredOn = "2024-02-15",
  occurredUntil = "",
) => ({
  title: "时间精度：仅用于测试的虚构记录",
  body: "这是一段用于验证发生时间精度与公开版本的虚构经历，不涉及真实对象或个人。",
  subjectId,
  issueTypes: ["TASTE"],
  anonymous: true,
  personalExperience: true,
  occurredPrecision,
  occurredOn,
  occurredUntil,
});
const send = (input: object) =>
  request(app)
    .post("/api/v1/posts")
    .set(auth(author))
    .send({ clientKey: randomUUID(), ...input });
const decide = (id: string, kind = "POST", action = "APPROVE") =>
  request(app)
    .post(`/api/v1/admin/reviews/${kind}/${id}/decision`)
    .set(auth(admin))
    .send({ action, reason: "虚构时间分类的测试审核" });
async function publish(input: object) {
  const created = await send(input);
  expect(created.status).toBe(201);
  expect((await decide(created.body.id)).status).toBe(204);
  return created.body.id as string;
}
const detail = async (id: string) =>
  (await request(app).get(`/api/v1/posts/${id}`)).body;
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const name of ["author", "admin"]) {
    const user = await db.user.create({
      data: {
        username: `time_${name}`,
        nickname: "不会公开的内部昵称",
        passwordHash: "test-unused",
        role: name === "admin" ? "ADMIN" : "USER",
      },
    });
    const token = await issueSession(db, user.id);
    if (name === "author") {
      author = token;
      authorId = user.id;
    } else admin = token;
  }
  subjectId = (
    await db.subject.create({
      data: {
        name: "虚构时间测试饭店",
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

it("keeps month precision public while deriving a real leap-month interval for queries", async () => {
  const id = await publish(content("MONTH", "2024-02"));
  expect(await db.post.findUniqueOrThrow({ where: { id } })).toMatchObject({
    occurredOn: "2024-02-01",
    occurredUntil: "2024-02-29",
    occurredPrecision: "MONTH",
  });
  const result = await detail(id);
  expect(result).toMatchObject({
    occurredOn: "2024-02",
    occurredUntil: "",
    occurredPrecision: "MONTH",
  });
  expect(result.history[0]).toMatchObject({
    occurredOn: "2024-02",
    occurredUntil: "",
    occurredPrecision: "MONTH",
  });
  expect(formatOccurrence(result)).toBe("2024 年 02 月（月份）");
  expect(JSON.stringify(result)).not.toContain(authorId);
  expect(
    occurrenceBounds({
      occurredOn: "1900-02",
      occurredPrecision: "MONTH",
      occurredUntil: "",
    }).occurredUntil,
  ).toBe("1900-02-28");
  expect(
    occurrenceBounds({
      occurredOn: "2000-02",
      occurredPrecision: "MONTH",
      occurredUntil: "",
    }).occurredUntil,
  ).toBe("2000-02-29");
});
it("matches partial overlap inclusively while combining tags, city and public state", async () => {
  const id = await publish(content("RANGE", "2023-05-10", "2023-05-20"));
  const pending = await send(content("RANGE", "2023-05-15", "2023-05-25"));
  for (const query of [
    "occurredFrom=2023-05-20",
    "occurredTo=2023-05-10",
    "occurredFrom=2023-05-13&occurredTo=2023-05-14",
  ]) {
    const result = await request(app).get(
      `/api/v1/posts?subjectId=${subjectId}&city=测试&issue=TASTE&${query}`,
    );
    expect(result.body.items.map((p: { id: string }) => p.id)).toContain(id);
    expect(result.body.items.map((p: { id: string }) => p.id)).not.toContain(
      pending.body.id,
    );
  }
  const none = await request(app).get(
    `/api/v1/posts?subjectId=${subjectId}&occurredFrom=2023-05-21&occurredTo=2023-05-30`,
  );
  expect(none.body.total).toBe(0);
  expect((await detail(id)).occurredUntil).toBe("2023-05-20");
  expect(formatOccurrence(await detail(id))).toContain("大致时间");
});
it("finds a month from a day in its middle and excludes adjacent months", async () => {
  const id = await publish(content("MONTH", "2022-04"));
  for (const day of ["01", "15", "30"]) {
    const result = await request(app).get(
      `/api/v1/posts?occurredFrom=2022-04-${day}&occurredTo=2022-04-${day}`,
    );
    expect(result.body.items.map((p: { id: string }) => p.id)).toContain(id);
  }
  const outside = await request(app).get(
    "/api/v1/posts?occurredFrom=2022-05-01&occurredTo=2022-05-01",
  );
  expect(outside.body.items.map((p: { id: string }) => p.id)).not.toContain(id);
});
it("rejects unknown precision, invalid months, missing or inverted ranges and future input", async () => {
  for (const patch of [
    { occurredPrecision: "UNKNOWN" },
    { occurredPrecision: "MONTH", occurredOn: "2024-13" },
    { occurredPrecision: "MONTH", occurredOn: "2024-02-01" },
    { occurredPrecision: "MONTH", occurredOn: "2999-01" },
    { occurredPrecision: "RANGE" },
    { occurredPrecision: "RANGE", occurredUntil: "2024-02-14" },
    { occurredPrecision: "RANGE", occurredUntil: "2024-02-30" },
    { occurredPrecision: "RANGE", occurredUntil: "2999-01-01" },
    { occurredUntil: "2024-02-20" },
    { occurredOn: "2023-02-29" },
  ])
    expect(
      (await send({ ...content(), ...patch })).status,
      JSON.stringify(patch),
    ).toBe(400);
});
it("restores incomplete time drafts and canonicalizes only when submitted", async () => {
  const id = randomUUID(),
    mutationKey = randomUUID();
  const save = (data: object) =>
    request(app).put(`/api/v1/me/drafts/${id}`).set(auth(author)).send(data);
  const first = await save({
    ...content("RANGE", "2024-", ""),
    version: 0,
    mutationKey,
  });
  expect(first.status).toBe(200);
  expect(
    (
      await request(app)
        .post(`/api/v1/me/drafts/${id}/submit`)
        .set(auth(author))
        .send({ version: 1 })
    ).status,
  ).toBe(400);
  const next = await save({
    ...content("MONTH", "2023-12"),
    version: 1,
    mutationKey: randomUUID(),
  });
  expect(next.body).toMatchObject({
    occurredOn: "2023-12",
    occurredPrecision: "MONTH",
    occurredUntil: "",
  });
  const submitted = await request(app)
    .post(`/api/v1/me/drafts/${id}/submit`)
    .set(auth(author))
    .send({ version: 2 });
  expect(submitted.status).toBe(201);
  expect(
    await db.post.findUniqueOrThrow({ where: { id: submitted.body.id } }),
  ).toMatchObject({ occurredOn: "2023-12-01", occurredUntil: "2023-12-31" });
});
it("keeps pending time corrections private and switches search, editor and history after approval", async () => {
  const id = await publish(content());
  const revision = await request(app)
    .post(`/api/v1/posts/${id}/revisions`)
    .set(auth(author))
    .send({
      ...content("MONTH", "2021-06"),
      baseVersion: 1,
      changeReason: "核对后只能确认发生月份，不能确认某一天。",
    });
  expect(revision.status).toBe(201);
  expect((await detail(id)).occurredPrecision).toBe("DAY");
  const editor = await request(app)
    .get(`/api/v1/me/posts/${id}/revisions`)
    .set(auth(author));
  expect(editor.body.latestRevision).toMatchObject({
    occurredPrecision: "MONTH",
    occurredOn: "2021-06",
    occurredUntil: "",
  });
  expect((await decide(revision.body.id, "REVISION")).status).toBe(204);
  const result = await detail(id);
  expect(result).toMatchObject({
    occurredOn: "2021-06",
    occurredPrecision: "MONTH",
    occurredUntil: "",
  });
  expect(result.history[1]).toMatchObject({
    occurredOn: "2024-02-15",
    occurredPrecision: "DAY",
    occurredUntil: "",
  });
  const found = await request(app).get(
    "/api/v1/posts?occurredFrom=2021-06-20&occurredTo=2021-06-20",
  );
  expect(found.body.items.map((p: { id: string }) => p.id)).toContain(id);
});
it("preserves old DAY submission digests and rejects precision changes with a reused submission key", async () => {
  const input = { ...content(), clientKey: randomUUID() };
  const first = await send(input);
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        input.subjectId,
        input.title,
        input.body,
        input.occurredOn,
        input.anonymous,
        input.issueTypes,
      ]),
    )
    .digest("hex");
  expect(
    (await db.post.findUniqueOrThrow({ where: { id: first.body.id } }))
      .submissionDigest,
  ).toBe(digest);
  expect((await send(input)).body).toEqual(first.body);
  expect(
    (
      await send({
        ...input,
        occurredPrecision: "RANGE",
        occurredUntil: input.occurredOn,
      })
    ).status,
  ).toBe(409);
});
it("sorts by interval start with stable pagination and keeps unclassified legacy days searchable", async () => {
  const month = await publish(content("MONTH", "2020-01"));
  const range = await publish(content("RANGE", "2020-01-02", "2020-02-01"));
  const day = await publish(content("DAY", "2020-01-03"));
  const ids: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await request(app).get(
      `/api/v1/posts?occurredFrom=2020-01-01&occurredTo=2020-01-03&sort=OCCURRED_ASC&limit=1&page=${page}`,
    );
    expect(result.body.total).toBe(3);
    ids.push(result.body.items[0].id);
  }
  expect(ids).toEqual([month, range, day]);
  const old = await db.post.create({
    data: {
      authorId,
      subjectId,
      title: "没有新精度字段的旧记录",
      body: "这是一条旧数据兼容测试记录。",
      occurredOn: "2019-04-05",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const legacy = await request(app).get(
    "/api/v1/posts?occurredFrom=2019-04-05&occurredTo=2019-04-05",
  );
  expect(legacy.body.items[0]).toMatchObject({
    id: old.id,
    occurredOn: "2019-04-05",
    occurredPrecision: "DAY",
    occurredUntil: "",
  });
});
