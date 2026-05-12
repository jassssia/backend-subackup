import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import { HttpError } from "../../http/errors.js";
import { agenda } from "../../jobs/agenda.js";
import { ProjectModel } from "../projects/projects.models.js";
import { BackupHistoryModel } from "./backups.models.js";
import { getBackupsBucket } from "./backups.gridfs.js";
import mongoose from "mongoose";
import { dispatchPgdumpWorkflow } from "../../integrations/github/github.actions.js";

export const backupsRouter = Router();
backupsRouter.use(requireAuth);

backupsRouter.post("/projects/:projectId/backups", async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const project = await ProjectModel.findOne({ _id: projectId, userId: req.auth!.sub }).lean().exec();
    if (!project) throw new HttpError(404, "project_not_found", "Project not found");

    const body = z
      .object({
        method: z.enum(["internal_sql", "github_actions_pg_dump"]).optional()
      })
      .safeParse(req.body ?? {});

    const chosenMethod = body.success && body.data.method ? body.data.method : ((project as any).backupMethod ?? "internal_sql");

    const history = await BackupHistoryModel.create({
      projectId,
      scheduleId: null,
      status: "pending",
      startedAt: new Date(),
      backupType: "manual",
      method: chosenMethod
    });

    if (chosenMethod === "internal_sql") {
      await agenda.now("backup:run", { backupHistoryId: history._id.toString() });
    } else {
      // GitHub Actions will run pg_dump and upload back to /internal/github-actions
      await dispatchPgdumpWorkflow({ backupHistoryId: history._id.toString() });
    }

    res.status(202).json({ backupHistoryId: history._id.toString() });
  } catch (err) {
    next(err);
  }
});

backupsRouter.get("/projects/:projectId/backups", async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const project = await ProjectModel.findOne({ _id: projectId, userId: req.auth!.sub }).lean().exec();
    if (!project) throw new HttpError(404, "project_not_found", "Project not found");

    const items = await BackupHistoryModel.find({ projectId }).sort({ startedAt: -1 }).lean().exec();
    res.json({
      backups: items.map((b) => ({
        id: b._id.toString(),
        status: b.status,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        fileName: b.fileName,
        fileSizeBytes: b.fileSizeBytes,
        durationSeconds: b.durationSeconds,
        errorMessage: b.errorMessage,
        backupType: b.backupType
      }))
    });
  } catch (err) {
    next(err);
  }
});

backupsRouter.get("/backups/:backupHistoryId/download", async (req, res, next) => {
  try {
    const id = req.params.backupHistoryId;
    const history = await BackupHistoryModel.findById(id).lean().exec();
    if (!history) throw new HttpError(404, "backup_not_found", "Backup not found");

    const project = await ProjectModel.findOne({ _id: history.projectId, userId: req.auth!.sub }).lean().exec();
    if (!project) throw new HttpError(404, "backup_not_found", "Backup not found");

    if (!history.fileId || !history.fileName) throw new HttpError(409, "backup_not_ready", "Backup file not available");

    const bucket = getBackupsBucket();
    const fileId = new mongoose.mongo.ObjectId(history.fileId.toString());
    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", `attachment; filename="${history.fileName}"`);
    bucket.openDownloadStream(fileId).on("error", next).pipe(res);
  } catch (err) {
    next(err);
  }
});

const backupHistorySchema = z.object({
  backupHistoryId: z.string().min(1)
});

backupsRouter.get("/backups/:backupHistoryId", async (req, res, next) => {
  try {
    const { backupHistoryId } = backupHistorySchema.parse({ backupHistoryId: req.params.backupHistoryId });
    const history = await BackupHistoryModel.findById(backupHistoryId).lean().exec();
    if (!history) throw new HttpError(404, "backup_not_found", "Backup not found");

    const project = await ProjectModel.findOne({ _id: history.projectId, userId: req.auth!.sub }).lean().exec();
    if (!project) throw new HttpError(404, "backup_not_found", "Backup not found");

    res.json({
      backup: {
        id: history._id.toString(),
        status: history.status,
        startedAt: history.startedAt,
        completedAt: history.completedAt,
        fileName: history.fileName,
        fileSizeBytes: history.fileSizeBytes,
        durationSeconds: history.durationSeconds,
        errorMessage: history.errorMessage,
        backupType: history.backupType
      }
    });
  } catch (err) {
    next(err);
  }
});

