import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

export async function connectMongo(): Promise<void> {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.MONGO_URI, {
    autoIndex: env.NODE_ENV !== "production"
  });

  logger.info({ mongo: { host: mongoose.connection.host, name: mongoose.connection.name } }, "Mongo connected");
}

