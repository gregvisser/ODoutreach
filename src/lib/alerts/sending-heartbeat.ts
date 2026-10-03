/**
 * Is real sending alive? Judged from the heartbeat the Azure WebJob
 * `odoutreach-scheduled-outreach` records on every 5-minute run.
 * No database and no network, so the daily digest and the hourly watch
 * cannot disagree.
 */

import type { JobConclusion } from "./alert-copy";

export const SENDING_HEARTBEAT_NAME = "odoutreach-scheduled-outreach";
/** The WebJob runs every 5 minutes. Four missed runs is a stopped sender. */
export const SENDING_HEARTBEAT_STALE_MINUTES = 20;
/** Three failed send drains in a row (about 15 minutes) is a broken sender. */
export const SENDING_QUEUE_FAILURE_LIMIT = 3;

export type SendingHeartbeat = {
  lastRunAt: Date;
  lastQueueAt: Date | null;
  lastQueueOkAt: Date | null;
  lastQueueError: string | null;
  consecutiveQueueFailures: number;
};

export type SendingHeartbeatVerdict = {
  conclusion: JobConclusion;
  /** True when the WebJob itself has stopped calling the app. */
  stale: boolean;
  minutesSinceRun: number | null;
  reasons: string[];
};

export function formatLondonTime(at: Date): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return `${text} UK time`;
}

export function assessSendingHeartbeat(
  heartbeat: SendingHeartbeat | null,
  now: Date,
  staleMinutes: number = SENDING_HEARTBEAT_STALE_MINUTES,
): SendingHeartbeatVerdict {
  if (!heartbeat) {
    return {
      conclusion: "failure",
      stale: true,
      minutesSinceRun: null,
      reasons: ["The Azure sending job has never reported in, so sending may not be running."],
    };
  }
  const minutesSinceRun = Math.max(0, Math.floor((now.getTime() - heartbeat.lastRunAt.getTime()) / 60_000));
  if (minutesSinceRun > staleMinutes) {
    return {
      conclusion: "failure",
      stale: true,
      minutesSinceRun,
      reasons: [
        `The Azure sending job last ran at ${formatLondonTime(heartbeat.lastRunAt)} (${String(minutesSinceRun)} minutes ago). It should run every 5 minutes. No email is being sent.`,
      ],
    };
  }
  const error = heartbeat.lastQueueError?.trim();
  if (heartbeat.consecutiveQueueFailures >= SENDING_QUEUE_FAILURE_LIMIT) {
    return {
      conclusion: "failure",
      stale: false,
      minutesSinceRun,
      reasons: [
        `Sending failed on the last ${String(heartbeat.consecutiveQueueFailures)} runs.${error ? ` Latest error: ${error}` : ""}`,
      ],
    };
  }
  if (heartbeat.consecutiveQueueFailures > 0) {
    return {
      conclusion: "partial",
      stale: false,
      minutesSinceRun,
      reasons: [`The last send run reported a problem.${error ? ` ${error}` : ""}`],
    };
  }
  const queueLine = heartbeat.lastQueueOkAt
    ? ` Last send run finished cleanly at ${formatLondonTime(heartbeat.lastQueueOkAt)}.`
    : "";
  return {
    conclusion: "success",
    stale: false,
    minutesSinceRun,
    reasons: [`The Azure sending job last ran at ${formatLondonTime(heartbeat.lastRunAt)}.${queueLine}`],
  };
}

/** The hourly watch emails while an outage is fresh, then leaves it to the daily digest. */
export const SENDING_WATCH_REPEAT_MINUTES = 180;

/** Should the hourly sending watch email? Only for a failure, and a stopped job only while fresh. */
export function sendingWatchShouldAlert(verdict: SendingHeartbeatVerdict): boolean {
  if (verdict.conclusion !== "failure") return false;
  if (verdict.minutesSinceRun === null) return true;
  if (verdict.stale) return verdict.minutesSinceRun <= SENDING_WATCH_REPEAT_MINUTES;
  return true;
}
