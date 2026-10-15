import "dotenv/config";
import { mkdirSync } from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
export function openDatabase(
  url = process.env.DATABASE_URL ?? "file:./data/dev.db",
) {
  mkdirSync("data", { recursive: true });
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
export type Database = ReturnType<typeof openDatabase>;
