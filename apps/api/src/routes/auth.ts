import { Router } from "express";
import { credentialsSchema, registerSchema } from "@secondlook/contracts";
import type { Database } from "../db.js";
import {
  authenticate,
  hashPassword,
  issueSession,
  tokenHash,
  verifyPassword,
} from "../auth.js";
import { HttpError } from "../http.js";
export function authRoutes(db: Database) {
  const router = Router();
  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.post("/auth/register", async (req, res) => {
    const data = registerSchema.parse(req.body);
    const user = await db.user.create({
      data: {
        username: data.username.toLowerCase(),
        nickname: data.nickname,
        passwordHash: await hashPassword(data.password),
      },
    });
    res
      .status(201)
      .json({
        token: await issueSession(db, user.id),
        user: { id: user.id, nickname: user.nickname, role: user.role },
      });
  });
  router.post("/auth/login", async (req, res) => {
    const data = credentialsSchema.parse(req.body);
    const user = await db.user.findUnique({
      where: { username: data.username.toLowerCase() },
    });
    if (!user || !(await verifyPassword(data.password, user.passwordHash)))
      throw new HttpError(401, "登录名或密码不正确");
    res.json({
      token: await issueSession(db, user.id),
      user: { id: user.id, nickname: user.nickname, role: user.role },
    });
  });
  router.get("/me", authenticate(db, true), (_req, res) =>
    res.json(res.locals.user),
  );
  router.post("/auth/logout", authenticate(db, true), async (req, res) => {
    await db.session.deleteMany({
      where: { tokenHash: tokenHash(req.get("Authorization")!.slice(7)) },
    });
    res.status(204).end();
  });
  return router;
}
