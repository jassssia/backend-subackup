import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../../http/errors.js";
import { verifyAccessToken } from "./auth.jwt.js";
import { loginUser, logoutRefreshToken, refreshTokens, registerUser } from "./auth.service.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await registerUser(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await loginUser(body, { ip: req.ip, headers: req.headers });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", authLimiter, async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const result = await refreshTokens(body.refreshToken, { ip: req.ip, headers: req.headers });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", authLimiter, async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    await logoutRefreshToken(body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "missing_token", "Missing access token");
    const token = header.slice("Bearer ".length);
    const payload = verifyAccessToken(token);
    res.json({ user: { id: payload.sub, email: payload.email, name: payload.name } });
  } catch (err) {
    next(err);
  }
});

