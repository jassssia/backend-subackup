import { HttpError } from "../../http/errors.js";
import { BackupScheduleModel, ProjectModel } from "./projects.models.js";

export async function listProjects(userId: string) {
  const projects = await ProjectModel.find({ userId }).sort({ createdAt: -1 }).lean().exec();
  return projects.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    description: p.description ?? "",
    supabaseProjectId: p.supabaseProjectId,
    isActive: p.isActive,
    backupMethod: (p as any).backupMethod ?? "internal_sql",
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  }));
}

export async function getProject(userId: string, projectId: string) {
  const project = await ProjectModel.findOne({ _id: projectId, userId }).lean().exec();
  if (!project) throw new HttpError(404, "project_not_found", "Project not found");
  return {
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? "",
    supabaseProjectId: project.supabaseProjectId,
    isActive: project.isActive,
    backupMethod: (project as any).backupMethod ?? "internal_sql",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export async function createProject(userId: string, input: { name: string; description?: string; supabaseProjectId: string; isActive: boolean; backupMethod: "internal_sql" | "github_actions_pg_dump"; schedule: { frequency: "daily" | "weekly" | "monthly" | "custom"; scheduleTime: string; timezone?: string; enabled: boolean; retentionDays: number } }) {
  const project = await ProjectModel.create({
    userId,
    name: input.name,
    description: input.description ?? "",
    supabaseProjectId: input.supabaseProjectId,
    isActive: input.isActive,
    backupMethod: input.backupMethod
  });

  await BackupScheduleModel.create({
    projectId: project._id,
    frequency: input.schedule.frequency,
    scheduleTime: input.schedule.scheduleTime,
    timezone: input.schedule.timezone ?? "UTC",
    enabled: input.schedule.enabled,
    retentionDays: input.schedule.retentionDays
  });

  return {
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? "",
    supabaseProjectId: project.supabaseProjectId,
    isActive: project.isActive,
    backupMethod: (project as any).backupMethod ?? "internal_sql",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export async function updateProject(userId: string, projectId: string, input: { name?: string; description?: string; supabaseProjectId?: string; isActive?: boolean; backupMethod?: "internal_sql" | "github_actions_pg_dump"; schedule?: Partial<{ frequency: "daily" | "weekly" | "monthly" | "custom"; scheduleTime: string; timezone: string; enabled: boolean; retentionDays: number }> }) {
  const project = await ProjectModel.findOne({ _id: projectId, userId }).exec();
  if (!project) throw new HttpError(404, "project_not_found", "Project not found");

  if (input.name !== undefined) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  if (input.supabaseProjectId !== undefined) project.supabaseProjectId = input.supabaseProjectId;
  if (input.isActive !== undefined) project.isActive = input.isActive;
  if (input.backupMethod !== undefined) (project as any).backupMethod = input.backupMethod;
  await project.save();

  if (input.schedule) {
    const schedule = await BackupScheduleModel.findOne({ projectId: project._id }).exec();
    if (!schedule) throw new HttpError(500, "schedule_missing", "Schedule missing");
    if (input.schedule.frequency !== undefined) schedule.frequency = input.schedule.frequency;
    if (input.schedule.scheduleTime !== undefined) schedule.scheduleTime = input.schedule.scheduleTime;
    if (input.schedule.timezone !== undefined) schedule.timezone = input.schedule.timezone;
    if (input.schedule.enabled !== undefined) schedule.enabled = input.schedule.enabled;
    if (input.schedule.retentionDays !== undefined) schedule.retentionDays = input.schedule.retentionDays;
    await schedule.save();
  }

  return {
    id: project._id.toString(),
    name: project.name,
    description: project.description ?? "",
    supabaseProjectId: project.supabaseProjectId,
    isActive: project.isActive,
    backupMethod: (project as any).backupMethod ?? "internal_sql",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export async function deleteProject(userId: string, projectId: string) {
  const project = await ProjectModel.findOne({ _id: projectId, userId }).exec();
  if (!project) throw new HttpError(404, "project_not_found", "Project not found");

  await BackupScheduleModel.deleteOne({ projectId: project._id }).exec();
  await ProjectModel.deleteOne({ _id: project._id }).exec();
}

