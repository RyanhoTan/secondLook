import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { Database } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { communityRoutes } from "./routes/community.js";
import { adminRoutes } from "./routes/admin.js";
import { revisionRoutes } from "./routes/revisions.js";
import { materialRoutes } from "./routes/materials.js";
import { MaterialFiles } from "./material-files.js";
import { errorHandler } from "./http.js";
import { draftRoutes } from "./routes/drafts.js";
import { followingRoutes } from "./routes/following.js";
export function createApp(
  db: Database,
  options: { uploadRoot?: string; authLimit?: number } = {},
) {
  const authLimit = options.authLimit ?? 20;
  if (!Number.isInteger(authLimit) || authLimit < 1 || authLimit > 1000)
    throw new Error("AUTH_RATE_LIMIT 必须为 1～1000 的整数");
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: (
        process.env.WEB_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173"
      ).split(","),
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }));
  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: 60000,
      limit: authLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({
            code: "RATE_LIMIT",
            message: "登录请求过于频繁，请稍后重试",
          }),
    }),
  );
  app.use(
    "/api/v1",
    authRoutes(db),
    communityRoutes(db),
    draftRoutes(db),
    followingRoutes(db),
    revisionRoutes(db),
    materialRoutes(db, new MaterialFiles(options.uploadRoot)),
    adminRoutes(db),
  );
  app.use((_req, res) =>
    res.status(404).json({ code: "NOT_FOUND", message: "接口不存在" }),
  );
  app.use(errorHandler);
  return app;
}
