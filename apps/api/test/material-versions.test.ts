import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
import { MaterialFiles } from "../src/material-files.js";
const dir = mkdtempSync(join(tmpdir(), "secondlook-material-versions-"));
const url = `file:${join(dir, "test.db")}`,
  uploads = join(dir, "uploads");
const db = openDatabase(url),
  app = createApp(db, { uploadRoot: uploads });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const migrate = (databaseUrl: string) =>
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
  );
let author: string,
  admin: string,
  reader: string,
  postId: string,
  subjectId: string,
  image: Buffer;
beforeAll(async () => {
  migrate(url);
  for (const name of ["author", "admin", "reader"]) {
    const user = await db.user.create({
      data: {
        username: `material_version_${name}`,
        nickname: name,
        role: name === "admin" ? "ADMIN" : "USER",
        passwordHash: "unused-test-only",
      },
    });
    const token = await issueSession(db, user.id);
    if (name === "author") author = token;
    else if (name === "admin") admin = token;
    else reader = token;
  }
  subjectId = (
    await db.subject.create({
      data: {
        name: "版本材料虚构饭店",
        category: "RESTAURANT",
        city: "测试市",
      },
    })
  ).id;
  image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
}, 30000);
beforeEach(async () => {
  const post = await request(app).post("/api/v1/posts").set(auth(author)).send({
    clientKey: randomUUID(),
    subjectId,
    title: "版本材料：虚构的原始经历",
    body: "这是一条用于版本材料关联验证的虚构经历，初始描述仅适用于第一版正文。",
    occurredOn: "2026-01-01",
    anonymous: true,
    personalExperience: true,
  });
  postId = post.body.id;
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
        .set(auth(admin))
        .send({ action: "APPROVE", reason: "初始正文虚构审核通过" })
    ).status,
  ).toBe(204);
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
async function upload(visibility = "PUBLIC") {
  const result = await request(app)
    .post(`/api/v1/posts/${postId}/materials`)
    .set(auth(author))
    .field("clientKey", randomUUID())
    .field("visibility", visibility)
    .field("source", "虚构材料来源，仅支持所关联版本中的具体陈述。")
    .attach("file", image, { filename: "test.png", contentType: "image/png" });
  expect(result.status).toBe(201);
  return result.body.id as string;
}
const assess = (id: string, baseVersion: number, action = "APPROVE") =>
  request(app)
    .post(`/api/v1/admin/materials/${id}/decision`)
    .set(auth(admin))
    .send({
      baseVersion,
      action,
      reason: "对该版本重新检查相关性与隐私",
      privacyChecked: true,
      redactions: [],
    });
async function revision(baseVersion: number, approve = true) {
  const result = await request(app)
    .post(`/api/v1/posts/${postId}/revisions`)
    .set(auth(author))
    .send({
      baseVersion,
      title: `版本材料：更正后的第 ${baseVersion + 1} 版`,
      body: `这是一条虚构的修订正文，现在说明第 ${baseVersion + 1} 版中的新情况，需要重新检查材料相关性。`,
      occurredOn: "2026-01-02",
      changeReason: "核对之后修正原文的具体说明与日期。",
    });
  expect(result.status).toBe(201);
  if (approve) expect((await approveRevision(result.body.id)).status).toBe(204);
  return result.body.id as string;
}
const approveRevision = (id: string) =>
  request(app)
    .post(`/api/v1/admin/reviews/REVISION/${id}/decision`)
    .set(auth(admin))
    .send({ action: "APPROVE", reason: "更正正文审核通过" });
const list = (version?: number) =>
  request(app).get(
    `/api/v1/posts/${postId}/materials${version ? `?version=${version}` : ""}`,
  );
const bytes = (id: string, version?: number) =>
  request(app).get(
    `/api/v1/materials/${id}/public${version ? `?version=${version}` : ""}`,
  );
const detail = () => request(app).get(`/api/v1/posts/${postId}`);

it("does not alter approved material while a text correction is only pending", async () => {
  const id = await upload();
  await assess(id, 1);
  await revision(1, false);
  expect((await detail()).body.evidence).toBe("MATERIAL");
  expect((await list()).body[0].version).toBe(1);
  expect((await db.material.findUniqueOrThrow({ where: { id } })).status).toBe(
    "APPROVED",
  );
});
it("isolates earlier approvals until the new version is explicitly reviewed", async () => {
  const id = await upload();
  await assess(id, 1);
  const old = await db.materialVersion.findUniqueOrThrow({
    where: { materialId_version: { materialId: id, version: 1 } },
  });
  await revision(1);
  expect((await detail()).body.evidence).toBe("STATEMENT");
  expect((await list()).body).toEqual([]);
  expect((await bytes(id)).status).toBe(404);
  expect((await bytes(id, 1)).status).toBe(200);
  expect((await list(1)).body[0].version).toBe(1);
  const own = await request(app)
    .get(`/api/v1/me/posts/${postId}/materials`)
    .set(auth(author));
  expect(own.body[0]).toMatchObject({
    status: "NEEDS_REVIEW",
    submittedVersion: 1,
    version: 2,
  });
  const queue = await request(app)
    .get("/api/v1/admin/materials")
    .set(auth(admin));
  expect(queue.body.find((m: { id: string }) => m.id === id)).toMatchObject({
    version: 2,
    postBody: expect.stringContaining("第 2 版"),
  });
  expect((await assess(id, 1)).status).toBe(409);
  expect((await assess(id, 2)).status).toBe(204);
  expect((await list()).body[0].version).toBe(2);
  expect((await detail()).body.evidence).toBe("MATERIAL");
  expect(
    (await detail()).body.timeline.some(
      (event: { title: string }) => event.title === "材料已完成第 2 版复核",
    ),
  ).toBe(true);
  expect(
    (
      await db.materialVersion.findUniqueOrThrow({
        where: { materialId_version: { materialId: id, version: 1 } },
      })
    ).publicKey,
  ).toBe(old.publicKey);
  expect((await assess(id, 2)).status).toBe(409);
});
it("keeps an earlier approval when relevance is rejected for the newer version", async () => {
  const id = await upload();
  await assess(id, 1);
  await revision(1);
  await assess(id, 2, "REJECT");
  expect((await list()).body).toEqual([]);
  expect((await bytes(id, 1)).status).toBe(200);
  await revision(2);
  expect((await db.material.findUniqueOrThrow({ where: { id } })).status).toBe(
    "NEEDS_REVIEW",
  );
  expect((await assess(id, 3)).status).toBe(204);
  expect((await list()).body[0].version).toBe(3);
});
it("blocks history materials and old image URLs when the corresponding version is hidden", async () => {
  const id = await upload();
  await assess(id, 1);
  await revision(1);
  const history = (await detail()).body.history.find(
    (r: { version: number }) => r.version === 1,
  );
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/history/${history.id}/hide`)
        .set(auth(admin))
        .send({ reason: "旧版含虚构隐私信息，限制展示" })
    ).status,
  ).toBe(204);
  expect((await list(1)).status).toBe(404);
  expect((await bytes(id, 1)).status).toBe(404);
  expect(
    (
      await request(app)
        .get(`/api/v1/materials/${id}/preview`)
        .set(auth(author))
    ).status,
  ).toBe(200);
});
it("rejects a stale in-flight decision and cleans its generated copy", async () => {
  const id = await upload(),
    revisionId = await revision(1, false);
  const before = readdirSync(uploads).length;
  const real = MaterialFiles.prototype.redacted;
  const spy = vi
    .spyOn(MaterialFiles.prototype, "redacted")
    .mockImplementationOnce(async function (this: MaterialFiles, ...args) {
      expect((await approveRevision(revisionId)).status).toBe(204);
      return real.apply(this, args);
    });
  try {
    expect((await assess(id, 1)).status).toBe(409);
  } finally {
    spy.mockRestore();
  }
  expect(readdirSync(uploads).length).toBe(before);
  expect(
    (await db.material.findUniqueOrThrow({ where: { id } })).reviewVersion,
  ).toBe(2);
  expect((await bytes(id)).status).toBe(404);
  expect((await assess(id, 2)).status).toBe(204);
});
it("withdraws a material that is awaiting re-review across all public versions", async () => {
  const id = await upload();
  await assess(id, 1);
  await revision(1);
  await request(app).put(`/api/v1/posts/${postId}/follow`).set(auth(reader));
  expect(
    (await request(app).delete(`/api/v1/materials/${id}`).set(auth(author)))
      .status,
  ).toBe(204);
  expect((await bytes(id, 1)).status).toBe(404);
  expect((await list(1)).body).toEqual([]);
  expect(
    await db.notification.count({
      where: { event: { postId, kind: "MATERIAL_WITHDRAWAL" } },
    }),
  ).toBe(1);
});
it("retains review-only privacy for every version", async () => {
  const id = await upload("REVIEW_ONLY");
  await assess(id, 1);
  await revision(1);
  await assess(id, 2);
  for (const version of [1, 2]) {
    expect((await bytes(id, version)).status).toBe(404);
    expect((await list(version)).body).toEqual([]);
  }
  expect((await detail()).body.evidence).toBe("STATEMENT");
});
it("rolls back material scheduling if correction publication fails", async () => {
  const id = await upload();
  await assess(id, 1);
  const revisionId = await revision(1, false);
  const transaction = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((
    fn: (tx: unknown) => unknown,
  ) =>
    transaction(async (tx) => {
      return fn(
        new Proxy(tx, {
          get(target, prop) {
            if (prop === "timelineEvent")
              return {
                ...target.timelineEvent,
                create: () => {
                  throw new Error("simulated correction failure");
                },
              };
            return Reflect.get(target, prop);
          },
        }),
      );
    })) as typeof db.$transaction);
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await approveRevision(revisionId)).status).toBe(500);
  } finally {
    spy.mockRestore();
    logger.mockRestore();
  }
  expect((await db.material.findUniqueOrThrow({ where: { id } })).status).toBe(
    "APPROVED",
  );
  expect(await db.materialVersion.count({ where: { materialId: id } })).toBe(1);
  expect((await detail()).body.currentVersion).toBe(1);
  expect((await detail()).body.evidence).toBe("MATERIAL");
});
it("does not invent a legacy version link for already-revised posts during migration", async () => {
  const legacyUrl = `file:${join(dir, "legacy.db")}`,
    legacy = openDatabase(legacyUrl);
  try {
    migrate(legacyUrl);
    const user = await legacy.user.create({
      data: {
        username: "legacy",
        nickname: "测试",
        passwordHash: "unused-test",
      },
    });
    const subject = await legacy.subject.create({
      data: { name: "旧版迁移虚构对象", city: "测试市", category: "OTHER" },
    });
    const post = await legacy.post.create({
      data: {
        authorId: user.id,
        subjectId: subject.id,
        title: "旧版虚构记录",
        body: "仅用于迁移测试的虚构正文。",
        occurredOn: "2026-01-01",
        status: "PUBLISHED",
        currentVersion: 2,
        evidence: "MATERIAL",
      },
    });
    const material = await legacy.material.create({
      data: {
        postId: post.id,
        uploaderId: user.id,
        clientKey: randomUUID(),
        source: "旧版材料，无法确定上传时正文版本",
        status: "APPROVED",
        visibility: "PUBLIC",
        originalKey: randomUUID(),
        previewKey: randomUUID(),
        publicKey: randomUUID(),
        digest: "legacy",
        mime: "image/png",
        width: 80,
        height: 60,
        size: 100,
      },
    });
    const sql = readFileSync(
      resolve(
        "prisma/migrations/20261016012000_backfill_material_versions/migration.sql",
      ),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await legacy.$executeRawUnsafe(statement);
    expect(
      await legacy.material.findUniqueOrThrow({ where: { id: material.id } }),
    ).toMatchObject({
      submittedVersion: null,
      reviewVersion: 2,
      status: "NEEDS_REVIEW",
    });
    expect(
      (
        await legacy.materialVersion.findFirstOrThrow({
          where: { materialId: material.id },
        })
      ).publicKey,
    ).toBeNull();
    expect(
      (await legacy.post.findUniqueOrThrow({ where: { id: post.id } }))
        .evidence,
    ).toBe("STATEMENT");
  } finally {
    await legacy.$disconnect();
  }
});
