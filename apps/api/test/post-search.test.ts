import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-post-search-")),
  url = `file:${join(dir, "test.db")}`;
const db = openDatabase(url),
  app = createApp(db);
let authorId: string,
  otherId: string,
  author: string,
  admin: string,
  restaurant: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (query: string) => request(app).get(`/api/v1/posts?${query}`);
const ids = (result: { body: { items: { id: string }[] } }) =>
  result.body.items.map((p) => p.id);
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  authorId = (
    await db.user.create({
      data: {
        username: "search_author",
        nickname: "不应显示的搜索作者",
        passwordHash: "unused-test-only",
      },
    })
  ).id;
  otherId = (
    await db.user.create({
      data: {
        username: "search_other",
        nickname: "另一个匿名搜索作者",
        passwordHash: "unused-test-only",
      },
    })
  ).id;
  author = await issueSession(db, authorId);
  const administrator = await db.user.create({
    data: {
      username: "search_admin",
      nickname: "管理员",
      passwordHash: "unused-test-only",
      role: "ADMIN",
    },
  });
  admin = await issueSession(db, administrator.id);
  restaurant = (
    await db.subject.create({
      data: {
        name: "范围测试虚构面馆",
        category: "RESTAURANT",
        city: "杭州",
        address: "虚构东街 100 号",
      },
    })
  ).id;
  const company = (
    await db.subject.create({
      data: {
        name: "范围测试虚构公司",
        category: "COMPANY",
        city: "杭州",
        address: "虚构西街 300 号",
      },
    })
  ).id;
  const attraction = (
    await db.subject.create({
      data: {
        name: "范围测试虚构景点",
        category: "ATTRACTION",
        city: "南京",
        address: "虚构东街 200 号",
      },
    })
  ).id;
  const make = (
    id: string,
    subjectId: string,
    occurredOn: string,
    publishedAt: Date,
    status = "PUBLISHED",
    owner = authorId,
  ) =>
    db.post.create({
      data: {
        id,
        authorId: owner,
        subjectId,
        title: `筛选样本：${id}`,
        body: "这是一条用于日期范围、排序和公开隔离验证的虚构经历，不能视为真实投诉。",
        occurredOn,
        publishedAt,
        anonymous: true,
        status,
      },
    });
  for (let day = 1; day <= 16; day++)
    await make(
      `search-day-${String(day).padStart(2, "0")}`,
      restaurant,
      `2026-01-${String(day).padStart(2, "0")}`,
      new Date(`2026-03-${String(17 - day).padStart(2, "0")}T00:00:00Z`),
    );
  for (const id of ["search-tie-a", "search-tie-b"])
    await make(
      id,
      restaurant,
      "2026-01-10",
      new Date("2026-03-07T00:00:00Z"),
      "PUBLISHED",
      otherId,
    );
  await make(
    "search-company",
    company,
    "2026-01-10",
    new Date("2026-03-05T00:00:00Z"),
  );
  await make(
    "search-attraction",
    attraction,
    "2026-01-10",
    new Date("2026-03-05T00:00:00Z"),
  );
  for (const status of ["PENDING", "REJECTED", "RESTRICTED", "WITHDRAWN"])
    await make(
      `search-hidden-${status}`,
      restaurant,
      "2026-01-10",
      new Date("2026-03-30T00:00:00Z"),
      status,
    );
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("combines inclusive occurrence bounds with city, category and text search", async () => {
  const result = await get(
    "occurredFrom=2026-01-10&occurredTo=2026-01-10&city=杭州&category=RESTAURANT&q=筛选样本",
  );
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(3);
  expect(ids(result)).toEqual([
    "search-tie-b",
    "search-tie-a",
    "search-day-10",
  ]);
  expect(
    result.body.items.every(
      (p: { occurredOn: string }) => p.occurredOn === "2026-01-10",
    ),
  ).toBe(true);
});
it("supports open bounds, empty bounds, empty results and exact object scope", async () => {
  expect(
    (await get(`subjectId=${restaurant}&occurredFrom=2026-01-15`)).body.total,
  ).toBe(2);
  expect(
    (await get(`subjectId=${restaurant}&occurredTo=2026-01-02`)).body.total,
  ).toBe(2);
  expect((await get("occurredFrom=&occurredTo=")).body.total).toBe(20);
  expect(
    (await get("occurredFrom=2025-01-01&occurredTo=2025-12-31")).body.total,
  ).toBe(0);
});
it("distinguishes publication order from both occurrence orders", async () => {
  const scope = `subjectId=${restaurant}&limit=50`;
  expect(ids(await get(scope)).slice(0, 2)).toEqual([
    "search-day-01",
    "search-day-02",
  ]);
  expect(ids(await get(`${scope}&sort=OCCURRED_DESC`)).slice(0, 2)).toEqual([
    "search-day-16",
    "search-day-15",
  ]);
  expect(ids(await get(`${scope}&sort=OCCURRED_ASC`)).slice(0, 2)).toEqual([
    "search-day-01",
    "search-day-02",
  ]);
});
it("keeps ties stable across pages without duplicate or missing results", async () => {
  const scope = `subjectId=${restaurant}&sort=OCCURRED_DESC`;
  const all = ids(await get(`${scope}&limit=50`));
  const paged: string[] = [];
  for (let page = 1; page <= 6; page++) {
    const result = await get(`${scope}&limit=3&page=${page}`);
    expect(result.body.total).toBe(18);
    paged.push(...ids(result));
  }
  expect(paged).toEqual(all);
  expect(new Set(paged).size).toBe(18);
  expect(all.slice(6, 9)).toEqual([
    "search-tie-b",
    "search-tie-a",
    "search-day-10",
  ]);
});
it("searches object addresses together with category and occurrence range", async () => {
  expect(
    (
      await get(
        "q=虚构东街&category=ATTRACTION&occurredFrom=2026-01-10&occurredTo=2026-01-10",
      )
    ).body.items[0].id,
  ).toBe("search-attraction");
  expect((await get("q=不存在的门店地址")).body.total).toBe(0);
});
it("never exposes restricted records or anonymous account links in filters or totals", async () => {
  const result = await get(
    "q=筛选样本&occurredFrom=2026-01-01&occurredTo=2026-01-31&limit=50&sort=OCCURRED_ASC",
  );
  expect(result.body.total).toBe(20);
  const body = JSON.stringify(result.body);
  for (const text of [
    authorId,
    otherId,
    "不应显示的搜索作者",
    "search-hidden-",
  ])
    expect(body).not.toContain(text);
});
it("rejects invalid calendar dates, reversed bounds, unknown sort and repeated filter values", async () => {
  for (const query of [
    "occurredFrom=2026-02-30",
    "occurredTo=2026-13-01",
    "occurredFrom=2026-01-11&occurredTo=2026-01-10",
    "sort=POPULAR",
    "occurredFrom=2026-01-01&occurredFrom=2026-01-02",
    "subjectId=a&subjectId=b",
  ])
    expect((await get(query)).status, query).toBe(400);
});
it("uses only approved correction dates in filtering and occurrence sorting", async () => {
  const id = "search-day-16";
  const revision = await request(app)
    .post(`/api/v1/posts/${id}/revisions`)
    .set(auth(author))
    .send({
      title: "修订之后的虚构日期范围样本",
      body: "核对后将发生日期更正为二月，材料仅为测试，不对应任何真实单位或个人。",
      occurredOn: "2026-02-01",
      baseVersion: 1,
      changeReason: "虚构日期的更正说明，用于验证公开筛选。",
    });
  expect(revision.status).toBe(201);
  expect(
    ids(await get("occurredFrom=2026-01-16&occurredTo=2026-01-16")),
  ).toContain(id);
  expect(
    (await get("occurredFrom=2026-02-01&occurredTo=2026-02-01")).body.total,
  ).toBe(0);
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reviews/REVISION/${revision.body.id}/decision`)
        .set(auth(admin))
        .send({ action: "APPROVE", reason: "虚构修订审核通过" })
    ).status,
  ).toBe(204);
  expect(
    (await get("occurredFrom=2026-01-16&occurredTo=2026-01-16")).body.total,
  ).toBe(0);
  const current = await get("occurredFrom=2026-02-01&occurredTo=2026-02-01");
  expect(ids(current)).toEqual([id]);
  expect(current.body.items[0].currentVersion).toBe(2);
  expect(ids(await get("sort=OCCURRED_DESC"))[0]).toBe(id);
});
