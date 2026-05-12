import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors.js";
import { verifyAccessToken, type AccessTokenPayload } from "../modules/auth/auth.jwt.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "missing_token", "Missing access token"));
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, "invalid_token", "Invalid access token"));
  }
}

