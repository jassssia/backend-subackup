import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const backupHistorySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: "BackupSchedule", default: null },
    status: { type: String, enum: ["pending", "running", "completed", "failed"], required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    fileId: { type: Schema.Types.ObjectId, default: null },
    fileName: { type: String, default: null },
    fileSizeBytes: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    backupType: { type: String, enum: ["scheduled", "manual"], required: true },
    method: { type: String, enum: ["internal_sql", "github_actions_pg_dump"], default: "internal_sql" }
  },
  { timestamps: true }
);

backupHistorySchema.index({ projectId: 1, startedAt: -1 });

export type BackupHistoryDoc = InferSchemaType<typeof backupHistorySchema> & { _id: Types.ObjectId };
export const BackupHistoryModel = mongoose.model("BackupHistory", backupHistorySchema);

