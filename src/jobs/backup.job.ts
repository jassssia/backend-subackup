import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ProjectCredentialsModel } from "../modules/credentials/credentials.models.js";
import { decryptConnectionString } from "../modules/credentials/credentials.crypto.js";
import { BackupHistoryModel } from "../modules/backups/backups.models.js";
import { generateSqlDump } from "../modules/backups/backups.dump.js";
import { uploadBackupFromString } from "../modules/backups/backups.gridfs.js";

export async function runBackupJob(backupHistoryId: string): Promise<void> {
  const history = await BackupHistoryModel.findById(backupHistoryId).exec();
  if (!history) {
    logger.warn({ backupHistoryId }, "Backup history not found");
    return;
  }

  history.status = "running";
  history.startedAt = history.startedAt ?? new Date();
  await history.save();

  const start = Date.now();
  try {
    if ((history as any).method && (history as any).method !== "internal_sql") {
      throw new Error(`Unsupported method for internal worker: ${(history as any).method}`);
    }

    const credentials = await ProjectCredentialsModel.findOne({ projectId: history.projectId }).lean().exec();
    if (!credentials) throw new Error("Missing project credentials");

    const connectionString = decryptConnectionString(credentials.connectionStringEncrypted, credentials.iv, env.ENCRYPTION_KEY);

    const sqlDump = await generateSqlDump(connectionString);
    const filename = `backup_${history.projectId.toString()}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;

    const { fileId, size } = await uploadBackupFromString(filename, sqlDump);

    history.status = "completed";
    history.completedAt = new Date();
    history.fileId = fileId as any;
    history.fileName = filename;
    history.fileSizeBytes = size;
    history.durationSeconds = Math.floor((Date.now() - start) / 1000);
    history.errorMessage = null;
    await history.save();
  } catch (err) {
    history.status = "failed";
    history.completedAt = new Date();
    history.durationSeconds = Math.floor((Date.now() - start) / 1000);
    history.errorMessage = err instanceof Error ? err.message : "Unknown error";
    await history.save();
    logger.error({ err, backupHistoryId }, "Backup job failed");
  }
}

