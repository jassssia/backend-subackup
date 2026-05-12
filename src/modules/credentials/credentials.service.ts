import { env } from "../../config/env.js";
import { HttpError } from "../../http/errors.js";
import { ProjectModel } from "../projects/projects.models.js";
import { encryptConnectionString } from "./credentials.crypto.js";
import { ProjectCredentialsModel } from "./credentials.models.js";

export async function saveCredentials(userId: string, projectId: string, connectionString: string) {
  const project = await ProjectModel.findOne({ _id: projectId, userId }).lean().exec();
  if (!project) throw new HttpError(404, "project_not_found", "Project not found");

  if (!connectionString.startsWith("postgresql://") && !connectionString.startsWith("postgres://")) {
    throw new HttpError(400, "invalid_connection_string", "Invalid connection string format");
  }

  const { encrypted, iv } = encryptConnectionString(connectionString, env.ENCRYPTION_KEY);

  await ProjectCredentialsModel.findOneAndUpdate(
    { projectId },
    { projectId, connectionStringEncrypted: encrypted, iv },
    { upsert: true, new: true }
  ).exec();

  return { success: true };
}

