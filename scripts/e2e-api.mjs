import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "secondlook-browser-"));
const env = {
  ...process.env,
  DATABASE_URL: `file:${join(dir, "test.db")}`,
  PORT: String(Number(process.env.SECONDLOOK_E2E_API_PORT ?? 3101)),
  SEED_ADMIN_PASSWORD: "test-only-admin-2026",
  SEED_DEMO_PASSWORD: "test-only-demo-2026",
  WEB_ORIGINS: `http://127.0.0.1:${Number(process.env.SECONDLOOK_E2E_WEB_PORT ?? 5174)}`,
};
const options = { cwd: resolve(root, "apps/api"), env, stdio: "inherit" };
try {
  execFileSync(
    process.execPath,
    [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    options,
  );
  execFileSync(
    process.execPath,
    [resolve(root, "node_modules/tsx/dist/cli.mjs"), "src/seed.ts"],
    options,
  );
  const child = spawn(
    process.execPath,
    [resolve(root, "node_modules/tsx/dist/cli.mjs"), "src/server.ts"],
    options,
  );
  let stopping = false;
  function stop() {
    if (!stopping) {
      stopping = true;
      child.kill("SIGTERM");
    }
  }
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(stopping ? 0 : (code ?? 1));
  });
} catch (error) {
  rmSync(dir, { recursive: true, force: true });
  throw error;
}
