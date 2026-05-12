import argon2 from "argon2";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { HttpError } from "../../http/errors.js";
import { randomToken, sha256Base64Url } from "./auth.crypto.js";
import { signAccessToken } from "./auth.jwt.js";
import { RefreshTokenModel, UserModel } from "./auth.models.js";

export async function registerUser(input: { email: string; password: string; name: string }) {
  const existing = await UserModel.findOne({ email: input.email }).lean().exec();
  if (existing) throw new HttpError(409, "email_taken", "Email already registered");

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await UserModel.create({ email: input.email, passwordHash, name: input.name });

  const tokens = await issueTokens(user._id.toString(), user.email, user.name);
  return { user: { id: user._id.toString(), email: user.email, name: user.name }, ...tokens };
}

export async function loginUser(input: { email: string; password: string }, reqMeta: Pick<Request, "ip" | "headers">) {
  const user = await UserModel.findOne({ email: input.email }).exec();
  if (!user) throw new HttpError(401, "invalid_credentials", "Invalid credentials");

  const ok = await argon2.verify(user.passwordHash, input.password);
  if (!ok) throw new HttpError(401, "invalid_credentials", "Invalid credentials");

  const tokens = await issueTokens(
    user._id.toString(),
    user.email,
    user.name,
    reqMeta.headers["user-agent"]?.toString() ?? null,
    reqMeta.ip ?? null
  );
  return { user: { id: user._id.toString(), email: user.email, name: user.name }, ...tokens };
}

export async function refreshTokens(refreshToken: string, reqMeta: Pick<Request, "ip" | "headers">) {
  const tokenHash = sha256Base64Url(refreshToken);

  const existing = await RefreshTokenModel.findOne({ tokenHash }).exec();
  if (!existing || existing.revokedAt) throw new HttpError(401, "invalid_refresh_token", "Invalid refresh token");
  if (existing.expiresAt.getTime() <= Date.now()) throw new HttpError(401, "refresh_token_expired", "Refresh token expired");

  const user = await UserModel.findById(existing.userId).exec();
  if (!user) throw new HttpError(401, "invalid_refresh_token", "Invalid refresh token");

  existing.revokedAt = new Date();
  await existing.save();

  const newRefresh = randomToken();
  const newHash = sha256Base64Url(newRefresh);
  const newDoc = await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: newHash,
    rotatedFrom: existing._id,
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
    userAgent: reqMeta.headers["user-agent"]?.toString() ?? null,
    ip: reqMeta.ip ?? null
  });

  const accessToken = signAccessToken({ sub: user._id.toString(), email: user.email, name: user.name });

  return {
    user: { id: user._id.toString(), email: user.email, name: user.name },
    accessToken,
    refreshToken: newRefresh,
    refreshTokenId: newDoc._id.toString()
  };
}

export async function logoutRefreshToken(refreshToken: string) {
  const tokenHash = sha256Base64Url(refreshToken);
  const existing = await RefreshTokenModel.findOne({ tokenHash }).exec();
  if (!existing) return;
  if (!existing.revokedAt) {
    existing.revokedAt = new Date();
    await existing.save();
  }
}

async function issueTokens(userId: string, email: string, name: string, userAgent: string | null = null, ip: string | null = null) {
  const accessToken = signAccessToken({ sub: userId, email, name });

  const refreshToken = randomToken();
  const tokenHash = sha256Base64Url(refreshToken);
  const doc = await RefreshTokenModel.create({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
    userAgent,
    ip
  });

  return { accessToken, refreshToken, refreshTokenId: doc._id.toString() };
}

