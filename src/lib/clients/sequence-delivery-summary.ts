import { confirmedPreviousSendTime } from "@/lib/email-sequences/followup-sent-intro-policy";

export type SequenceDeliverySummary = {
  sent: number;
  queued: number;
  attention: number;
};

/** Read-side only: a planner's SENT flag means handed to the queue. */
export function summarizeSequenceDelivery(rows: ReadonlyArray<{
  status: string;
  outboundEmail?: { status: string; sentAt: Date | null } | null;
}>): SequenceDeliverySummary {
  const result = { sent: 0, queued: 0, attention: 0 };
  for (const row of rows) {
    if (row.status !== "SENT") continue;
    const outbound = row.outboundEmail;
    if (outbound?.status === "QUEUED") result.queued += 1;
    else if (outbound?.status !== "BOUNCED" && confirmedPreviousSendTime(outbound)) {
      result.sent += 1;
    } else result.attention += 1;
  }
  return result;
}
