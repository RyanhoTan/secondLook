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
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession } from "../src/auth.js";
import { MaterialFiles } from "../src/material-files.js";
import { uploadMaterial, reviewMaterial } from "../src/materials.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-materials-"));
const url = `file:${join(dir, "test.db")}`,
  uploads = join(dir, "uploads");
const db = openDatabase(url),
  app = createApp(db, { uploadRoot: uploads });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let author: string,
  authorId: string,
  admin: string,
  reader: string,
  subjectId: string,
  postId: string,
  image: Buffer;
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  for (const name of ["admin", "reader"]) {
    const user = await db.user.create({
      data: {
        username: `material_${name}`,
        nickname: name,
        role: name === "admin" ? "ADMIN" : "USER",
        passwordHash: "unused-test-only",
      },
    });
    const token = await issueSession(db, user.id);
    if (name === "admin") admin = token;
    else reader = token;
  }
  subjectId = (
    await db.subject.create({
      data: { name: "材料测试虚构对象", category: "OTHER", city: "测试市" },
    })
  ).id;
  image = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#ffffff" },
  })
    .withExif({ IFD0: { Copyright: "private-test-metadata" } })
    .png()
    .toBuffer();
}, 30000);
beforeEach(async () => {
  const user = await db.user.create({
    data: {
      username: randomUUID(),
      nickname: "匿名内部昵称",
      passwordHash: "unused-test-only",
    },
  });
  authorId = user.id;
  author = await issueSession(db, user.id);
  const post = await request(app).post("/api/v1/posts").set(auth(author)).send({
    subjectId,
    title: "材料测试：完全虚构的亲历",
    body: "这是用于图片材料权限、审核与脱敏测试的虚构内容，不涉及真实单位或个人。",
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
        .send({ action: "APPROVE", reason: "虚构测试内容通过" })
    ).status,
  ).toBe(204);
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
function upload(
  options: {
    token?: string;
    bytes?: Buffer;
    key?: string;
    visibility?: string;
    source?: string;
  } = {},
) {
  return request(app)
    .post(`/api/v1/posts/${postId}/materials`)
    .set(auth(options.token ?? author))
    .field("clientKey", options.key ?? randomUUID())
    .field("visibility", options.visibility ?? "PUBLIC")
    .field("source", options.source ?? "测试截图来源说明，仅用于验证费用陈述。")
    .attach("file", options.bytes ?? image, {
      filename: "private-filename.jpg",
      contentType: "image/jpeg",
    });
}
const decide = (id: string, patch = {}) =>
  request(app)
    .post(`/api/v1/admin/materials/${id}/decision`)
    .set(auth(admin))
    .send({
      action: "APPROVE",
      reason: "检查相关性与隐私后通过",
      privacyChecked: true,
      redactions: [],
      ...patch,
    });
const getPublic = (id: string) =>
  request(app).get(`/api/v1/materials/${id}/public`);

describe("private originals, reviewed copies and upload recovery", () => {
  it("keeps pending materials private and never returns account, storage paths or original filenames", async () => {
    const item = await upload();
    expect(item.status).toBe(201);
    expect((await getPublic(item.body.id)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}/materials`)).body,
    ).toEqual([]);
    const json = JSON.stringify(item.body);
    for (const secret of [
      authorId,
      "originalKey",
      "previewKey",
      "digest",
      "private-filename",
      "mime",
    ])
      expect(json).not.toContain(secret);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("STATEMENT");
  });
  it("authorizes private reads only for the owner or admin and logs access", async () => {
    const item = (await upload()).body;
    for (const variant of ["original", "preview"]) {
      expect(
        (await request(app).get(`/api/v1/materials/${item.id}/${variant}`))
          .status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/v1/materials/${item.id}/${variant}`)
            .set(auth(reader))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .get(`/api/v1/materials/${item.id}/${variant}`)
            .set(auth(author))
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .get(`/api/v1/materials/${item.id}/${variant}`)
            .set(auth(admin))
        ).status,
      ).toBe(200);
    }
    const original = await request(app)
      .get(`/api/v1/materials/${item.id}/original`)
      .set(auth(author));
    expect(original.body.equals(image)).toBe(true);
    expect(original.headers["cache-control"]).toContain("no-store");
    expect(
      await db.auditLog.count({
        where: { targetId: item.id, action: "MATERIAL_ORIGINAL_READ" },
      }),
    ).toBe(3);
    const stored = await db.material.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(
      (await request(app).get(`/uploads/${stored.originalKey}`)).status,
    ).toBe(404);
  });
  it("rejects another user's upload, original access and owner list access", async () => {
    expect((await upload({ token: reader })).status).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/me/posts/${postId}/materials`)
          .set(auth(reader))
      ).status,
    ).toBe(404);
    const item = (await upload()).body;
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/materials/${item.id}/decision`)
          .set(auth(author))
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(`/api/v1/materials/${item.id}`)
          .set(auth(reader))
      ).status,
    ).toBe(404);
  });
  it("validates decoded format, size, pixel count and source fields", async () => {
    expect(
      (
        await upload({
          bytes: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>',
          ),
        })
      ).status,
    ).toBe(400);
    expect((await upload({ bytes: Buffer.from("not-an-image") })).status).toBe(
      400,
    );
    expect((await upload({ source: "" })).status).toBe(400);
    expect(
      (await upload({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1) })).status,
    ).toBe(413);
    const huge = await sharp({
      create: { width: 5000, height: 4001, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect((await upload({ bytes: huge })).status).toBe(400);
    expect(await db.material.count({ where: { postId } })).toBe(0);
  });
  it("handles retry idempotently and enforces per-post limits without orphan files", async () => {
    const key = randomUUID(),
      first = await upload({ key });
    expect((await upload({ key })).body.id).toBe(first.body.id);
    expect(
      (await upload({ key, source: "不同说明不能复用上传标识" })).status,
    ).toBe(409);
    for (let i = 0; i < 5; i++) expect((await upload()).status).toBe(201);
    const before = readdirSync(uploads).length;
    expect((await upload()).status).toBe(409);
    expect(readdirSync(uploads).length).toBe(before);
    expect(await db.material.count({ where: { postId } })).toBe(6);
  });
  it("burns opaque redactions into public pixels and strips EXIF metadata", async () => {
    const item = (await upload()).body;
    expect((await decide(item.id, { privacyChecked: false })).status).toBe(400);
    expect(
      (
        await decide(item.id, {
          redactions: [{ x: 0.9, y: 0, width: 0.2, height: 1 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await decide(item.id, {
          redactions: [{ x: 0.2, y: 0.2, width: 0.4, height: 0.4 }],
        })
      ).status,
    ).toBe(204);
    const response = await getPublic(item.id);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.headers["cache-control"]).toContain("no-store");
    const metadata = await sharp(response.body).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    const inside = await sharp(response.body)
      .extract({ left: 70, top: 30, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...inside].every((c) => c < 30)).toBe(true);
    const outside = await sharp(response.body)
      .extract({ left: 10, top: 10, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...outside].every((c) => c > 230)).toBe(true);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("MATERIAL");
    const listing = await request(app).get(`/api/v1/posts/${postId}/materials`);
    expect(listing.body).toHaveLength(1);
    expect(JSON.stringify(listing.body)).not.toContain(authorId);
    expect((await decide(item.id)).status).toBe(409);
  });
  it("never exposes review-only material or upgrades its public evidence label", async () => {
    const item = (
      await upload({
        visibility: "REVIEW_ONLY",
        source: "仅供审核的私密来源说明",
      })
    ).body;
    expect((await decide(item.id)).status).toBe(204);
    expect((await getPublic(item.id)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}/materials`)).body,
    ).toEqual([]);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("STATEMENT");
    expect(
      (await db.material.findUniqueOrThrow({ where: { id: item.id } }))
        .publicKey,
    ).toBeNull();
  });
  it("keeps rejected files private and returns the reason only to the author", async () => {
    const item = (await upload()).body;
    expect(
      (
        await decide(item.id, {
          action: "REJECT",
          reason: "来源说明涉及隐私，请调整后重新上传",
        })
      ).status,
    ).toBe(204);
    expect((await getPublic(item.id)).status).toBe(404);
    const own = await request(app)
      .get(`/api/v1/me/posts/${postId}/materials`)
      .set(auth(author));
    expect(own.body[0].reason).toContain("来源说明涉及隐私");
    expect(
      (await request(app).get(`/api/v1/posts/${postId}/materials`)).body,
    ).toEqual([]);
  });
  it("withdraws public copies, reevaluates labels and notifies followers once", async () => {
    const key = randomUUID();
    const item = (await upload({ key })).body;
    await decide(item.id);
    await request(app).put(`/api/v1/posts/${postId}/follow`).set(auth(reader));
    expect(
      (
        await request(app)
          .delete(`/api/v1/materials/${item.id}`)
          .set(auth(author))
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .delete(`/api/v1/materials/${item.id}`)
          .set(auth(author))
      ).status,
    ).toBe(404);
    expect((await getPublic(item.id)).status).toBe(404);
    expect((await upload({ key })).status).toBe(409);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("STATEMENT");
    expect(
      await db.notification.count({
        where: { event: { postId, kind: "MATERIAL_WITHDRAWAL" } },
      }),
    ).toBe(1);
  });
  it("requires a public parent for copies even when a material was already approved", async () => {
    const item = (await upload()).body;
    await decide(item.id);
    await db.post.update({
      where: { id: postId },
      data: { status: "RESTRICTED" },
    });
    expect((await getPublic(item.id)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}/materials`)).status,
    ).toBe(404);
    expect((await upload()).status).toBe(404);
  });
  it("cleans temporary files if a database write fails", async () => {
    const files = new MaterialFiles(join(dir, "failed-uploads"));
    const realTransaction = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((
      fn: (tx: unknown) => unknown,
    ) =>
      realTransaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, prop) {
            if (prop === "material")
              return {
                ...target.material,
                create: () => {
                  throw new Error("simulated database failure");
                },
              };
            return Reflect.get(target, prop);
          },
        });
        return fn(proxy);
      })) as typeof db.$transaction);
    try {
      await expect(
        uploadMaterial(
          db,
          files,
          postId,
          authorId,
          {
            clientKey: randomUUID(),
            source: "虚构来源，用于失败回滚",
            visibility: "PUBLIC",
          },
          image,
        ),
      ).rejects.toThrow("simulated database failure");
    } finally {
      spy.mockRestore();
    }
    expect(readdirSync(files.root)).toEqual([]);
    expect(await db.material.count({ where: { postId } })).toBe(0);
  });
  it("notifies approved public material once and rolls back a failed publication", async () => {
    await request(app).put(`/api/v1/posts/${postId}/follow`).set(auth(reader));
    const item = (await upload()).body;
    const before = readdirSync(uploads).length;
    const realTransaction = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((
      fn: (tx: unknown) => unknown,
    ) =>
      realTransaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, prop) {
            if (prop === "timelineEvent")
              return {
                ...target.timelineEvent,
                create: () => {
                  throw new Error("simulated material event failure");
                },
              };
            return Reflect.get(target, prop);
          },
        });
        return fn(proxy);
      })) as typeof db.$transaction);
    try {
      await expect(
        reviewMaterial(
          db,
          new MaterialFiles(uploads),
          item.id,
          "test-reviewer",
          {
            action: "APPROVE",
            reason: "测试审核通过",
            privacyChecked: true,
            redactions: [],
          },
        ),
      ).rejects.toThrow("simulated material event failure");
    } finally {
      spy.mockRestore();
    }
    expect(readdirSync(uploads).length).toBe(before);
    expect(
      (await db.material.findUniqueOrThrow({ where: { id: item.id } })).status,
    ).toBe("PENDING");
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("STATEMENT");
    expect((await decide(item.id)).status).toBe(204);
    expect((await decide(item.id)).status).toBe(409);
    expect(
      await db.notification.count({
        where: { event: { postId, kind: "MATERIAL_APPROVED" } },
      }),
    ).toBe(1);
  });
  it("allows prepublication attachments without bypassing the post review", async () => {
    const created = await request(app)
      .post("/api/v1/posts")
      .set(auth(author))
      .send({
        subjectId,
        title: "这条待审记录有图片",
        body: "这是一条用于验证先上传材料、后公开正文的虚构经历，还没有通过正文审核。",
        occurredOn: "2026-01-01",
        anonymous: true,
        personalExperience: true,
      });
    postId = created.body.id;
    const item = (await upload()).body;
    expect((await decide(item.id)).status).toBe(204);
    expect((await getPublic(item.id)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}/materials`)).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
          .set(auth(admin))
          .send({ action: "APPROVE", reason: "正文与材料均符合演示规则" })
      ).status,
    ).toBe(204);
    expect((await getPublic(item.id)).status).toBe(200);
    expect(
      (await request(app).get(`/api/v1/posts/${postId}`)).body.evidence,
    ).toBe("MATERIAL");
  });
  it("rate limits repeated upload attempts for each authenticated user", async () => {
    for (let i = 0; i < 30; i++)
      expect(
        (
          await request(app)
            .post(`/api/v1/posts/${postId}/materials`)
            .set(auth(author))
            .send({})
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/posts/${postId}/materials`)
          .set(auth(author))
          .send({})
      ).status,
    ).toBe(429);
  });
});
