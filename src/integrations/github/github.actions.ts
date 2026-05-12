import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../http/errors.js";

type DispatchInputs = Record<string, string>;

export async function dispatchPgdumpWorkflow(inputs: DispatchInputs): Promise<void> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new HttpError(500, "github_not_configured", "GitHub integration not configured");
  }

  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}/dispatches`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ref: "main", inputs })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    logger.error({ status: resp.status, text }, "Failed to dispatch workflow");
    throw new HttpError(502, "github_dispatch_failed", "Failed to dispatch GitHub workflow", { status: resp.status, text });
  }
}

