import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { RequestHandler } from "express";
import type { Database } from "./db.js";
import { HttpError } from "./http.js";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function issueSession(db: Database, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  return token;
}
export function authenticate(db: Database, required = false): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("Authorization");
    if (header) {
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const session = await db.session.findUnique({
        where: { tokenHash: tokenHash(token) },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date())
        throw new HttpError(401, "登录已过期，请重新登录");
      res.locals.user = {
        id: session.user.id,
        nickname: session.user.nickname,
        role: session.user.role,
      };
    }
    if (required && !res.locals.user) throw new HttpError(401, "请先登录");
    next();
  };
}
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.user?.role !== "ADMIN")
    throw new HttpError(403, "需要管理员权限");
  next();
};
