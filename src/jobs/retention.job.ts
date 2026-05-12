import mongoose from "mongoose";
import { logger } from "../config/logger.js";
import { BackupHistoryModel } from "../modules/backups/backups.models.js";
import { getBackupsBucket } from "../modules/backups/backups.gridfs.js";
import { BackupScheduleModel } from "../modules/projects/projects.models.js";

export async function runRetention(): Promise<void> {
  const schedules = await BackupScheduleModel.find({}).lean().exec();
  if (schedules.length === 0) return;

  const bucket = getBackupsBucket();

  for (const s of schedules) {
    const retentionDays = Number((s as any).retentionDays ?? 30);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const old = await BackupHistoryModel.find({
      projectId: s.projectId,
      startedAt: { $lt: cutoff }
    })
      .select({ fileId: 1 })
      .lean()
      .exec();

    if (old.length === 0) continue;

    const fileIds = old
      .map((b) => b.fileId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      .map((id) => new mongoose.mongo.ObjectId(id.toString()));

    for (const fid of fileIds) {
      try {
        await bucket.delete(fid);
      } catch {
        // ignore missing
      }
    }

    await BackupHistoryModel.deleteMany({ projectId: s.projectId, startedAt: { $lt: cutoff } }).exec();
    logger.info({ projectId: s.projectId.toString(), retentionDays, deletedCount: old.length }, "Retention cleanup done");
  }
}

