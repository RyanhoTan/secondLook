import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-material-queue-"));
const url = `file:${join(dir, "test.db")}`;
const db = openDatabase(url),
  app = createApp(db, { uploadRoot: join(dir, "uploads") });
let authorId: string,
  admin: string,
  author: string,
  subjectId: string,
  pendingPostId: string;
const parents: string[] = [];
const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
const queue = (query = "", token = admin) =>
  request(app).get(`/api/v1/admin/material-queue${query}`).set(auth(token));
async function post(title: string, status = "PUBLISHED", currentVersion = 1) {
  return db.post.create({
    data: {
      authorId,
      subjectId,
      title,
      body: "虚构材料队列正文，不涉及真实对象与个人。",
      occurredOn: "2024-02-01",
      occurredUntil: "2024-02-29",
      occurredPrecision: "MONTH",
      status,
      currentVersion,
    },
  });
}
async function material(
  postId: string,
  id: string,
  status = "PENDING",
  visibility = "PUBLIC",
  version = 1,
  source = "虚构图片来源说明",
) {
  return db.material.create({
    data: {
      postId,
      id,
      uploaderId: authorId,
      clientKey: randomUUID(),
      status,
      visibility,
      source,
      submittedVersion: 1,
      reviewVersion: version,
      originalKey: randomUUID(),
      previewKey: randomUUID(),
      digest: "test-private-digest",
      mime: "image/png",
      width: 100,
      height: 100,
      size: 100,
      createdAt: new Date("2024-01-02"),
      versions: {
        create: {
          version,
          status: status === "NEEDS_REVIEW" ? "PENDING" : status,
        },
      },
    },
  });
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const role of ["ADMIN", "USER"]) {
    const u = await db.user.create({
      data: {
        username: `mq_${role}`,
        nickname: "内部匿名昵称",
        passwordHash: "unused-test-only",
        role,
      },
    });
    const token = await issueSession(db, u.id);
    if (role === "ADMIN") admin = token;
    else {
      author = token;
      authorId = u.id;
    }
  }
  subjectId = (
    await db.subject.create({
      data: { name: "MaterialQueueSubject", city: "测试市", category: "OTHER" },
    })
  ).id;
  for (let i = 0; i < 20; i++) {
    const p = await post(i === 0 ? "MaterialTitleNeedle" : `虚构材料亲历 ${i}`);
    parents.push(p.id);
    if (i === 1)
      await db.post.update({
        where: { id: p.id },
        data: { body: "MaterialBodyNeedle：用于检索的虚构正文" },
      });
    for (let j = 0; j < 6; j++) {
      const n = i * 6 + j;
      await material(
        p.id,
        `item-${String(n).padStart(3, "0")}`,
        "PENDING",
        n % 2 === 0 ? "PUBLIC" : "REVIEW_ONLY",
        1,
        n === 0 ? "MaterialSourceNeedle" : `虚构图片来源说明 ${n}`,
      );
    }
  }
  await db.$executeRawUnsafe(
    "UPDATE Material SET createdAt=? WHERE id=?",
    "2024-01-01 00:00:00",
    "item-000",
  );
  const corrected = await post("虚构新版复核正文", "PUBLISHED", 2);
  for (let i = 0; i < 2; i++) {
    await material(
      corrected.id,
      `recheck-${i}`,
      "NEEDS_REVIEW",
      i === 0 ? "PUBLIC" : "REVIEW_ONLY",
      2,
    );
    await db.material.update({
      where: { id: `recheck-${i}` },
      data: { createdAt: new Date("2024-01-03") },
    });
  }
  pendingPostId = (await post("虚构首次待审正文", "PENDING")).id;
  await material(pendingPostId, "pending-parent");
  await db.material.update({
    where: { id: "pending-parent" },
    data: { createdAt: new Date("2024-01-04") },
  });
  for (const status of ["APPROVED", "REJECTED", "WITHDRAWN"])
    await material(parents[0], `excluded-${status}`, status);
  for (const status of ["LIMITED", "REJECTED"])
    await material(
      (await post("不可审核的父帖", status)).id,
      `hidden-${status}`,
    );
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("requires admin before parsing and strips uploader, private storage and original metadata from DTOs", async () => {
  expect(
    (await request(app).get("/api/v1/admin/material-queue?limit=bad")).status,
  ).toBe(401);
  const denied = await queue("?limit=bad", author);
  expect(denied.status).toBe(403);
  expect(JSON.stringify(denied.body)).not.toContain("MaterialSourceNeedle");
  const result = await queue();
  expect(result.status).toBe(200);
  expect(result.headers["cache-control"]).toContain("no-store");
  expect(result.body.items).toHaveLength(12);
  expect(result.body.total).toBe(123);
  for (const row of result.body.items) {
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "source",
        "width",
        "height",
        "createdAt",
        "version",
        "visibility",
        "status",
        "reason",
        "submittedVersion",
        "postId",
        "postTitle",
        "subjectName",
        "postBody",
        "postOccurrenceLabel",
      ].sort(),
    );
    expect(row.postOccurrenceLabel).toBe("2024 年 02 月（月份）");
  }
  expect(JSON.stringify(result.body)).not.toContain(authorId);
  expect(JSON.stringify(result.body)).not.toContain("test-private-digest");
});
it("reads past one hundred in stable upload order including mixed timestamp storage and empty pages", async () => {
  const ids: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await queue(`?limit=50&page=${page}`);
    expect(result.body.total).toBe(123);
    expect(result.body.page).toBe(page);
    ids.push(...result.body.items.map((m: { id: string }) => m.id));
  }
  expect(ids).toHaveLength(123);
  expect(new Set(ids).size).toBe(123);
  expect(ids[0]).toBe("item-000");
  expect(ids.slice(-3)).toEqual(["recheck-0", "recheck-1", "pending-parent"]);
  expect(
    (await queue("?limit=50&page=2")).body.items.map(
      (m: { id: string }) => m.id,
    ),
  ).toEqual(ids.slice(50, 100));
  expect((await queue("?limit=50&page=4")).body).toMatchObject({
    total: 123,
    items: [],
  });
  const legacy = await request(app).get("/api/v1/admin/materials").set(auth());
  expect(legacy.status).toBe(200);
  expect(legacy.body).toHaveLength(100);
});
it("filters review status and visibility while retaining the current body and version", async () => {
  expect((await queue("?status=PENDING")).body.total).toBe(121);
  expect((await queue("?visibility=PUBLIC")).body.total).toBe(62);
  expect((await queue("?visibility=REVIEW_ONLY")).body.total).toBe(61);
  const result = await queue("?status=NEEDS_REVIEW&visibility=REVIEW_ONLY");
  expect(result.body.total).toBe(1);
  expect(result.body.items[0]).toMatchObject({
    id: "recheck-1",
    version: 2,
    submittedVersion: 1,
    postTitle: "虚构新版复核正文",
    visibility: "REVIEW_ONLY",
  });
});
it("searches literal source/title/body/object text and rejects invalid or repeated parameters", async () => {
  for (const [q, total] of [
    ["materialsourceneedle", 1],
    ["materialtitleneedle", 6],
    ["materialbodyneedle", 6],
    ["materialqueuesubject", 123],
    ["%", 0],
    ["_", 0],
    ["' OR 1=1 --", 0],
  ] as const)
    expect((await queue(`?q=${encodeURIComponent(q)}`)).body.total, q).toBe(
      total,
    );
  for (const query of [
    "?page=0",
    "?page=1&page=2",
    "?limit=51",
    "?status=APPROVED",
    "?status=PENDING&status=NEEDS_REVIEW",
    "?visibility=SECRET",
    "?visibility=PUBLIC&visibility=REVIEW_ONLY",
    "?q=a&q=b",
    `?q=${"a".repeat(101)}`,
  ])
    expect((await queue(query)).status, query).toBe(400);
});
it("removes restricted-parent and withdrawn materials from both counts and content", async () => {
  await db.post.update({
    where: { id: parents[0] },
    data: { status: "LIMITED" },
  });
  try {
    expect((await queue()).body.total).toBe(117);
    expect((await queue("?q=materialtitleneedle")).body.items).toEqual([]);
  } finally {
    await db.post.update({
      where: { id: parents[0] },
      data: { status: "PUBLISHED" },
    });
  }
  expect(
    (await request(app).delete("/api/v1/materials/item-001").set(auth(author)))
      .status,
  ).toBe(204);
  expect((await queue()).body.total).toBe(122);
});
it("rejects a pending parent's material once and refreshes the queue without changing publication", async () => {
  const decide = () =>
    request(app)
      .post("/api/v1/admin/materials/pending-parent/decision")
      .set(auth())
      .send({
        action: "REJECT",
        reason: "虚构材料不予通过",
        privacyChecked: false,
        redactions: [],
        baseVersion: 1,
      });
  expect((await decide()).status).toBe(204);
  expect((await decide()).status).toBe(409);
  expect((await queue()).body.total).toBe(121);
  expect((await queue("?q=虚构首次待审正文")).body.items).toEqual([]);
  expect(
    (await db.post.findUniqueOrThrow({ where: { id: pendingPostId } })).status,
  ).toBe("PENDING");
  expect(
    await db.auditLog.count({
      where: { targetId: "pending-parent", action: "MATERIAL_REJECT" },
    }),
  ).toBe(1);
});
