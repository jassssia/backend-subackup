import { logger } from "../config/logger.js";
import { agenda } from "./agenda.js";
import { BackupHistoryModel } from "../modules/backups/backups.models.js";
import { BackupScheduleModel, ProjectModel } from "../modules/projects/projects.models.js";

function parseScheduleTime(scheduleTime: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(scheduleTime.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getNowInTimeZone(timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const weekdayStr = get("weekday") ?? "Mon";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[weekdayStr] ?? 1
  };
}

function shouldRun(frequency: string, lastRunAt: Date | null, nowTz: ReturnType<typeof getNowInTimeZone>): boolean {
  if (!lastRunAt) return true;
  const ms = Date.now() - lastRunAt.getTime();

  if (frequency === "daily") return ms >= 23.5 * 60 * 60 * 1000;
  if (frequency === "weekly") return ms >= 6.5 * 24 * 60 * 60 * 1000;
  if (frequency === "monthly") return ms >= 27 * 24 * 60 * 60 * 1000;
  if (frequency === "custom") return ms >= 60 * 60 * 1000;

  return false;
}

export async function schedulerTick(): Promise<void> {
  const schedules = await BackupScheduleModel.find({ enabled: true }).lean().exec();
  if (schedules.length === 0) return;

  for (const s of schedules) {
    const t = parseScheduleTime(s.scheduleTime);
    if (!t) continue;

    let nowTz: ReturnType<typeof getNowInTimeZone>;
    try {
      nowTz = getNowInTimeZone(s.timezone || "UTC");
    } catch {
      nowTz = getNowInTimeZone("UTC");
    }

    if (nowTz.hour !== t.hour || nowTz.minute !== t.minute) continue;

    if (!shouldRun(s.frequency, (s as any).lastRunAt ?? null, nowTz)) continue;

    const project = await ProjectModel.findById(s.projectId).lean().exec();
    if (!project || !project.isActive) continue;

    const history = await BackupHistoryModel.create({
      projectId: s.projectId,
      scheduleId: s._id,
      status: "pending",
      startedAt: new Date(),
      backupType: "scheduled"
    });

    await BackupScheduleModel.updateOne({ _id: s._id }, { $set: { lastRunAt: new Date() } }).exec();

    await agenda.now("backup:run", { backupHistoryId: history._id.toString() });
    logger.info({ scheduleId: s._id.toString(), projectId: s.projectId.toString(), backupHistoryId: history._id.toString() }, "Scheduled backup enqueued");
  }
}

