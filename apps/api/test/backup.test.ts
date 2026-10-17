import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  cpSync,
  unlinkSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { hashPassword, issueSession } from "../src/auth.js";
import { MaterialFiles } from "../src/material-files.js";
import {
  uploadMaterial,
  reviewMaterial,
  withdrawMaterial,
} from "../src/materials.js";
import { createBackup, restoreBackup, verifyBackup } from "../src/backup.js";
import { databasePath, lockStorage } from "../src/storage-lock.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-backup-"));
const source = join(dir, "source.db"),
  uploads = join(dir, "uploads"),
  snapshot = join(dir, "snapshot");
const db = openDatabase(`file:${source}`),
  files = new MaterialFiles(uploads);
const app = createApp(db, { uploadRoot: uploads });
let token: string,
  reader: string,
  admin: string,
  authorId: string,
  postId: string;
let publicId: string, privateId: string, withdrawnId: string, expected: unknown;
let expectedReviewNotices: unknown;
let original: Buffer;
const auth = (value: string) => ({ Authorization: `Bearer ${value}` });
function migrate(path: string) {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${path}` },
      stdio: "pipe",
    },
  );
}
beforeAll(async () => {
  migrate(source);
  for (const name of ["author", "reader", "admin"]) {
    const user = await db.user.create({
      data: {
        username: `backup_${name}`,
        nickname: `内部${name}`,
        role: name === "admin" ? "ADMIN" : "USER",
        passwordHash: await hashPassword("test-only-backup-password"),
      },
    });
    const session = await issueSession(db, user.id);
    if (name === "author") {
      token = session;
      authorId = user.id;
    } else if (name === "reader") reader = session;
    else admin = session;
  }
  const subject = await db.subject.create({
    data: { name: "备份虚构面馆", city: "测试市", category: "RESTAURANT" },
  });
  const input = {
    subjectId: subject.id,
    title: "用于备份恢复的虚构经历",
    body: "仅用于验证备份恢复后的公开内容、材料与权限，不涉及真实对象。",
    occurredOn: "2024-02",
    occurredPrecision: "MONTH",
    issueTypes: ["TASTE"],
    anonymous: true,
    personalExperience: true,
  };
  const post = await request(app)
    .post("/api/v1/posts")
    .set(auth(token))
    .send({ ...input, clientKey: randomUUID() });
  expect(post.status).toBe(201);
  postId = post.body.id;
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reviews/POST/${postId}/decision`)
        .set(auth(admin))
        .send({ action: "APPROVE", reason: "虚构备份案例" })
    ).status,
  ).toBe(204);
  original = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const adminId = (
    await db.user.findUniqueOrThrow({ where: { username: "backup_admin" } })
  ).id;
  for (const visibility of ["PUBLIC", "REVIEW_ONLY", "PUBLIC"] as const) {
    const material = await uploadMaterial(
      db,
      files,
      postId,
      authorId,
      { clientKey: randomUUID(), source: "虚构图片备份来源", visibility },
      original,
    );
    await reviewMaterial(db, files, material.id, adminId, {
      action: "APPROVE",
      reason: "测试隐私检查",
      privacyChecked: true,
      baseVersion: 1,
      redactions: [],
    });
    if (!publicId) publicId = material.id;
    else if (!privateId) privateId = material.id;
    else withdrawnId = material.id;
  }
  await withdrawMaterial(db, withdrawnId, authorId);
  expect(
    (
      await request(app)
        .put(`/api/v1/posts/${postId}/follow`)
        .set(auth(reader))
        .send()
    ).status,
  ).toBe(204);
  expect(
    (
      await request(app)
        .put(`/api/v1/subjects/${subject.id}/follow`)
        .set(auth(reader))
    ).status,
  ).toBe(204);
  const revision = await request(app)
    .post(`/api/v1/posts/${postId}/revisions`)
    .set(auth(token))
    .send({
      ...input,
      title: "更正后的虚构备份记录",
      baseVersion: 1,
      changeReason: "备份前核对标题并保留历史版本",
    });
  expect(revision.status).toBe(201);
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reviews/REVISION/${revision.body.id}/decision`)
        .set(auth(admin))
        .send({ action: "APPROVE", reason: "测试更正版本" })
    ).status,
  ).toBe(204);
  await reviewMaterial(db, files, publicId, adminId, {
    action: "APPROVE",
    reason: "新版复核",
    privacyChecked: true,
    baseVersion: 2,
    redactions: [],
  });
  const draft = await request(app)
    .put(`/api/v1/me/drafts/${randomUUID()}`)
    .set(auth(token))
    .send({
      ...input,
      occurredUntil: "",
      mutationKey: randomUUID(),
      version: 0,
    });
  expect(draft.status).toBe(200);
  expected = (
    await request(app).get(`/api/v1/posts/${postId}`).set(auth(reader))
  ).body;
  const notices = (
    await request(app).get("/api/v1/me/review-notifications").set(auth(token))
  ).body;
  expect(notices.total).toBeGreaterThan(0);
  expect(
    (
      await request(app)
        .patch(`/api/v1/review-notifications/${notices.items[0].id}/read`)
        .set(auth(token))
    ).status,
  ).toBe(204);
  expectedReviewNotices = (
    await request(app).get("/api/v1/me/review-notifications").set(auth(token))
  ).body;
  await files.save(Buffer.from("orphan must not be included"));
  await db.$disconnect();
  await createBackup(source, uploads, snapshot);
}, 30000);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("restores accounts, sessions, public versions, drafts, notifications and material permissions through real API reads", async () => {
  const target = join(dir, "restored");
  const manifest = await restoreBackup(snapshot, target);
  expect(manifest.files.length).toBeLessThan(readdirSync(uploads).length);
  const restored = openDatabase(`file:${join(target, "database.db")}`);
  const restoredApp = createApp(restored, {
    uploadRoot: join(target, "uploads"),
  });
  try {
    expect(
      (
        await request(restoredApp)
          .get(`/api/v1/posts/${postId}`)
          .set(auth(reader))
      ).body,
    ).toEqual(expected);
    expect(JSON.stringify(expected)).not.toContain(authorId);
    const subjectId = (expected as { subject: { id: string } }).subject.id;
    expect(
      (
        await request(restoredApp)
          .get(`/api/v1/subjects/${subjectId}`)
          .set(auth(reader))
      ).body.following,
    ).toBe(true);
    const login = await request(restoredApp).post("/api/v1/auth/login").send({
      username: "backup_author",
      password: "test-only-backup-password",
    });
    expect(login.status).toBe(200);
    expect(
      (await request(restoredApp).get("/api/v1/me").set(auth(token))).body.id,
    ).toBe(authorId);
    expect(
      (await request(restoredApp).get("/api/v1/me/drafts").set(auth(token)))
        .body.total,
    ).toBe(1);
    expect(
      (await request(restoredApp).get("/api/v1/me/drafts").set(auth(reader)))
        .body.total,
    ).toBe(0);
    expect(
      (
        await request(restoredApp)
          .get("/api/v1/notifications")
          .set(auth(reader))
      ).body.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await request(restoredApp)
          .get("/api/v1/me/review-notifications")
          .set(auth(token))
      ).body,
    ).toEqual(expectedReviewNotices);
    expect(
      (
        await request(restoredApp)
          .get("/api/v1/me/review-notifications")
          .set(auth(reader))
      ).body.total,
    ).toBe(0);
    expect(
      (
        await request(restoredApp)
          .get("/api/v1/admin/reviews")
          .set(auth(reader))
      ).status,
    ).toBe(403);
    for (const version of [1, 2])
      expect(
        (
          await request(restoredApp).get(
            `/api/v1/materials/${publicId}/public?version=${version}`,
          )
        ).status,
      ).toBe(200);
    for (const id of [privateId, withdrawnId])
      expect(
        (await request(restoredApp).get(`/api/v1/materials/${id}/public`))
          .status,
      ).toBe(404);
    expect(
      (
        await request(restoredApp).get(
          `/api/v1/materials/${privateId}/original`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(restoredApp)
          .get(`/api/v1/materials/${privateId}/original`)
          .set(auth(reader))
      ).status,
    ).toBe(404);
    const own = await request(restoredApp)
      .get(`/api/v1/materials/${privateId}/original`)
      .set(auth(token));
    expect(own.status).toBe(200);
    expect(own.body).toEqual(original);
    expect(
      (
        await request(restoredApp)
          .get(`/api/v1/materials/${privateId}/original`)
          .set(auth(admin))
      ).status,
    ).toBe(200);
    expect(await restored.auditLog.count()).toBeGreaterThan(0);
  } finally {
    await restored.$disconnect();
  }
});

it("rejects missing or changed database/material bytes before creating a restored target", async () => {
  const manifest = await verifyBackup(snapshot);
  for (const kind of ["missing", "image", "database"]) {
    const damaged = join(dir, `damaged-${kind}`),
      target = join(dir, `reject-${kind}`);
    cpSync(snapshot, damaged, { recursive: true });
    const image = join(damaged, "uploads", manifest.files[0].key);
    if (kind === "missing") unlinkSync(image);
    else
      writeFileSync(
        kind === "image" ? image : join(damaged, "database.db"),
        "changed",
      );
    await expect(restoreBackup(damaged, target)).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
  }
});

it("rejects path traversal, duplicate keys and manifests that omit database references", async () => {
  for (const kind of ["path", "duplicate", "omit"]) {
    const damaged = join(dir, `manifest-${kind}`);
    cpSync(snapshot, damaged, { recursive: true });
    const path = join(damaged, "manifest.json"),
      manifest = JSON.parse(readFileSync(path, "utf8"));
    if (kind === "path") manifest.files[0].key = "../../outside";
    if (kind === "duplicate") manifest.files.push(manifest.files[0]);
    if (kind === "omit") manifest.files.pop();
    writeFileSync(path, JSON.stringify(manifest));
    await expect(verifyBackup(damaged)).rejects.toThrow();
  }
});

it("never overwrites existing outputs or sources and rejects unsafe destination nesting", async () => {
  await expect(createBackup(source, uploads, snapshot)).rejects.toThrow();
  await expect(verifyBackup(snapshot)).resolves.toMatchObject({ format: 1 });
  const existing = join(dir, "existing");
  mkdirSync(existing);
  writeFileSync(join(existing, "keep"), "do not change");
  await expect(restoreBackup(snapshot, existing)).rejects.toThrow();
  expect(readFileSync(join(existing, "keep"), "utf8")).toBe("do not change");
  await expect(
    createBackup(source, uploads, join(uploads, "nested")),
  ).rejects.toThrow();
  await expect(
    restoreBackup(snapshot, join(snapshot, "nested")),
  ).rejects.toThrow();
  expect(databasePath(`file:${source}`)).toBe(source);
  expect(() => databasePath("file::memory:")).toThrow();
});

it("fails cleanly for missing source files without manufacturing a database or a partial backup", async () => {
  const missing = join(dir, "missing.db");
  await expect(
    createBackup(missing, uploads, join(dir, "missing-output")),
  ).rejects.toThrow();
  expect(existsSync(missing)).toBe(false);
  await expect(
    createBackup(
      source,
      join(dir, "no-uploads"),
      join(dir, "missing-files-output"),
    ),
  ).rejects.toThrow();
  expect(existsSync(join(dir, "missing-files-output"))).toBe(false);
  expect(existsSync(`${source}.secondlook.lock`)).toBe(false);
});

it("excludes simultaneous API/backup access, shared upload roots and symlink aliases, then releases locks", async () => {
  const alias = join(dir, "alias.db");
  symlinkSync(source, alias);
  const release = lockStorage(source, uploads, "api");
  try {
    await expect(
      createBackup(source, uploads, join(dir, "busy-output")),
    ).rejects.toThrow("存储正在使用");
    expect(() =>
      lockStorage(alias, join(dir, "other-uploads"), "backup"),
    ).toThrow("存储正在使用");
    expect(() => lockStorage(join(dir, "other.db"), uploads, "api")).toThrow(
      "存储正在使用",
    );
    expect(existsSync(join(dir, "other.db.secondlook.lock"))).toBe(false);
  } finally {
    release();
  }
  await expect(
    createBackup(source, uploads, join(dir, "after-lock")),
  ).resolves.toMatchObject({ format: 1 });
});

it("runs the actual CLI with explicit configuration and paths containing spaces and quotes", () => {
  const target = join(dir, "cli backup's folder"),
    restore = join(dir, "cli restored");
  const run = (operation: string, ...args: string[]) =>
    execFileSync(
      "npm",
      [
        "run",
        operation === "verify" ? "backup:verify" : operation,
        "--",
        ...args,
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: `file:${source}`,
          UPLOAD_DIR: uploads,
        },
        cwd: resolve("../.."),
        encoding: "utf8",
      },
    );
  expect(run("backup", "--to", target)).toContain("backup 完成");
  expect(run("verify", "--from", target)).toContain("verify 完成");
  expect(run("restore", "--from", target, "--to", restore)).toContain(
    "restore 完成",
  );
  expect(existsSync(join(restore, "manifest.json"))).toBe(true);
});

it("captures committed WAL data and handles a database with no material files", async () => {
  const source = join(dir, "wal.db"),
    target = join(dir, "wal-backup");
  migrate(source);
  const wal = openDatabase(`file:${source}`);
  try {
    await wal.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    await wal.$queryRawUnsafe("PRAGMA wal_autocheckpoint=0");
    await wal.subject.create({
      data: {
        name: "只在 WAL 中的虚构对象",
        city: "测试市",
        category: "OTHER",
      },
    });
    expect(existsSync(`${source}-wal`)).toBe(true);
    const manifest = await createBackup(
      source,
      join(dir, "empty-uploads"),
      target,
    );
    expect(manifest.files).toEqual([]);
    const restored = openDatabase(`file:${join(target, "database.db")}`);
    try {
      expect(await restored.subject.count()).toBe(1);
    } finally {
      await restored.$disconnect();
    }
  } finally {
    await wal.$disconnect();
  }
});

it("rejects an altered original even when its manifest hash was updated", async () => {
  const damaged = join(dir, "changed-original");
  cpSync(snapshot, damaged, { recursive: true });
  const manifestPath = join(damaged, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const sourceDb = openDatabase(`file:${source}`);
  let key: string;
  try {
    key = (
      await sourceDb.material.findUniqueOrThrow({ where: { id: publicId } })
    ).originalKey;
  } finally {
    await sourceDb.$disconnect();
  }
  const bytes = Buffer.from("different original");
  writeFileSync(join(damaged, "uploads", key), bytes);
  const entry = manifest.files.find(
    (file: { key: string }) => file.key === key,
  );
  entry.size = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  await expect(verifyBackup(damaged)).rejects.toThrow("上传摘要不一致");
});

it("refuses a database with broken foreign keys without leaving a completed output", async () => {
  const broken = join(dir, "broken.db");
  cpSync(join(snapshot, "database.db"), broken);
  const bad = openDatabase(`file:${broken}`);
  try {
    await bad.$queryRawUnsafe("PRAGMA foreign_keys=OFF");
    await bad.$executeRawUnsafe(
      `UPDATE "Post" SET "authorId" = 'missing-author'`,
    );
  } finally {
    await bad.$disconnect();
  }
  const target = join(dir, "broken-output");
  await expect(createBackup(broken, uploads, target)).rejects.toThrow(
    "外键检查失败",
  );
  expect(existsSync(target)).toBe(false);
});
