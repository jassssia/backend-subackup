import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./projects.service.js";
import { saveCredentials } from "../credentials/credentials.service.js";
import { getDatabaseSchema } from "../schema/schema.service.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

const projectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  supabaseProjectId: z.string().min(1).max(200),
  isActive: z.boolean().default(true),
  backupMethod: z.enum(["internal_sql", "github_actions_pg_dump"]).default("internal_sql"),
  schedule: z.object({
    frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
    scheduleTime: z.string().min(1).max(20),
    timezone: z.string().min(1).max(120).optional(),
    enabled: z.boolean().default(true),
    retentionDays: z.number().int().min(1).max(365).default(30)
  })
});

const projectUpdateSchema = projectCreateSchema.partial().extend({
  schedule: projectCreateSchema.shape.schedule.partial().optional()
});

projectsRouter.get("/", async (req, res, next) => {
  try {
    const data = await listProjects(req.auth!.sub);
    res.json({ projects: data });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const body = projectCreateSchema.parse(req.body);
    const created = await createProject(req.auth!.sub, body);
    res.status(201).json({ project: created });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const project = await getProject(req.auth!.sub, req.params.id);
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = projectUpdateSchema.parse(req.body);
    const project = await updateProject(req.auth!.sub, req.params.id, body);
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteProject(req.auth!.sub, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const credentialsSchema = z.object({
  connectionString: z.string().min(1).max(10_000)
});

projectsRouter.post("/:id/credentials", async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    const result = await saveCredentials(req.auth!.sub, req.params.id, body.connectionString);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id/schema", async (req, res, next) => {
  try {
    const schema = await getDatabaseSchema(req.auth!.sub, req.params.id);
    res.json({ schema });
  } catch (err) {
    next(err);
  }
});

