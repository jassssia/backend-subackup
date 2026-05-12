import Agenda from "agenda";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { runBackupJob } from "./backup.job.js";
import { schedulerTick } from "./scheduler.job.js";
import { runRetention } from "./retention.job.js";

export const agenda = new Agenda({
  db: { address: env.MONGO_URI, collection: "agendaJobs" },
  processEvery: "10 seconds",
  maxConcurrency: 10
});

export function defineJobs() {
  agenda.define("backup:run", async (job: any) => {
    const data = job.attrs.data as { backupHistoryId: string } | undefined;
    if (!data?.backupHistoryId) {
      logger.warn({ jobId: job.attrs._id }, "Missing backupHistoryId");
      return;
    }
    await runBackupJob(data.backupHistoryId);
  });

  agenda.define("scheduler:tick", async () => {
    await schedulerTick();
  });

  agenda.define("retention:run", async () => {
    await runRetention();
  });
}

export async function startAgenda() {
  defineJobs();
  await agenda.start();
  await agenda.every("1 minute", "scheduler:tick");
  await agenda.every("15 minutes", "retention:run");
  logger.info("Agenda started");
}

