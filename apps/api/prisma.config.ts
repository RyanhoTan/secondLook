import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, openSync, closeSync } from "node:fs";
const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
const databasePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  url.slice(5),
);
mkdirSync(dirname(databasePath), { recursive: true });
// Ensure an empty file exists before invoking the SQLite schema engine.
closeSync(openSync(databasePath, "a"));
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: "file:" + databasePath },
});
