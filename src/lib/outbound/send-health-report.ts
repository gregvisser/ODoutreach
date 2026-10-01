import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";

const WAITING = new Set(["QUEUED", "PROCESSING", "REQUESTED", "PREPARING"]);
const MAX_REASONS = 8;

export type SendHealthReason = { reason: string; count: number };

export type SendHealthMailbox = {
  mailbox: string;
  cap: number;
  bookedToday: number;
  connected: boolean;
  sendingEnabled: boolean;
};

export type SendHealthClient = {
  client: string;
  lifecycle: string;
  outboundByStatus: Record<string, number>;
  waiting: number;
  oldestQueuedMinutes: number | null;
  oldestProcessingMinutes: number | null;
  sentToday: number;
  failedTodayCount: number;
  failedToday: SendHealthReason[];
  held: SendHealthReason[];
  mailboxes: SendHealthMailbox[];
  dueFollowUps: number;
};

export type SendHealthReport = {
  ok: true;
  readOnly: true;
  at: string;
  dayStartUtc: string;
  clients: SendHealthClient[];
};

export type SendHealthReasonRow = { clientId: string; reason: string | null; count: number };

function ageMinutes(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function topReasons(rows: SendHealthReasonRow[], clientId: string): SendHealthReason[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    if (row.clientId !== clientId || row.count <= 0) continue;
    const reason = sanitizeJobErrorText(row.reason?.trim() || "No reason recorded");
    merged.set(reason, (merged.get(reason) ?? 0) + row.count);
  }
  return [...merged.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, MAX_REASONS);
}

export function shapeSendHealth(input: {
  now: Date;
  dayStart: Date;
  clients: { id: string; name: string; status: string }[];
  statusCounts: { clientId: string; status: string; count: number }[];
  ages: { clientId: string; oldestQueuedMinutes: number | null; oldestProcessingMinutes: number | null }[];
  sentToday: { clientId: string; count: number }[];
  failedToday: SendHealthReasonRow[];
  held: SendHealthReasonRow[];
  mailboxes: SendHealthMailbox[];
  mailboxClientIds: string[];
  dueFollowUps: { clientId: string; count: number }[];
}): SendHealthReport {
  const ages = new Map(input.ages.map((row) => [row.clientId, row]));
  const sent = new Map(input.sentToday.map((row) => [row.clientId, row.count]));
  const due = new Map(input.dueFollowUps.map((row) => [row.clientId, row.count]));
  const byClientStatus = new Map<string, Record<string, number>>();
  for (const row of input.statusCounts) {
    const bucket = byClientStatus.get(row.clientId) ?? {};
    bucket[row.status] = (bucket[row.status] ?? 0) + row.count;
    byClientStatus.set(row.clientId, bucket);
  }
  const mailboxesByClient = new Map<string, SendHealthMailbox[]>();
  input.mailboxes.forEach((mailbox, index) => {
    const clientId = input.mailboxClientIds[index];
    if (!clientId) return;
    const list = mailboxesByClient.get(clientId) ?? [];
    list.push(mailbox);
    mailboxesByClient.set(clientId, list);
  });

  const clients = [...input.clients]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((client) => {
      const outboundByStatus = byClientStatus.get(client.id) ?? {};
      const waiting = Object.entries(outboundByStatus).reduce(
        (sum, [status, count]) => sum + (WAITING.has(status) ? count : 0),
        0,
      );
      const age = ages.get(client.id);
      const failedToday = topReasons(input.failedToday, client.id);
      return {
        client: client.name,
        lifecycle: client.status,
        outboundByStatus,
        waiting,
        oldestQueuedMinutes: ageMinutes(age?.oldestQueuedMinutes ?? null),
        oldestProcessingMinutes: ageMinutes(age?.oldestProcessingMinutes ?? null),
        sentToday: sent.get(client.id) ?? 0,
        failedTodayCount: failedToday.reduce((sum, row) => sum + row.count, 0),
        failedToday,
        held: topReasons(input.held, client.id),
        mailboxes: (mailboxesByClient.get(client.id) ?? []).sort((a, b) => a.mailbox.localeCompare(b.mailbox)),
        dueFollowUps: due.get(client.id) ?? 0,
      };
    });

  return {
    ok: true,
    readOnly: true,
    at: input.now.toISOString(),
    dayStartUtc: input.dayStart.toISOString(),
    clients,
  };
}
