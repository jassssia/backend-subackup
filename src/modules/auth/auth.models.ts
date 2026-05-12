import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true }
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = mongoose.model("User", userSchema);

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, index: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    rotatedFrom: { type: Schema.Types.ObjectId, ref: "RefreshToken", default: null },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ userId: 1, createdAt: -1 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema> & { _id: Types.ObjectId };
export const RefreshTokenModel = mongoose.model("RefreshToken", refreshTokenSchema);

