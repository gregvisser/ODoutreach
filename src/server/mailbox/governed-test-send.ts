import "server-only";

import { randomUUID } from "node:crypto";

import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import { isRecipientAllowedForGovernedTest } from "@/lib/governed-test-recipient";
import { prisma } from "@/lib/db";
import { requireClientAccess } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import {
  humanizeGovernanceRejection,
  linkReservationToOutboundInTransaction,
  loadGovernedSendingMailbox,
  tryReserveSendSlotInTransaction,
} from "@/server/mailbox/sending-policy";
import { triggerOutboundQueueDrain } from "@/server/email/outbound/trigger-queue";

import type { SendPipelineResult } from "@/server/email/send-outbound";

export const GOVERNED_TEST_SUBJECT = "ODoutreach test send — governed mailbox proof";
export const GOVERNED_TEST_BODY =
  "This is a controlled ODoutreach test email sent through the governed mailbox send path.";

/**
 * One-off governed test: same ledger as contact sends, allowlisted internal recipient only,
 * Microsoft managed mailbox only.
 */
export async function queueMicrosoftGovernedTestSend(input: {
  staff: StaffUser;
  clientId: string;
  toEmail: string;
}): Promise<SendPipelineResult> {
  const { staff, clientId, toEmail } = input;
  await requireClientAccess(staff, clientId);

  const to = normalizeEmail(toEmail);
  if (!isRecipientAllowedForGovernedTest(to)) {
    return {
      ok: false,
      outcome: "failed",
      error: `Recipient domain is not allowlisted for governed test sends (set GOVERNED_TEST_EMAIL_DOMAINS or use an allowed internal address).`,
    };
  }

  const toDomain = extractDomainFromEmail(to) || null;

  const decision = await evaluateSuppression(clientId, to);
  if (decision.suppressed) {
    const row = await prisma.outboundEmail.create({
      data: {
        clientId,
        contactId: null,
        staffUserId: staff.id,
        toEmail: to,
        toDomain,
        subject: GOVERNED_TEST_SUBJECT,
        bodySnapshot: GOVERNED_TEST_BODY,
        status: "BLOCKED_SUPPRESSION",
        suppressionSnapshot: decision as object,
        fromAddress: null,
        metadata: { kind: "governedTestSend" } as object,
      },
    });
    return {
      ok: true,
      outcome: "blocked_suppression",
      outboundEmailId: row.id,
      correlationId: row.correlationId,
      decision,
    };
  }

  const governance = await loadGovernedSendingMailbox(clientId);

  if (governance.mode === "legacy" || governance.mode === "ineligible") {
    return {
      ok: false,
      outcome: "failed",
      error:
        governance.mode === "ineligible"
          ? humanizeGovernanceRejection(
              governance.reason,
              governance.mailbox ?? null,
            )
          : "Add a connected Microsoft sending mailbox to run this test.",
    };
  }

  if (governance.mailbox.provider !== "MICROSOFT") {
    return {
      ok: false,
      outcome: "failed",
      error: "This proof send requires a Microsoft 365 governed mailbox (not Google).",
    };
  }

  const idempotencyKey = `governedTest:${clientId}:${randomUUID()}`;

  const txResult = await prisma.$transaction(async (tx) => {
    const m = await tx.clientMailboxIdentity.findFirstOrThrow({
      where: { id: governance.mailbox.id, clientId },
    });
    const reserve = await tryReserveSendSlotInTransaction(tx, {
      clientId,
      mailbox: m,
      idempotencyKey,
      at: new Date(),
    });

    if (!reserve.ok) {
      return { kind: "reserve_fail" as const, error: reserve.error };
    }

    if ("alreadyQueued" in reserve && reserve.alreadyQueued) {
      const existing = await tx.outboundEmail.findFirstOrThrow({
        where: { id: reserve.outboundEmailId, clientId },
        select: { id: true, correlationId: true },
      });
      return { kind: "idempotent" as const, ...existing };
    }

    const fromAddress = normalizeEmail(m.email);
    const newOutboundData = {
      clientId,
      contactId: null as string | null,
      staffUserId: staff.id,
      toEmail: to,
      toDomain,
      subject: GOVERNED_TEST_SUBJECT,
      bodySnapshot: GOVERNED_TEST_BODY,
      status: "QUEUED" as const,
      fromAddress,
      mailboxIdentityId: m.id,
      queuedAt: new Date(),
      metadata: { kind: "governedTestSend" } as object,
    };

    if (reserve.duplicate) {
      if (reserve.outboundEmailId === null) {
        const created = await tx.outboundEmail.create({ data: newOutboundData });
        await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
        return {
          kind: "created" as const,
          id: created.id,
          correlationId: created.correlationId,
        };
      }
      return {
        kind: "reserve_fail" as const,
        error: "Unable to link this send to a reservation. Try again.",
      };
    }

    const created = await tx.outboundEmail.create({ data: newOutboundData });
    await linkReservationToOutboundInTransaction(tx, reserve.reservationId, created.id);
    return {
      kind: "created" as const,
      id: created.id,
      correlationId: created.correlationId,
    };
  });

  if (txResult.kind === "reserve_fail") {
    return { ok: false, outcome: "failed", error: txResult.error };
  }

  await triggerOutboundQueueDrain();

  return {
    ok: true,
    outcome: "queued",
    outboundEmailId: txResult.id,
    correlationId: txResult.correlationId,
  };
}
