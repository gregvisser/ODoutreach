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
import type { StaffUser } from "@/generated/prisma/client";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import {
  countBookedSendSlotsInUtcWindow,
  humanizeGovernanceRejection,
  linkReservationToOutboundInTransaction,
  loadGovernedSendingMailbox,
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
      mailboxEmail: string;
      mailboxIdentityId: string;
      remainingCapacity: number;
      cap: number;
      bookedAfter: number;
    }
  | { ok: false; error: string };

const SUBJECT_MAX = 300;
const BODY_MAX = 50_000;

/**
 * Queues a small batch through the same governed mailbox + ledger path as contact sends.
 * Recipients must pass GOVERNED_TEST_EMAIL_DOMAINS (internal/allowlisted) unless product adds a broader pilot flag later.
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

  const governance = await loadGovernedSendingMailbox(clientId);
  if (governance.mode === "legacy" || governance.mode === "ineligible") {
    return {
      ok: false,
      error:
        governance.mode === "ineligible"
          ? humanizeGovernanceRejection(governance.reason, governance.mailbox ?? null)
          : "Add a connected Microsoft 365 or Google Workspace sending mailbox before running a pilot batch.",
    };
  }

  const mailbox = governance.mailbox;
  const mailboxEmail = normalizeEmail(mailbox.email);
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

  const cap = Math.max(1, mailbox.dailySendCap || 30);
  const bookedBefore = await prisma.mailboxSendReservation.count({
    where: {
      mailboxIdentityId: mailbox.id,
      windowKey,
      status: { in: ["RESERVED", "CONSUMED"] },
    },
  });
  if (bookedBefore + targets.length > cap) {
    return {
      ok: false,
      error: `Not enough capacity: ${String(targets.length)} sends requested but only ${String(
        Math.max(0, cap - bookedBefore),
      )} slot(s) remain today (UTC) for ${mailboxEmail} (cap ${String(cap)}).`,
    };
  }

  const runId = randomUUID();

  let outboundIds: string[] = [];

  try {
    outboundIds = await prisma.$transaction(
      async (tx) => {
        const m = await tx.clientMailboxIdentity.findFirstOrThrow({
          where: { id: mailbox.id, clientId },
        });

        const bookedInTx = await countBookedSendSlotsInUtcWindow(tx, m.id, windowKey);
        if (bookedInTx + targets.length > cap) {
          throw new Error("CAP_RACE");
        }

        const ids: string[] = [];
        let index = 0;
        for (const t of targets) {
          const idempotencyKey = `controlledPilot:${clientId}:${runId}:${String(index)}:${t.to}`;
          const reserve = await tryReserveSendSlotInTransaction(tx, {
            clientId,
            mailbox: m,
            idempotencyKey,
            at,
          });

          if (!reserve.ok) {
            throw new Error(reserve.error);
          }
          if ("alreadyQueued" in reserve && reserve.alreadyQueued) {
            throw new Error("Unexpected idempotent hit for new pilot batch");
          }

          const fromAddress = normalizeEmail(m.email);
          const newOutboundData = {
            clientId,
            contactId: null as string | null,
            staffUserId: staff.id,
            toEmail: t.to,
            toDomain: t.toDomain,
            subject,
            bodySnapshot: bodyText,
            status: "QUEUED" as const,
            fromAddress,
            mailboxIdentityId: m.id,
            queuedAt: new Date(),
            metadata: {
              kind: CONTROLLED_PILOT_METADATA_KIND,
              pilotRunId: runId,
              pilotIndex: index,
            } as object,
          };

          if (reserve.duplicate && reserve.outboundEmailId != null) {
            throw new Error("Unexpected reservation already linked for new pilot batch");
          }

          const created = await tx.outboundEmail.create({ data: newOutboundData });
          await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
          ids.push(created.id);
          index += 1;
        }
        return ids;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "CAP_RACE") {
      return {
        ok: false,
        error: "Capacity changed while queueing — refresh and try with fewer recipients.",
      };
    }
    return { ok: false, error: msg };
  }

  await triggerOutboundQueueDrain();

  const bookedAfter = await prisma.mailboxSendReservation.count({
    where: {
      mailboxIdentityId: mailbox.id,
      windowKey,
      status: { in: ["RESERVED", "CONSUMED"] },
    },
  });

  return {
    ok: true,
    queued: outboundIds.length,
    blocked,
    outboundIds,
    mailboxEmail,
    mailboxIdentityId: mailbox.id,
    remainingCapacity: Math.max(0, cap - bookedAfter),
    cap,
    bookedAfter,
  };
}
