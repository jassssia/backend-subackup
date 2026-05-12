import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { requestId } from "./http/requestId.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { backupsRouter } from "./modules/backups/backups.routes.js";
import { githubActionsRouter } from "./modules/github-actions/githubActions.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId ?? "unknown",
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      }
    })
  );

  app.use(helmet());

  app.use(
    cors({
      origin: (_origin, cb) => cb(null, true),
      credentials: true
    })
  );

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  // Internal routes (must accept binary uploads)
  app.use("/internal/github-actions", githubActionsRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // API root
  app.get(env.API_BASE_PATH, (_req, res) => res.json({ ok: true, version: "v1" }));

  app.use(`${env.API_BASE_PATH}/auth`, authRouter);
  app.use(`${env.API_BASE_PATH}/projects`, projectsRouter);
  app.use(env.API_BASE_PATH, backupsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

