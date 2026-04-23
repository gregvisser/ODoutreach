/**
 * One-time controlled retirement of the "OD Mailbox Proof" test client.
 *
 * SAFE-BY-DEFAULT. Dry-run prints a full dependency audit. Write mode
 * performs only a reversible soft retirement (rename + status=ARCHIVED).
 *
 * This script will NEVER hard-delete rows. Hard deletion is blocked
 * because static schema analysis cannot prove that:
 *   - no client-scoped ContactList rows would be orphaned to global
 *     (Client -> ContactList uses onDelete: SetNull),
 *   - Postgres cascade ordering will resolve the Restrict FKs on
 *     ClientEmailSequence*, ClientEmailSequenceStepSend and
 *     ClientEmailSequenceEnrollment without blocking mid-transaction.
 *
 * Scope:
 *   - Touches only the single client id hard-coded below.
 *   - Refuses to run if CLIENT_ID env is not the allow-listed id.
 *   - Refuses writes unless CONFIRM env matches the confirmation token.
 *   - Idempotent: re-running after archive is a no-op with a clear log.
 *
 * Does NOT:
 *   - send email, submit replies, import contacts, sync suppression,
 *     reconnect OAuth, change app settings, or rotate secrets.
 *
 * Usage:
 *   # Dry-run audit only (safe, no writes):
 *   DRY_RUN=1 npm run ops:retire-test-client
 *
 *   # Perform soft retirement (rename + archive):
 *   CONFIRM="RETIRE OD MAILBOX PROOF" npm run ops:retire-test-client
 */
import "dotenv/config";

import { prisma } from "../src/lib/db";

const ALLOWED_CLIENT_ID = "cmo2zipl90000ggo8c9j4ysfn";
const EXPECTED_NAME_SUBSTRING = "OD Mailbox Proof";
const CONFIRM_TOKEN = "RETIRE OD MAILBOX PROOF";
const RETIRED_NAME_PREFIX = "ZZZ TEST - ";

type AuditCounts = Record<string, number>;

async function gatherDependencyAudit(clientId: string): Promise<{
  client: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  counts: AuditCounts;
  contactListOwnership: {
    clientScopedOwnedLists: number;
    memberRowsReferencingThisClient: number;
  };
  mailboxStates: Array<{
    id: string;
    email: string;
    provider: string;
    connectionStatus: string;
    isActive: boolean;
    isSendingEnabled: boolean;
  }>;
  outboundByStatus: Record<string, number>;
}> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
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
    return {
      client: null,
      counts: {},
      contactListOwnership: {
        clientScopedOwnedLists: 0,
        memberRowsReferencingThisClient: 0,
      },
      mailboxStates: [],
      outboundByStatus: {},
    };
  }

  const [
    clientMemberships,
    clientOnboarding,
    mailboxIdentities,
    mailboxSecrets,
    inboundMailboxMessages,
    mailboxSendReservations,
    contacts,
    contactImportBatches,
    rocketReachEnrichments,
    contactListMembers,
    clientScopedOwnedLists,
    suppressionSources,
    suppressedEmails,
    suppressedDomains,
    unsubscribeTokens,
    campaigns,
    outboundEmails,
    outboundProviderEvents,
    inboundReplies,
    reportingDailySnapshots,
    auditLogs,
    emailTemplates,
    emailSequences,
    sequenceSteps,
    sequenceEnrollments,
    sequenceStepSends,
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

  const outboundGrouped = await prisma.outboundEmail.groupBy({
    by: ["status"],
    where: { clientId },
    _count: { _all: true },
  });

  const mailboxRows = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
    select: {
      id: true,
      emailNormalized: true,
      provider: true,
      connectionStatus: true,
      isActive: true,
      isSendingEnabled: true,
    },
    orderBy: { emailNormalized: "asc" },
  });

  return {
    client,
    counts: {
      ClientMembership: clientMemberships,
      ClientOnboarding: clientOnboarding,
      ClientMailboxIdentity: mailboxIdentities,
      MailboxIdentitySecret: mailboxSecrets,
      InboundMailboxMessage: inboundMailboxMessages,
      MailboxSendReservation: mailboxSendReservations,
      Contact: contacts,
      ContactImportBatch: contactImportBatches,
      RocketReachEnrichment: rocketReachEnrichments,
      ContactListMember: contactListMembers,
      ContactList_clientScoped: clientScopedOwnedLists,
      SuppressionSource: suppressionSources,
      SuppressedEmail: suppressedEmails,
      SuppressedDomain: suppressedDomains,
      UnsubscribeToken: unsubscribeTokens,
      Campaign: campaigns,
      OutboundEmail: outboundEmails,
      OutboundProviderEvent: outboundProviderEvents,
      InboundReply: inboundReplies,
      ReportingDailySnapshot: reportingDailySnapshots,
      AuditLog: auditLogs,
      ClientEmailTemplate: emailTemplates,
      ClientEmailSequence: emailSequences,
      ClientEmailSequenceStep: sequenceSteps,
      ClientEmailSequenceEnrollment: sequenceEnrollments,
      ClientEmailSequenceStepSend: sequenceStepSends,
    },
    contactListOwnership: {
      clientScopedOwnedLists,
      memberRowsReferencingThisClient: contactListMembers,
    },
    mailboxStates: mailboxRows.map((m) => ({
      id: m.id,
      email: m.emailNormalized,
      provider: m.provider,
      connectionStatus: m.connectionStatus,
      isActive: m.isActive,
      isSendingEnabled: m.isSendingEnabled,
    })),
    outboundByStatus: Object.fromEntries(
      outboundGrouped.map((row) => [row.status, row._count._all]),
    ),
  };
}

async function performSoftRetirement(clientId: string, currentName: string) {
  const nextName = currentName.startsWith(RETIRED_NAME_PREFIX)
    ? currentName
    : `${RETIRED_NAME_PREFIX}${currentName}`;

  await prisma.$transaction([
    prisma.client.update({
      where: { id: clientId },
      data: {
        name: nextName,
        status: "ARCHIVED",
      },
    }),
    prisma.auditLog.create({
      data: {
        clientId,
        action: "UPDATE",
        entityType: "Client",
        entityId: clientId,
        metadata: {
          reason: "retire-test-client script",
          previousName: currentName,
          nextName,
          setStatus: "ARCHIVED",
          confirmationToken: CONFIRM_TOKEN,
          scriptVersion: 1,
        },
      },
    }),
  ]);

  return { nextName };
}

async function main() {
  const envClientId = process.env.CLIENT_ID?.trim();
  const clientId = envClientId || ALLOWED_CLIENT_ID;
  const dryRun = process.env.DRY_RUN === "1";
  const confirm = process.env.CONFIRM?.trim();

  if (clientId !== ALLOWED_CLIENT_ID) {
    console.error(
      `Refusing: CLIENT_ID must equal "${ALLOWED_CLIENT_ID}". ` +
        `This script is hard-scoped to the OD Mailbox Proof test client.`,
    );
    process.exit(2);
  }

  console.log(
    `[retire-test-client] target clientId=${clientId} dryRun=${dryRun ? "yes" : "no"}`,
  );

  const audit = await gatherDependencyAudit(clientId);

  if (!audit.client) {
    console.log(
      "Client not found. Nothing to retire. (Already hard-deleted or wrong id.)",
    );
    return;
  }

  console.log("\n— Client snapshot —");
  console.log(JSON.stringify(audit.client, null, 2));

  console.log("\n— Dependency counts —");
  console.log(JSON.stringify(audit.counts, null, 2));

  console.log("\n— Mailbox identities —");
  console.log(JSON.stringify(audit.mailboxStates, null, 2));

  console.log("\n— OutboundEmail counts by status —");
  console.log(JSON.stringify(audit.outboundByStatus, null, 2));

  console.log(
    "\n— ContactList ownership —\n" +
      JSON.stringify(audit.contactListOwnership, null, 2),
  );

  if (!audit.client.name.includes(EXPECTED_NAME_SUBSTRING)) {
    const alreadyRetired = audit.client.name.startsWith(RETIRED_NAME_PREFIX);
    if (!alreadyRetired) {
      console.error(
        `\nRefusing: client name "${audit.client.name}" does not contain ` +
          `"${EXPECTED_NAME_SUBSTRING}" and is not a retired rename. ` +
          `Safety check failed — is this the right client?`,
      );
      process.exit(4);
    }
  }

  if (dryRun) {
    console.log("\nDRY_RUN=1 — no writes performed. Exit 0.");
    return;
  }

  if (confirm !== CONFIRM_TOKEN) {
    console.error(
      `\nRefusing: set CONFIRM="${CONFIRM_TOKEN}" to proceed with soft retirement ` +
        `(rename + status=ARCHIVED). Alternatively pass DRY_RUN=1 for a read-only audit.`,
    );
    process.exit(3);
  }

  if (
    audit.client.status === "ARCHIVED" &&
    audit.client.name.startsWith(RETIRED_NAME_PREFIX)
  ) {
    console.log(
      "\nAlready retired (ARCHIVED + renamed). No changes needed. Exit 0.",
    );
    return;
  }

  const result = await performSoftRetirement(clientId, audit.client.name);
  console.log(
    `\nSoft retirement complete. Renamed to "${result.nextName}" and set status=ARCHIVED.`,
  );
  console.log("Audit log entry recorded. No hard deletion performed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
