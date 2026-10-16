import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, relative, sep, isAbsolute } from "node:path";
import { openDatabase, type Database } from "./db.js";
import { lockStorage } from "./storage-lock.js";

const keyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type FileDigest = { size: number; sha256: string };
type Manifest = {
  format: 1;
  createdAt: string;
  database: FileDigest;
  files: (FileDigest & { key: string })[];
  migrations: string[];
};
async function digest(path: string): Promise<FileDigest> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("备份不接受符号链接或非普通文件");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { size: stat.size, sha256: hash.digest("hex") };
}
async function copy(source: string, target: string) {
  await digest(source);
  await copyFile(source, target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
  return digest(target);
}
function inside(child: string, parent: string) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}
async function checkDatabase(db: Database) {
  const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>(
    "PRAGMA integrity_check",
  );
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("SQLite 完整性检查失败");
  if ((await db.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check")).length)
    throw new Error("数据库外键检查失败");
  const migrations = await db.$queryRawUnsafe<
    { migration_name: string; finished_at: unknown; rolled_back_at: unknown }[]
  >(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  if (migrations.some((m) => !m.finished_at && !m.rolled_back_at))
    throw new Error("存在未完成的数据库迁移，不能备份/恢复");
  return migrations
    .filter((m) => m.finished_at && !m.rolled_back_at)
    .map((m) => m.migration_name);
}
async function referencedFiles(db: Database) {
  const materials = await db.material.findMany({
    select: {
      originalKey: true,
      previewKey: true,
      publicKey: true,
      versions: { select: { publicKey: true } },
    },
  });
  const keys = new Set<string>();
  for (const item of materials)
    for (const key of [
      item.originalKey,
      item.previewKey,
      item.publicKey,
      ...item.versions.map((v) => v.publicKey),
    ]) {
      if (key === null) continue;
      if (!keyPattern.test(key)) throw new Error("数据库存在非法材料存储键");
      keys.add(key);
    }
  return [...keys].sort();
}
function parseManifest(text: string): Manifest {
  const value = JSON.parse(text) as Manifest;
  const validDigest = (entry: FileDigest) =>
    entry &&
    Number.isSafeInteger(entry.size) &&
    entry.size >= 0 &&
    /^[a-f0-9]{64}$/.test(entry.sha256);
  if (
    !value ||
    value.format !== 1 ||
    !validDigest(value.database) ||
    !Array.isArray(value.files) ||
    !value.files.every((f) => validDigest(f) && keyPattern.test(f.key)) ||
    new Set(value.files.map((f) => f.key)).size !== value.files.length ||
    !Array.isArray(value.migrations) ||
    !value.migrations.every((m) => typeof m === "string")
  )
    throw new Error("备份清单无效或格式不支持");
  return value;
}
async function sameDigest(path: string, expected: FileDigest) {
  const actual = await digest(path);
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256)
    throw new Error("备份文件缺失或校验不一致");
}

export async function verifyBackup(folder: string): Promise<Manifest> {
  const root = resolve(folder);
  if (
    !(await lstat(root)).isDirectory() ||
    !(await lstat(join(root, "uploads"))).isDirectory()
  )
    throw new Error("备份必须为普通目录");
  await digest(join(root, "manifest.json"));
  const manifest = parseManifest(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  await sameDigest(join(root, "database.db"), manifest.database);
  for (const file of manifest.files)
    await sameDigest(join(root, "uploads", file.key), file);
  const db = openDatabase(`file:${join(root, "database.db")}`);
  try {
    const migrations = await checkDatabase(db);
    const keys = await referencedFiles(db);
    if (
      JSON.stringify(migrations) !== JSON.stringify(manifest.migrations) ||
      JSON.stringify(keys) !==
        JSON.stringify(manifest.files.map((f) => f.key).sort())
    )
      throw new Error("备份清单与数据库材料/迁移关联不一致");
    const hashes = new Map(
      manifest.files.map((file) => [file.key, file.sha256]),
    );
    for (const item of await db.material.findMany({
      select: { originalKey: true, digest: true },
    }))
      if (hashes.get(item.originalKey) !== item.digest)
        throw new Error("材料原件与数据库中的上传摘要不一致");
  } finally {
    await db.$disconnect();
  }
  return manifest;
}

// Each output is a new, private directory. A manifest is written last; partial outputs are invalid.
export async function createBackup(
  database: string,
  uploads: string,
  destination: string,
) {
  const root = resolve(destination),
    source = resolve(database),
    filesRoot = resolve(uploads);
  if (
    inside(root, filesRoot) ||
    inside(source, root) ||
    inside(filesRoot, root)
  )
    throw new Error("备份目录不能包含源数据或位于材料目录内");
  await digest(source); // Do not let Prisma silently create a missing source database.
  const release = lockStorage(source, filesRoot, "backup");
  let created = false;
  let db: Database | undefined;
  try {
    await mkdir(root, { mode: 0o700 });
    created = true;
    await mkdir(join(root, "uploads"), { mode: 0o700 });
    db = openDatabase(`file:${source}`);
    await checkDatabase(db);
    await db.$executeRawUnsafe("VACUUM INTO ?", join(root, "database.db"));
    await chmod(join(root, "database.db"), 0o600);
    await db.$disconnect();
    db = openDatabase(`file:${join(root, "database.db")}`);
    const migrations = await checkDatabase(db);
    const files: Manifest["files"] = [];
    for (const key of await referencedFiles(db))
      files.push({
        key,
        ...(await copy(join(filesRoot, key), join(root, "uploads", key))),
      });
    const manifest: Manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      database: await digest(join(root, "database.db")),
      files,
      migrations,
    };
    await db.$disconnect();
    db = undefined;
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await verifyBackup(root);
    return manifest;
  } catch (error) {
    if (db) await db.$disconnect();
    if (created) await rm(root, { recursive: true, force: true });
    throw error;
  } finally {
    release();
  }
}

export async function restoreBackup(source: string, destination: string) {
  const root = resolve(destination),
    backup = resolve(source);
  if (inside(root, backup) || inside(backup, root))
    throw new Error("恢复目录与备份目录不能相互包含");
  const manifest = await verifyBackup(backup);
  await mkdir(root, { mode: 0o700 }); // No overwrite, even for an empty existing directory.
  try {
    const release = lockStorage(
      join(root, "database.db"),
      join(root, "uploads"),
      "restore",
    );
    try {
      await mkdir(join(root, "uploads"), { mode: 0o700 });
      await copy(join(backup, "database.db"), join(root, "database.db"));
      for (const file of manifest.files)
        await copy(
          join(backup, "uploads", file.key),
          join(root, "uploads", file.key),
        );
      await writeFile(
        join(root, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      await verifyBackup(root);
    } finally {
      release();
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}
