/*
 * scripts/hard-delete-test-client.ts
 *
 * One-off controlled destructive cleanup for the retired test client
 * "ZZZ TEST - OD Mailbox Proof" (clientId cmo2zipl90000ggo8c9j4ysfn).
 *
 * Design contract (see docs/ops/TEST_CLIENT_HARD_DELETE_2026-04-23.md):
 *   - Hard-coded to a single clientId. Refuses to run for anything else.
 *   - Refuses to run unless the target row's current name matches the
 *     expected retired name AND its status is ARCHIVED. This rules out
 *     accidental execution against an un-retired row.
 *   - DRY_RUN=1 prints a live dependency audit and performs zero writes.
 *   - REHEARSE=1 runs the full ordered delete transaction against the live
 *     database and then deliberately rolls back. This uses real data and
 *     real FK constraints to prove the delete order works — the only way
 *     to learn of any FK ordering failure without touching a snapshot
 *     environment. Still no committed writes.
 *   - Real execution requires CONFIRM="DELETE OD MAILBOX PROOF FOREVER".
 *   - Explicit ordered deletes, children-first, client-last. No reliance
 *     on implicit cascade ordering — the schema has multiple
 *     onDelete: Restrict FKs (ContactList, ClientEmailSequenceStep,
 *     ClientEmailSequenceEnrollment, ClientEmailSequenceStepSend) that
 *     can abort cascades if hit in the wrong order.
 *   - Also explicitly deletes rows with onDelete: SetNull FKs (AuditLog,
 *     ContactList client-scoped rows, OutboundProviderEvent) so no
 *     client-scoped residue survives as orphaned / reparented data.
 *   - Global (clientId IS NULL) ContactList rows are never touched.
 *   - All deletes run in a single Prisma transaction.
 *   - Aborts if the post-delete audit still finds any row for the client.
 *   - Never prints secrets; only prints counts / phase labels.
 */

import "dotenv/config";

import { prisma } from "../src/lib/db";

const TARGET_CLIENT_ID = "cmo2zipl90000ggo8c9j4ysfn";
const EXPECTED_CLIENT_NAME = "ZZZ TEST - OD Mailbox Proof";
const REQUIRED_STATUS = "ARCHIVED" as const;
const CONFIRM_PHRASE = "DELETE OD MAILBOX PROOF FOREVER";

type AuditRow = {
  table: string;
  count: number;
};

async function auditDependencies(clientId: string): Promise<AuditRow[]> {
  const [
    memberships,
    onboarding,
    mailboxIdentities,
    mailboxIdentitySecrets,
    inboundMailboxMessages,
    mailboxSendReservations,
    contacts,
    contactImportBatches,
    rocketReachEnrichments,
    contactListMembers,
    contactListsClientScoped,
    suppressionSources,
    suppressedEmails,
    suppressedDomains,
    unsubscribeTokens,
    campaigns,
    outboundEmails,
    outboundProviderEvents,
    inboundReplies,
    reportingSnapshots,
    auditLogs,
    emailTemplates,
    emailSequences,
    emailSequenceSteps,
    emailSequenceEnrollments,
    emailSequenceStepSends,
  ] = await Promise.all([
    prisma.clientMembership.count({ where: { clientId } }),
    prisma.clientOnboarding.count({ where: { clientId } }),
    prisma.clientMailboxIdentity.count({ where: { clientId } }),
    prisma.mailboxIdentitySecret.count({
      where: { mailbox: { clientId } },
    }),
    prisma.inboundMailboxMessage.count({ where: { clientId } }),
    prisma.mailboxSendReservation.count({ where: { clientId } }),
    prisma.contact.count({ where: { clientId } }),
    prisma.contactImportBatch.count({ where: { clientId } }),
    prisma.rocketReachEnrichment.count({ where: { clientId } }),
    prisma.contactListMember.count({ where: { clientId } }),
    prisma.contactList.count({ where: { clientId } }),
    prisma.suppressionSource.count({ where: { clientId } }),
    prisma.suppressedEmail.count({ where: { clientId } }),
    prisma.suppressedDomain.count({ where: { clientId } }),
    prisma.unsubscribeToken.count({ where: { clientId } }),
    prisma.campaign.count({ where: { clientId } }),
    prisma.outboundEmail.count({ where: { clientId } }),
    prisma.outboundProviderEvent.count({ where: { clientId } }),
    prisma.inboundReply.count({ where: { clientId } }),
    prisma.reportingDailySnapshot.count({ where: { clientId } }),
    prisma.auditLog.count({ where: { clientId } }),
    prisma.clientEmailTemplate.count({ where: { clientId } }),
    prisma.clientEmailSequence.count({ where: { clientId } }),
    prisma.clientEmailSequenceStep.count({
      where: { sequence: { clientId } },
    }),
    prisma.clientEmailSequenceEnrollment.count({ where: { clientId } }),
    prisma.clientEmailSequenceStepSend.count({ where: { clientId } }),
  ]);

  return [
    { table: "ClientMembership", count: memberships },
    { table: "ClientOnboarding", count: onboarding },
    { table: "ClientMailboxIdentity", count: mailboxIdentities },
    { table: "MailboxIdentitySecret", count: mailboxIdentitySecrets },
    { table: "InboundMailboxMessage", count: inboundMailboxMessages },
    { table: "MailboxSendReservation", count: mailboxSendReservations },
    { table: "Contact", count: contacts },
    { table: "ContactImportBatch", count: contactImportBatches },
    { table: "RocketReachEnrichment", count: rocketReachEnrichments },
    { table: "ContactListMember", count: contactListMembers },
    { table: "ContactList (client-scoped)", count: contactListsClientScoped },
    { table: "SuppressionSource", count: suppressionSources },
    { table: "SuppressedEmail", count: suppressedEmails },
    { table: "SuppressedDomain", count: suppressedDomains },
    { table: "UnsubscribeToken", count: unsubscribeTokens },
    { table: "Campaign", count: campaigns },
    { table: "OutboundEmail", count: outboundEmails },
    { table: "OutboundProviderEvent", count: outboundProviderEvents },
    { table: "InboundReply", count: inboundReplies },
    { table: "ReportingDailySnapshot", count: reportingSnapshots },
    { table: "AuditLog", count: auditLogs },
    { table: "ClientEmailTemplate", count: emailTemplates },
    { table: "ClientEmailSequence", count: emailSequences },
    { table: "ClientEmailSequenceStep", count: emailSequenceSteps },
    {
      table: "ClientEmailSequenceEnrollment",
      count: emailSequenceEnrollments,
    },
    { table: "ClientEmailSequenceStepSend", count: emailSequenceStepSends },
  ];
}

async function assertNoGlobalListSideEffect(clientId: string): Promise<void> {
  // Client-scoped ContactList rows must be deleted explicitly; global lists
  // (clientId IS NULL) must NEVER be affected. Confirm none of the global
  // lists contain any member rows tied to this client — member rows would
  // also need to be wiped, which happens via ContactListMember.clientId
  // below, but the global list row itself stays intact.
  const globalListRowsReferencingClient = await prisma.contactListMember.count(
    {
      where: {
        clientId,
        contactList: { clientId: null },
      },
    },
  );
  console.log(
    JSON.stringify(
      { globalListRowsReferencingClient },
      null,
      2,
    ),
  );
  if (globalListRowsReferencingClient > 0) {
    console.log(
      "[hard-delete-test-client] Note: some client contacts appear in global (clientId IS NULL) lists.",
    );
    console.log(
      "[hard-delete-test-client] The ContactListMember rows for this client WILL be deleted, but the global ContactList rows themselves will remain intact.",
    );
  }
}

// Sentinel used to roll back the rehearsal transaction. Thrown inside the
// tx so Prisma rolls every ordered delete back once the script has proven
// the FK ordering works against real data.
class RehearsalRollback extends Error {
  readonly __rehearsalRollback = true;
  constructor(readonly counts: Record<string, number>) {
    super("Rehearsal rollback (intentional)");
  }
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1";
  const rehearse = process.env.REHEARSE === "1";
  const confirm = process.env.CONFIRM ?? "";

  if (dryRun && rehearse) {
    throw new Error("Set either DRY_RUN=1 or REHEARSE=1, not both.");
  }

  if (TARGET_CLIENT_ID !== "cmo2zipl90000ggo8c9j4ysfn") {
    throw new Error("TARGET_CLIENT_ID tampered — refusing to run.");
  }

  const mode = dryRun ? "dry-run" : rehearse ? "rehearse" : "execute";
  console.log(
    `[hard-delete-test-client] target clientId=${TARGET_CLIENT_ID} mode=${mode}`,
  );

  const client = await prisma.client.findUnique({
    where: { id: TARGET_CLIENT_ID },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!client) {
    console.log("Client not found — nothing to do. Exit 0.");
    return;
  }

  console.log("\n— Client snapshot —");
  console.log(JSON.stringify(client, null, 2));

  if (client.name !== EXPECTED_CLIENT_NAME) {
    throw new Error(
      `Safety abort: client name is ${JSON.stringify(
        client.name,
      )}, expected ${JSON.stringify(
        EXPECTED_CLIENT_NAME,
      )}. Not deleting.`,
    );
  }

  if (client.status !== REQUIRED_STATUS) {
    throw new Error(
      `Safety abort: client status is ${client.status}, expected ${REQUIRED_STATUS}. Not deleting.`,
    );
  }

  const audit = await auditDependencies(TARGET_CLIENT_ID);
  console.log("\n— Live dependency counts —");
  console.log(
    JSON.stringify(
      Object.fromEntries(audit.map((r) => [r.table, r.count])),
      null,
      2,
    ),
  );

  console.log("\n— Global list bleed-through check —");
  await assertNoGlobalListSideEffect(TARGET_CLIENT_ID);

  // Sanity guard: prevent accidental delete-everything if counts look
  // catastrophically larger than the retirement-time baseline.
  const totalRows = audit.reduce((sum, row) => sum + row.count, 0);
  const SANITY_CEILING = 100_000;
  if (totalRows > SANITY_CEILING) {
    throw new Error(
      `Safety abort: total dependency count ${totalRows} exceeds sanity ceiling ${SANITY_CEILING}. Not deleting.`,
    );
  }

  if (dryRun) {
    console.log("\nDRY_RUN=1 — no writes performed. Exit 0.");
    return;
  }

  if (!rehearse && confirm !== CONFIRM_PHRASE) {
    throw new Error(
      `Refusing to delete without CONFIRM="${CONFIRM_PHRASE}" environment variable.`,
    );
  }

  if (rehearse) {
    console.log(
      "\n— Executing ordered hard delete in a REHEARSAL transaction (will roll back) —",
    );
  } else {
    console.log("\n— Executing ordered hard delete in a single transaction —");
  }

  let deleted: Record<string, number>;
  try {
    deleted = await prisma.$transaction(async (tx) => {
      const counts: Record<string, number> = {};

      counts.stepSends = (
        await tx.clientEmailSequenceStepSend.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.enrollments = (
        await tx.clientEmailSequenceEnrollment.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.sequenceSteps = (
        await tx.clientEmailSequenceStep.deleteMany({
          where: { sequence: { clientId: TARGET_CLIENT_ID } },
        })
      ).count;

      counts.sequences = (
        await tx.clientEmailSequence.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.templates = (
        await tx.clientEmailTemplate.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.unsubscribeTokens = (
        await tx.unsubscribeToken.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.contactListMembers = (
        await tx.contactListMember.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.contactListsClientScoped = (
        await tx.contactList.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.rocketReachEnrichments = (
        await tx.rocketReachEnrichment.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.contacts = (
        await tx.contact.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.contactImportBatches = (
        await tx.contactImportBatch.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.outboundProviderEvents = (
        await tx.outboundProviderEvent.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.inboundReplies = (
        await tx.inboundReply.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.mailboxSendReservations = (
        await tx.mailboxSendReservation.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.outboundEmails = (
        await tx.outboundEmail.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.inboundMailboxMessages = (
        await tx.inboundMailboxMessage.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.mailboxIdentities = (
        await tx.clientMailboxIdentity.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.suppressedEmails = (
        await tx.suppressedEmail.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.suppressedDomains = (
        await tx.suppressedDomain.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.suppressionSources = (
        await tx.suppressionSource.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.campaigns = (
        await tx.campaign.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.memberships = (
        await tx.clientMembership.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.onboarding = (
        await tx.clientOnboarding.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.reportingSnapshots = (
        await tx.reportingDailySnapshot.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.auditLogs = (
        await tx.auditLog.deleteMany({
          where: { clientId: TARGET_CLIENT_ID },
        })
      ).count;

      counts.client = (
        await tx.client.deleteMany({
          where: {
            id: TARGET_CLIENT_ID,
            name: EXPECTED_CLIENT_NAME,
            status: REQUIRED_STATUS,
          },
        })
      ).count;

      if (counts.client !== 1) {
        throw new Error(
          `Final Client delete removed ${counts.client} rows (expected 1). Aborting transaction.`,
        );
      }

      if (rehearse) {
        throw new RehearsalRollback(counts);
      }

      return counts;
    });
  } catch (err) {
    if (rehearse && err instanceof RehearsalRollback) {
      console.log("\n— Rehearsal delete counts (ROLLED BACK) —");
      console.log(JSON.stringify(err.counts, null, 2));

      const postRehearsalClient = await prisma.client.findUnique({
        where: { id: TARGET_CLIENT_ID },
        select: { id: true, name: true, status: true },
      });

      if (!postRehearsalClient) {
        throw new Error(
          "Rehearsal safety check failed: Client row disappeared after rollback. Transaction did NOT roll back — investigate immediately.",
        );
      }

      const postRehearsalAudit = await auditDependencies(TARGET_CLIENT_ID);
      console.log("\n— Rehearsal post-rollback audit (must match pre-rehearsal counts) —");
      console.log(
        JSON.stringify(
          Object.fromEntries(
            postRehearsalAudit.map((r) => [r.table, r.count]),
          ),
          null,
          2,
        ),
      );

      console.log(
        "\nREHEARSAL OK — ordered delete completed without FK violations and was rolled back. No data was changed.",
      );
      return;
    }
    throw err;
  }

  console.log("\n— Delete counts —");
  console.log(JSON.stringify(deleted, null, 2));

  const postAudit = await auditDependencies(TARGET_CLIENT_ID);
  const nonZero = postAudit.filter((r) => r.count > 0);
  const clientStillExists = await prisma.client.findUnique({
    where: { id: TARGET_CLIENT_ID },
    select: { id: true },
  });

  console.log("\n— Post-delete residual counts —");
  console.log(
    JSON.stringify(
      Object.fromEntries(postAudit.map((r) => [r.table, r.count])),
      null,
      2,
    ),
  );

  if (clientStillExists) {
    throw new Error(
      "Post-delete check: Client row still exists. This should be impossible — investigate.",
    );
  }

  if (nonZero.length > 0) {
    throw new Error(
      `Post-delete check: residual rows still reference clientId — ${JSON.stringify(
        nonZero,
      )}`,
    );
  }

  console.log(
    "\nHard delete complete. Client and all dependent rows have been permanently removed.",
  );
}

main()
  .catch((err) => {
    console.error("[hard-delete-test-client] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
