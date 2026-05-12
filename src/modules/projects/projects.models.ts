import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const projectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    supabaseProjectId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    backupMethod: { type: String, enum: ["internal_sql", "github_actions_pg_dump"], default: "internal_sql" }
  },
  { timestamps: true }
);

projectSchema.index({ userId: 1, createdAt: -1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { _id: Types.ObjectId };
export const ProjectModel = mongoose.model("Project", projectSchema);

const backupScheduleSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true, index: true },
    frequency: { type: String, enum: ["daily", "weekly", "monthly", "custom"], required: true },
    scheduleTime: { type: String, required: true },
    timezone: { type: String, default: "UTC" },
    enabled: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 30 },
    lastRunAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type BackupScheduleDoc = InferSchemaType<typeof backupScheduleSchema> & { _id: Types.ObjectId };
export const BackupScheduleModel = mongoose.model("BackupSchedule", backupScheduleSchema);

