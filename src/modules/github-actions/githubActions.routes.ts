import express, { Router } from "express";
import { env } from "../../config/env.js";
import { HttpError } from "../../http/errors.js";
import { BackupHistoryModel } from "../backups/backups.models.js";
import { ProjectCredentialsModel } from "../credentials/credentials.models.js";
import { decryptConnectionString } from "../credentials/credentials.crypto.js";
import { getBackupsBucket } from "../backups/backups.gridfs.js";

export const githubActionsRouter = Router();

function requireSharedSecret(req: express.Request) {
  const expected = env.GITHUB_ACTIONS_SHARED_SECRET;
  if (!expected) throw new HttpError(500, "github_actions_not_configured", "GitHub Actions secret not configured");
  const got = req.header("x-gha-secret");
  if (!got || got !== expected) throw new HttpError(401, "unauthorized", "Unauthorized");
}

githubActionsRouter.get("/backups/:backupHistoryId/context", async (req, res, next) => {
  try {
    requireSharedSecret(req);
    const history = await BackupHistoryModel.findById(req.params.backupHistoryId).lean().exec();
    if (!history) throw new HttpError(404, "backup_not_found", "Backup not found");

    const credentials = await ProjectCredentialsModel.findOne({ projectId: history.projectId }).lean().exec();
    if (!credentials) throw new HttpError(400, "missing_credentials", "Missing project credentials");

    const connectionString = decryptConnectionString(credentials.connectionStringEncrypted, credentials.iv, env.ENCRYPTION_KEY);
    const filename = `backup_${history.projectId.toString()}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`;

    res.json({
      backupHistoryId: history._id.toString(),
      projectId: history.projectId.toString(),
      connectionString,
      filename
    });
  } catch (err) {
    next(err);
  }
});

// Upload gzipped dump as binary body
githubActionsRouter.post(
  "/backups/:backupHistoryId/upload",
  express.raw({ type: "*/*", limit: "500mb" }),
  async (req, res, next) => {
    try {
      requireSharedSecret(req);
      const history = await BackupHistoryModel.findById(req.params.backupHistoryId).exec();
      if (!history) throw new HttpError(404, "backup_not_found", "Backup not found");

      const filename = req.header("x-backup-filename") || `backup_${history.projectId.toString()}.sql.gz`;
      const bucket = getBackupsBucket();
      const uploadStream = bucket.openUploadStream(filename, { contentType: "application/gzip" });

      await new Promise<void>((resolve, reject) => {
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => resolve());
        uploadStream.end(req.body as Buffer);
      });

      history.status = "completed";
      history.completedAt = new Date();
      history.fileId = uploadStream.id as any;
      history.fileName = filename;
      history.fileSizeBytes = uploadStream.length;
      history.durationSeconds = history.startedAt ? Math.floor((Date.now() - history.startedAt.getTime()) / 1000) : null;
      history.errorMessage = null;
      await history.save();

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

