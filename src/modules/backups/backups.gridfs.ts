import mongoose from "mongoose";

type GridFSBucket = mongoose.mongo.GridFSBucket;

export function getBackupsBucket(): GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Mongo connection not ready");
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "backups" });
}

export async function uploadBackupFromString(filename: string, contents: string): Promise<{ fileId: mongoose.mongo.ObjectId; size: number }> {
  const bucket = getBackupsBucket();
  const uploadStream = bucket.openUploadStream(filename, { contentType: "application/sql" });

  const buf = Buffer.from(contents, "utf8");
  await new Promise<void>((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve());
    uploadStream.end(buf);
  });

  return { fileId: uploadStream.id as mongoose.mongo.ObjectId, size: buf.length };
}

