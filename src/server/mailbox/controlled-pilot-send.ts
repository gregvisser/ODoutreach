import "server-only";

import { randomUUID } from "node:crypto";

import {
  CONTROLLED_PILOT_CONFIRMATION_PHRASE,
  CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
  CONTROLLED_PILOT_METADATA_KIND,
} from "@/lib/controlled-pilot-constants";
import { parsePilotRecipientLines } from "@/lib/controlled-pilot-recipients";
import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { isRecipientAllowedForGovernedTest } from "@/lib/governed-test-recipient";
import { prisma } from "@/lib/db";
import { requireClientAccess } from "@/server/tenant/access";
import type { ClientMailboxIdentity, StaffUser } from "@/generated/prisma/client";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import {
  countBookedSendSlotsInUtcWindow,
  eligibleWorkspaceMailboxPool,
  linkReservationToOutboundInTransaction,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import { triggerOutboundQueueDrain } from "@/server/email/outbound/trigger-queue";
import { utcDateKeyForInstant } from "@/lib/sending-window";

export type ControlledPilotBatchResult =
  | {
      ok: true;
      queued: number;
      blocked: Array<{ email: string; reason: string }>;
      outboundIds: string[];
      /** Controlled pilot uses the multi-mailbox pool (ledger per mailbox). */
      allocationMode: "mailbox_pool";
      mailboxesUsed: Array<{
        mailboxIdentityId: string;
        email: string;
        count: number;
      }>;
      aggregateRemainingAfter: number;
      perMailboxCap: number;
    }
  | { ok: false; error: string };

const SUBJECT_MAX = 300;
const BODY_MAX = 50_000;

/**
 * Workspace mailbox pool for this controlled-pilot batch. Delegates to
 * `eligibleWorkspaceMailboxPool` so the "workspace-based, not
 * operator-owned" rule lives in exactly one place.
 */
function executionEligibleMailboxes(
  rows: ClientMailboxIdentity[],
): ClientMailboxIdentity[] {
  return eligibleWorkspaceMailboxPool(rows);
}

function sortMailboxesForPilotPick(
  pool: ClientMailboxIdentity[],
  localRemaining: Map<string, number>,
): ClientMailboxIdentity[] {
  return [...pool].sort((a, b) => {
    const ra = localRemaining.get(a.id) ?? 0;
    const rb = localRemaining.get(b.id) ?? 0;
    if (rb !== ra) return rb - ra;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Queues a small batch across the client's **mailbox pool** (all execution-eligible identities),
 * one ledger reservation per recipient on the best mailbox (most remaining / primary tie-break).
 * Recipients must pass GOVERNED_TEST_EMAIL_DOMAINS unless product extends policy.
 */
export async function queueControlledPilotBatch(input: {
  staff: StaffUser;
  clientId: string;
  confirmationPhrase: string;
  recipientLines: string;
  subject: string;
  bodyText: string;
}): Promise<ControlledPilotBatchResult> {
  const { staff, clientId } = input;
  await requireClientAccess(staff, clientId);

  if (input.confirmationPhrase !== CONTROLLED_PILOT_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Type the exact confirmation phrase: ${CONTROLLED_PILOT_CONFIRMATION_PHRASE}`,
    };
  }

  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  if (!subject.length) {
    return { ok: false, error: "Subject is required." };
  }
  if (subject.length > SUBJECT_MAX) {
    return { ok: false, error: `Subject is too long (max ${String(SUBJECT_MAX)} characters).` };
  }
  if (!bodyText.length) {
    return { ok: false, error: "Message body is required." };
  }
  if (bodyText.length > BODY_MAX) {
    return { ok: false, error: `Body is too long (max ${String(BODY_MAX)} characters).` };
  }

  const parsed = parsePilotRecipientLines(input.recipientLines);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const recipients = parsed.emails;
  if (recipients.length === 0) {
    return { ok: false, error: "Add at least one recipient email." };
  }
  if (parsed.truncatedFromHardCap) {
    return {
      ok: false,
      error: `More than ${String(CONTROLLED_PILOT_HARD_MAX_RECIPIENTS)} addresses were provided; trim the list (hard safety cap).`,
    };
  }

  const identities = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
  });
  const pool = executionEligibleMailboxes(identities);
  if (pool.length === 0) {
    return {
      ok: false,
      error:
        "No active connected sending mailboxes in this workspace — connect at least one Microsoft 365 or Google Workspace sender with sending enabled.",
    };
  }

  const at = new Date();
  const windowKey = utcDateKeyForInstant(at);

  type Target = { to: string; toDomain: string | null };
  const targets: Target[] = [];
  const blocked: Array<{ email: string; reason: string }> = [];

  for (const raw of recipients) {
    const to = normalizeEmail(raw);
    if (!isRecipientAllowedForGovernedTest(to)) {
      blocked.push({
        email: to,
        reason: "domain_not_allowlisted_for_pilot (configure GOVERNED_TEST_EMAIL_DOMAINS or use an allowed internal address)",
      });
      continue;
    }
    const dup = await prisma.outboundEmail.findFirst({
      where: {
        clientId,
        toEmail: to,
        subject,
        metadata: { path: ["kind"], equals: CONTROLLED_PILOT_METADATA_KIND },
        createdAt: { gte: new Date(at.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (dup) {
      blocked.push({
        email: to,
        reason: "duplicate_pilot_same_subject_within_24h",
      });
      continue;
    }

    const decision = await evaluateSuppression(clientId, to);
    if (decision.suppressed) {
      blocked.push({ email: to, reason: "suppressed" });
      continue;
    }

    targets.push({ to, toDomain: extractDomainFromEmail(to) || null });
  }

  if (targets.length === 0) {
    return {
      ok: false,
      error:
        blocked.length > 0
          ? `No sendable recipients. First block reason: ${blocked[0]?.reason ?? "unknown"}.`
          : "No recipients to queue.",
    };
  }

  const runId = randomUUID();

  let outboundIds: string[] = [];
  let txBlocked: Array<{ email: string; reason: string }> = [];
  let mailboxesUsed: Array<{ mailboxIdentityId: string; email: string; count: number }> = [];

  try {
    const txResult = await prisma.$transaction(
      async (tx) => {
        const localRemaining = new Map<string, number>();
        for (const m of pool) {
          const cap = Math.max(1, m.dailySendCap || 30);
          const booked = await countBookedSendSlotsInUtcWindow(tx, m.id, windowKey);
          localRemaining.set(m.id, Math.max(0, cap - booked));
        }

        const aggregateBefore = [...localRemaining.values()].reduce((a, b) => a + b, 0);
        if (aggregateBefore <= 0) {
          return {
            ids: [] as string[],
            txBlocked: targets.map((t) => ({
              email: t.to,
              reason: "no_mailbox_capacity_this_utc_day",
            })),
          };
        }

        const ids: string[] = [];
        const extraBlocked: Array<{ email: string; reason: string }> = [];

        for (let pilotIndex = 0; pilotIndex < targets.length; pilotIndex++) {
          const t = targets[pilotIndex]!;
          const sorted = sortMailboxesForPilotPick(pool, localRemaining);
          let placed = false;

          for (const m of sorted) {
            const rem = localRemaining.get(m.id) ?? 0;
            if (rem <= 0) continue;

            const idempotencyKey = `controlledPilot:${clientId}:${runId}:${String(pilotIndex)}:${t.to}`;
            const reserve = await tryReserveSendSlotInTransaction(tx, {
              clientId,
              mailbox: m,
              idempotencyKey,
              at,
            });

            if (!reserve.ok) {
              continue;
            }
            if (reserve.duplicate) {
              continue;
            }

            const fromAddress = normalizeEmail(m.email);
            const created = await tx.outboundEmail.create({
              data: {
                clientId,
                contactId: null,
                staffUserId: staff.id,
                toEmail: t.to,
                toDomain: t.toDomain,
                subject,
                bodySnapshot: bodyText,
                status: "QUEUED",
                fromAddress,
                mailboxIdentityId: m.id,
                queuedAt: new Date(),
                metadata: {
                  kind: CONTROLLED_PILOT_METADATA_KIND,
                  pilotRunId: runId,
                  pilotIndex,
                } as object,
              },
            });

            await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
            ids.push(created.id);
            localRemaining.set(m.id, Math.max(0, rem - 1));
            placed = true;
            break;
          }

          if (!placed) {
            extraBlocked.push({
              email: t.to,
              reason: "no_mailbox_capacity_this_utc_day",
            });
          }
        }

        return { ids, txBlocked: extraBlocked };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    outboundIds = txResult.ids;
    txBlocked = txResult.txBlocked;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const allBlocked = [...blocked, ...txBlocked];

  if (outboundIds.length === 0) {
    return {
      ok: false,
      error:
        allBlocked.length > 0
          ? `No messages queued. First reason: ${allBlocked[0]?.reason ?? "unknown"}.`
          : "No messages queued.",
    };
  }

  await triggerOutboundQueueDrain();

  const usedMap = new Map<string, { email: string; count: number }>();
  const outboundRows = await prisma.outboundEmail.findMany({
    where: { id: { in: outboundIds } },
    select: { mailboxIdentityId: true },
  });
  const mbMeta = new Map(
    pool.map((m) => [m.id, normalizeEmail(m.email)] as const),
  );
  for (const row of outboundRows) {
    const mid = row.mailboxIdentityId;
    if (!mid) continue;
    const email = mbMeta.get(mid) ?? "";
    const cur = usedMap.get(mid) ?? { email, count: 0 };
    cur.count += 1;
    usedMap.set(mid, cur);
  }
  mailboxesUsed = [...usedMap.entries()].map(([mailboxIdentityId, v]) => ({
    mailboxIdentityId,
    email: v.email,
    count: v.count,
  }));

  let aggregateRemainingAfter = 0;
  const firstCap = pool[0] ? Math.max(1, pool[0].dailySendCap || 30) : 30;
  for (const m of pool) {
    const cap = Math.max(1, m.dailySendCap || 30);
    const bookedAfter = await prisma.mailboxSendReservation.count({
      where: {
        mailboxIdentityId: m.id,
        windowKey,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });
    aggregateRemainingAfter += Math.max(0, cap - bookedAfter);
  }

  return {
    ok: true,
    queued: outboundIds.length,
    blocked: allBlocked,
    outboundIds,
    allocationMode: "mailbox_pool",
    mailboxesUsed,
    aggregateRemainingAfter,
    perMailboxCap: firstCap,
  };
}
