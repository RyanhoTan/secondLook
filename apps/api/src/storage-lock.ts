import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export function databasePath(
  url = process.env.DATABASE_URL ?? "file:./data/dev.db",
) {
  if (!url.startsWith("file:") || /[?#]/.test(url) || url.includes(":memory:"))
    throw new Error("维护工具仅支持本地 file: SQLite 路径");
  return resolve(url.slice(5));
}

function canonical(path: string): string {
  return existsSync(path)
    ? realpathSync(path)
    : resolve(canonical(dirname(path)), path.slice(dirname(path).length + 1));
}

// API and offline maintenance share these locks. Never guess that an old lock is safe to remove.
export function lockStorage(
  database: string,
  uploads: string,
  operation: string,
) {
  const acquired: string[] = [];
  const release = () => {
    for (const path of acquired.splice(0).reverse()) unlinkSync(path);
  };
  try {
    for (const root of [
      ...new Set([database, uploads].map((p) => canonical(resolve(p)))),
    ].sort()) {
      const path = `${root}.secondlook.lock`;
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      let fd: number;
      try {
        fd = openSync(path, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error(
            `存储正在使用或留有未清理的锁：${path}。请先停止 API/维护进程；异常退出遗留锁须核对进程后手动清理。`,
          );
        throw error;
      }
      acquired.push(path);
      try {
        writeFileSync(
          fd,
          JSON.stringify({
            pid: process.pid,
            operation,
            createdAt: new Date().toISOString(),
          }),
        );
      } finally {
        closeSync(fd);
      }
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
