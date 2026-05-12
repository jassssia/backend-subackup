import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

