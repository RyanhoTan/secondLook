import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-pagination-"));
const url = `file:${join(dir, "test.db")}`,
  db = openDatabase(url),
  app = createApp(db);
let author: string, reader: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const stamp = new Date("2026-01-01T00:00:00Z");
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  const a = await db.user.create({
    data: {
      username: "pagination_author",
      nickname: "匿名内部昵称",
      passwordHash: "unused-test",
    },
  });
  const r = await db.user.create({
    data: {
      username: "pagination_reader",
      nickname: "读者",
      passwordHash: "unused-test",
    },
  });
  author = await issueSession(db, a.id);
  reader = await issueSession(db, r.id);
  await db.subject.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      id: `paging-subject-${String(i).padStart(2, "0")}`,
      name: i === 0 ? "归档虚构饭店" : `分页虚构对象 ${i}`,
      category: "RESTAURANT",
      city: "测试市",
      address: `分页测试路 ${i} 号`,
      createdAt: stamp,
    })),
  });
  await db.post.createMany({
    data: Array.from({ length: 32 }, (_, i) => ({
      id: `paging-post-${String(i).padStart(2, "0")}`,
      subjectId: "paging-subject-00",
      authorId: i < 25 ? a.id : r.id,
      title: `分页虚构记录 ${i}`,
      body: "这是用于分页与权限验证的虚构经历，不能关联任何真实个人或商家。",
      occurredOn: "2026-01-01",
      anonymous: true,
      status: i < 13 || i >= 25 ? "PUBLISHED" : "PENDING",
      createdAt: stamp,
      publishedAt: i < 13 || i >= 25 ? stamp : null,
    })),
  });
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
it("pages the owner's records deterministically without exposing another account's posts", async () => {
  expect((await request(app).get("/api/v1/me/posts")).status).toBe(401);
  const pages = [];
  for (let page = 1; page <= 3; page++) {
    const res = await request(app)
      .get(`/api/v1/me/posts?page=${page}`)
      .set(auth(author));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(page);
    pages.push(res.body.items);
  }
  expect(pages.map((p) => p.length)).toEqual([12, 12, 1]);
  const ids = pages.flat().map((p: { id: string }) => p.id);
  expect(new Set(ids).size).toBe(25);
  expect(ids).toEqual([...ids].sort().reverse());
  const other = await request(app).get("/api/v1/me/posts").set(auth(reader));
  expect(other.body.total).toBe(7);
  expect(
    other.body.items.every((p: { id: string }) => !ids.includes(p.id)),
  ).toBe(true);
});
it("pages public object experiences while excluding pending records and private account data", async () => {
  const first = (
    await request(app).get("/api/v1/posts?subjectId=paging-subject-00")
  ).body;
  const second = (
    await request(app).get("/api/v1/posts?subjectId=paging-subject-00&page=2")
  ).body;
  expect(first.total).toBe(20);
  expect(first.items).toHaveLength(12);
  expect(second.items).toHaveLength(8);
  const items = [...first.items, ...second.items];
  expect(new Set(items.map((p) => p.id)).size).toBe(20);
  expect(items.some((p) => p.id === "paging-post-20")).toBe(false);
  expect(JSON.stringify(items)).not.toContain("匿名内部昵称");
  expect(
    (await request(app).get("/api/v1/subjects/paging-subject-00")).body
      .postCount,
  ).toBe(20);
});
it("finds an object beyond the first fifty by its name or branch address", async () => {
  const first = await request(app).get("/api/v1/subjects?limit=50");
  expect(
    first.body.items.some((s: { id: string }) => s.id === "paging-subject-00"),
  ).toBe(false);
  for (const q of ["归档虚构", "分页测试路 0 号"]) {
    const result = await request(app).get("/api/v1/subjects").query({ q });
    expect(result.body.total).toBe(1);
    expect(result.body.items[0].id).toBe("paging-subject-00");
  }
});
it("rejects invalid paging values and retains totals for an empty later page", async () => {
  for (const query of ["page=0", "page=abc", "limit=51", "page=10001"]) {
    expect(
      (await request(app).get(`/api/v1/me/posts?${query}`).set(auth(author)))
        .status,
    ).toBe(400);
  }
  const empty = await request(app)
    .get("/api/v1/me/posts?page=9")
    .set(auth(author));
  expect(empty.body.items).toEqual([]);
  expect(empty.body.total).toBe(25);
});
