/**
 * Seeds the deterministic fixtures the authenticated e2e journeys assert against.
 *
 * Run as its own `tsx` process (see `e2e/global-setup.ts`), not imported by
 * Playwright: the generated Prisma client is ESM and Playwright's TypeScript
 * loader is CommonJS, so importing it from a global-setup module fails on
 * `import.meta`. This mirrors how `prisma/seed.ts` is already run.
 *
 * SAFETY: destructive by design — it upserts rows at fixed ids.
 * `assertSafeTestDatabase` refuses anything that is not an obvious local/CI
 * throwaway database, so these fixtures can never reach real client data.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { RATE_VERSION } from "../src/lib/ai/model-catalog";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  E2E_AI_SPEND,
  E2E_CLIENT,
  E2E_CLIENT_B,
  E2E_CLIENT_BULK,
  E2E_CONTACT,
  E2E_CONTACT_B,
  E2E_CONTACT_BULK,
  e2eBulkContactEmail,
  e2eBulkContactId,
  E2E_LAUNCH_CLIENT,
  E2E_LAUNCH_CONTACT,
  E2E_LAUNCH_CONTACT_LIST,
  E2E_LAUNCH_ENROLLMENT,
  E2E_LAUNCH_MAILBOX,
  E2E_LAUNCH_MAILBOX_SIGNATURE_HTML,
  E2E_LAUNCH_SEQUENCE,
  E2E_LAUNCH_STEP,
  E2E_LAUNCH_STEP_SEND,
  E2E_LAUNCH_TEMPLATE,
  E2E_MAILBOX_SIGNATURE_HTML,
  E2E_MAILBOXES,
  E2E_MEMBER_A,
  E2E_MEMBER_B,
  E2E_OUTBOUND_EMAIL,
  E2E_REPLIES_WAITING,
  E2E_STAFF,
  E2E_SUPER_ADMIN,
  E2E_SUPPRESSION,
  e2eSuppressedEmail,
} from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

/**
 * Upserts the fixture graph: two staff personas, one workspace, one contact and
 * one already-SENT outbound email. Idempotent — safe to run before every suite.
 */
async function seedE2eFixtures(databaseUrl: string | undefined): Promise<void> {
  // Throws with an explicit message when unset — never falls back to DATABASE_URL.
  const safeUrl = assertSafeTestDatabase(databaseUrl);

  const pool = new Pool({ connectionString: safeUrl.toString() });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.staffUser.upsert({
      where: { entraObjectId: E2E_SUPER_ADMIN.entraObjectId },
      create: {
        entraObjectId: E2E_SUPER_ADMIN.entraObjectId,
        email: E2E_SUPER_ADMIN.email,
        displayName: E2E_SUPER_ADMIN.displayName,
        role: "ADMIN",
        isActive: true,
        isSuperAdmin: true,
      },
      update: { isActive: true, isSuperAdmin: true, role: "ADMIN" },
    });

    await prisma.staffUser.upsert({
      where: { entraObjectId: E2E_STAFF.entraObjectId },
      create: {
        entraObjectId: E2E_STAFF.entraObjectId,
        email: E2E_STAFF.email,
        displayName: E2E_STAFF.displayName,
        role: "OPERATOR",
        isActive: true,
        isSuperAdmin: false,
      },
      update: { isActive: true, isSuperAdmin: false, role: "OPERATOR" },
    });

    await prisma.client.upsert({
      where: { id: E2E_CLIENT.id },
      create: {
        id: E2E_CLIENT.id,
        name: E2E_CLIENT.name,
        slug: E2E_CLIENT.slug,
        status: "ACTIVE",
      },
      update: { name: E2E_CLIENT.name, status: "ACTIVE", deletedAt: null },
    });

    await prisma.contact.upsert({
      where: { id: E2E_CONTACT.id },
      create: {
        id: E2E_CONTACT.id,
        clientId: E2E_CLIENT.id,
        email: E2E_CONTACT.email,
        fullName: E2E_CONTACT.fullName,
        emailDomain: "example.test",
      },
      update: { email: E2E_CONTACT.email, isSuppressed: false },
    });

    await prisma.outboundEmail.upsert({
      where: { id: E2E_OUTBOUND_EMAIL.id },
      create: {
        id: E2E_OUTBOUND_EMAIL.id,
        clientId: E2E_CLIENT.id,
        contactId: E2E_CONTACT.id,
        toEmail: E2E_OUTBOUND_EMAIL.toEmail,
        toDomain: "example.test",
        subject: E2E_OUTBOUND_EMAIL.subject,
        fromAddress: "sender@example.test",
        providerName: "mock",
        status: "SENT",
        sentAt: new Date("2026-01-01T09:00:00.000Z"),
        queuedAt: new Date("2026-01-01T08:59:00.000Z"),
      },
      update: { status: "SENT", subject: E2E_OUTBOUND_EMAIL.subject },
    });

    /**
     * Sending mailboxes, so the Mailboxes screen has the thing it is named
     * after. Four connected + one offline, matching the live shape — see
     * `E2E_MAILBOXES` for why that mix matters, and for why it cannot send.
     */
    for (const mailbox of E2E_MAILBOXES) {
      const signature = mailbox.connected
        ? {
            senderDisplayName: "E2E Sender",
            senderSignatureHtml: E2E_MAILBOX_SIGNATURE_HTML,
            senderSignatureSource: "manual",
          }
        : {
            senderDisplayName: null,
            senderSignatureHtml: null,
            senderSignatureSource: null,
          };
      const connection = {
        connectionStatus: mailbox.connected ? ("CONNECTED" as const) : ("DRAFT" as const),
        connectedAt: mailbox.connected ? new Date("2026-01-01T09:00:00.000Z") : null,
      };
      await prisma.clientMailboxIdentity.upsert({
        where: { id: mailbox.id },
        create: {
          id: mailbox.id,
          clientId: E2E_CLIENT.id,
          provider: "MICROSOFT",
          email: mailbox.email,
          emailNormalized: mailbox.email,
          isActive: true,
          ...connection,
          ...signature,
        },
        update: {
          isActive: true,
          workspaceRemovedAt: null,
          ...connection,
          ...signature,
        },
      });
    }

    // ---- Launch journey fixtures (queue item 117) ----------------------
    // A whole sequence graph that is genuinely launch-ready on screen:
    // ACTIVE client, one connected+signed mailbox, an approved INTRODUCTION
    // template carrying {{unsubscribe_link}}, a contact list with one
    // email-sendable member, an enrollment, and a READY step-send row — every
    // blocker in `evaluateSequenceLaunchReadiness` passes. See the fixture
    // constants for the send-safety reasoning (no MailboxIdentitySecret, and
    // the queue never drains under `e2e/env.ts`).
    await prisma.client.upsert({
      where: { id: E2E_LAUNCH_CLIENT.id },
      create: {
        id: E2E_LAUNCH_CLIENT.id,
        name: E2E_LAUNCH_CLIENT.name,
        slug: E2E_LAUNCH_CLIENT.slug,
        status: "ACTIVE",
        // Dispatch-time unsubscribe composition falls back to
        // `mailto:<defaultSenderEmail>` when no aligned link domain is
        // configured — null here fails composition with "No unsubscribe
        // link could be created", which the readiness rail's own
        // {{unsubscribe_link}}-token check does not catch.
        defaultSenderEmail: E2E_LAUNCH_MAILBOX.email,
      },
      update: {
        name: E2E_LAUNCH_CLIENT.name,
        status: "ACTIVE",
        deletedAt: null,
        defaultSenderEmail: E2E_LAUNCH_MAILBOX.email,
      },
    });

    await prisma.clientMailboxIdentity.upsert({
      where: { id: E2E_LAUNCH_MAILBOX.id },
      create: {
        id: E2E_LAUNCH_MAILBOX.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        provider: "MICROSOFT",
        email: E2E_LAUNCH_MAILBOX.email,
        emailNormalized: E2E_LAUNCH_MAILBOX.email,
        isActive: true,
        connectionStatus: "CONNECTED",
        connectedAt: new Date("2026-01-01T09:00:00.000Z"),
        senderDisplayName: "E2E Launch Sender",
        senderSignatureHtml: E2E_LAUNCH_MAILBOX_SIGNATURE_HTML,
        senderSignatureSource: "manual",
      },
      update: {
        isActive: true,
        workspaceRemovedAt: null,
        connectionStatus: "CONNECTED",
        connectedAt: new Date("2026-01-01T09:00:00.000Z"),
        senderSignatureHtml: E2E_LAUNCH_MAILBOX_SIGNATURE_HTML,
        senderSignatureSource: "manual",
      },
    });

    await prisma.contact.upsert({
      where: { id: E2E_LAUNCH_CONTACT.id },
      create: {
        id: E2E_LAUNCH_CONTACT.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        email: E2E_LAUNCH_CONTACT.email,
        fullName: E2E_LAUNCH_CONTACT.fullName,
        emailDomain: "example.test",
      },
      update: { email: E2E_LAUNCH_CONTACT.email, isSuppressed: false },
    });

    await prisma.contactList.upsert({
      where: { id: E2E_LAUNCH_CONTACT_LIST.id },
      create: {
        id: E2E_LAUNCH_CONTACT_LIST.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        name: E2E_LAUNCH_CONTACT_LIST.name,
      },
      update: { name: E2E_LAUNCH_CONTACT_LIST.name, archivedAt: null },
    });

    await prisma.contactListMember.upsert({
      where: {
        contactListId_contactId: {
          contactListId: E2E_LAUNCH_CONTACT_LIST.id,
          contactId: E2E_LAUNCH_CONTACT.id,
        },
      },
      create: {
        contactListId: E2E_LAUNCH_CONTACT_LIST.id,
        contactId: E2E_LAUNCH_CONTACT.id,
        clientId: E2E_LAUNCH_CLIENT.id,
      },
      update: {},
    });

    await prisma.clientEmailTemplate.upsert({
      where: { id: E2E_LAUNCH_TEMPLATE.id },
      create: {
        id: E2E_LAUNCH_TEMPLATE.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        name: E2E_LAUNCH_TEMPLATE.name,
        category: "INTRODUCTION",
        subject: E2E_LAUNCH_TEMPLATE.subject,
        content: E2E_LAUNCH_TEMPLATE.content,
        status: "APPROVED",
      },
      update: {
        subject: E2E_LAUNCH_TEMPLATE.subject,
        content: E2E_LAUNCH_TEMPLATE.content,
        status: "APPROVED",
        archivedAt: null,
      },
    });

    await prisma.clientEmailSequence.upsert({
      where: { id: E2E_LAUNCH_SEQUENCE.id },
      create: {
        id: E2E_LAUNCH_SEQUENCE.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        contactListId: E2E_LAUNCH_CONTACT_LIST.id,
        name: E2E_LAUNCH_SEQUENCE.name,
        status: "APPROVED",
      },
      update: {
        contactListId: E2E_LAUNCH_CONTACT_LIST.id,
        status: "APPROVED",
        archivedAt: null,
      },
    });

    await prisma.clientEmailSequenceStep.upsert({
      where: { id: E2E_LAUNCH_STEP.id },
      create: {
        id: E2E_LAUNCH_STEP.id,
        sequenceId: E2E_LAUNCH_SEQUENCE.id,
        templateId: E2E_LAUNCH_TEMPLATE.id,
        category: "INTRODUCTION",
        position: 0,
      },
      update: { templateId: E2E_LAUNCH_TEMPLATE.id },
    });

    await prisma.clientEmailSequenceEnrollment.upsert({
      where: { id: E2E_LAUNCH_ENROLLMENT.id },
      create: {
        id: E2E_LAUNCH_ENROLLMENT.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        sequenceId: E2E_LAUNCH_SEQUENCE.id,
        contactId: E2E_LAUNCH_CONTACT.id,
        contactListId: E2E_LAUNCH_CONTACT_LIST.id,
        status: "PENDING",
      },
      update: { status: "PENDING", currentStepPosition: 0 },
    });

    /**
     * DELETED AND REWRITTEN each run, like the AI ledger and replies fixtures
     * above and for a related but sharper reason: `tryReserveSendSlotInTransaction`
     * (src/server/mailbox/sending-policy.ts) permanently refuses to reuse a
     * `MailboxSendReservation` whose `idempotencyKey` is already `RELEASED` —
     * real duplicate-send protection, working as designed. A confirmed Launch
     * in one test run reserves-then-releases this fixture's key when the
     * dispatch doesn't complete (e.g. a genuinely blocked recipient); a bare
     * upsert would leave that released row in place, and every subsequent
     * local run against the same persistent database would then find the
     * step-send permanently stuck — a fresh CI database never shows this, so
     * it would otherwise only surface as flaky-on-rerun for a developer.
     * Clearing both tables scoped to this fixture's own ids before
     * re-upserting keeps the fixture idempotent across repeated local runs,
     * not just a single fresh one.
     */
    await prisma.mailboxSendReservation.deleteMany({
      where: { mailboxIdentityId: E2E_LAUNCH_MAILBOX.id },
    });
    await prisma.outboundEmail.deleteMany({
      where: { clientId: E2E_LAUNCH_CLIENT.id },
    });
    await prisma.clientEmailSequenceStepSend.upsert({
      where: { id: E2E_LAUNCH_STEP_SEND.id },
      create: {
        id: E2E_LAUNCH_STEP_SEND.id,
        clientId: E2E_LAUNCH_CLIENT.id,
        sequenceId: E2E_LAUNCH_SEQUENCE.id,
        enrollmentId: E2E_LAUNCH_ENROLLMENT.id,
        stepId: E2E_LAUNCH_STEP.id,
        templateId: E2E_LAUNCH_TEMPLATE.id,
        contactId: E2E_LAUNCH_CONTACT.id,
        contactListId: E2E_LAUNCH_CONTACT_LIST.id,
        status: "READY",
        idempotencyKey: E2E_LAUNCH_STEP_SEND.idempotencyKey,
      },
      update: {
        status: "READY",
        outboundEmailId: null,
        blockedReason: null,
        failureReason: null,
      },
    });

    // ---- cross-tenant isolation fixtures (BC-01) -----------------------
    // A second workspace, and one staff member scoped to each. Membership is
    // what getAccessibleClientIds reads, so without these rows the isolation
    // path is never exercised by a test.
    await prisma.client.upsert({
      where: { id: E2E_CLIENT_B.id },
      create: {
        id: E2E_CLIENT_B.id,
        name: E2E_CLIENT_B.name,
        slug: E2E_CLIENT_B.slug,
        status: "ACTIVE",
      },
      update: { name: E2E_CLIENT_B.name, status: "ACTIVE", deletedAt: null },
    });

    for (const [person, clientId] of [
      [E2E_MEMBER_A, E2E_CLIENT.id],
      [E2E_MEMBER_B, E2E_CLIENT_B.id],
    ] as const) {
      const staff = await prisma.staffUser.upsert({
        where: { entraObjectId: person.entraObjectId },
        create: {
          entraObjectId: person.entraObjectId,
          email: person.email,
          displayName: person.displayName,
          isActive: true,
          isSuperAdmin: false,
          role: "OPERATOR",
        },
        update: { isActive: true, isSuperAdmin: false, role: "OPERATOR" },
      });

      await prisma.clientMembership.upsert({
        where: { staffUserId_clientId: { staffUserId: staff.id, clientId } },
        create: { staffUserId: staff.id, clientId, role: "CONTRIBUTOR" },
        update: { role: "CONTRIBUTOR" },
      });
    }

    // Client B needs a record of its own, so the test proves each side sees its
    // own data and not the other, rather than merely seeing nothing.
    await prisma.contact.upsert({
      where: { id: E2E_CONTACT_B.id },
      create: {
        id: E2E_CONTACT_B.id,
        clientId: E2E_CLIENT_B.id,
        email: E2E_CONTACT_B.email,
        fullName: E2E_CONTACT_B.fullName,
        emailDomain: "example.test",
      },
      update: { email: E2E_CONTACT_B.email, isSuppressed: false },
    });

    /**
     * Enough blocked addresses to exceed one page of /suppression, so the
     * "Showing 200 of 200 while there are really 30,229" defect has something
     * to reproduce against. Domains stay under one page so the other branch of
     * the count sentence ("Showing all 3") is exercised too.
     */
    await prisma.suppressionSource.upsert({
      where: { id: E2E_SUPPRESSION.sourceId },
      create: {
        id: E2E_SUPPRESSION.sourceId,
        clientId: E2E_CLIENT.id,
        kind: "EMAIL",
        label: "E2E blocked addresses",
        syncStatus: "SUCCESS",
      },
      update: { syncStatus: "SUCCESS" },
    });
    await prisma.suppressionSource.upsert({
      where: { id: E2E_SUPPRESSION.domainSourceId },
      create: {
        id: E2E_SUPPRESSION.domainSourceId,
        clientId: E2E_CLIENT.id,
        kind: "DOMAIN",
        label: "E2E blocked domains",
        syncStatus: "SUCCESS",
      },
      update: { syncStatus: "SUCCESS" },
    });

    await prisma.suppressedEmail.createMany({
      data: Array.from({ length: E2E_SUPPRESSION.emailCount }, (_, i) => ({
        clientId: E2E_CLIENT.id,
        sourceId: E2E_SUPPRESSION.sourceId,
        email: e2eSuppressedEmail(i),
      })),
      skipDuplicates: true,
    });
    await prisma.suppressedDomain.createMany({
      data: Array.from({ length: E2E_SUPPRESSION.domainCount }, (_, i) => ({
        clientId: E2E_CLIENT.id,
        sourceId: E2E_SUPPRESSION.domainSourceId,
        domain: `blocked-${i}.e2e-suppression.test`,
      })),
      skipDuplicates: true,
    });

    /**
     * Enough contacts to exceed one page of /contacts (queue item 27, defect 9).
     * Before the fix the page rendered every row it was given, up to 500, each
     * with a `SendToContactForm` client component — 2,977 KB and 19,265 ms on
     * the live site. `e2e/contacts-pagination.spec.ts` counts the rows that are
     * actually painted, so there has to be more than one page of them.
     */
    await prisma.client.upsert({
      where: { id: E2E_CLIENT_BULK.id },
      create: {
        id: E2E_CLIENT_BULK.id,
        name: E2E_CLIENT_BULK.name,
        slug: E2E_CLIENT_BULK.slug,
        status: "ACTIVE",
      },
      update: { name: E2E_CLIENT_BULK.name, status: "ACTIVE", deletedAt: null },
    });
    /**
     * AI usage ledger rows for `/settings/ai-spend`.
     *
     * DELETED AND REWRITTEN each run rather than upserted, because these rows
     * are read by a MONTH-BOUNDED query: an upsert would keep the original
     * `createdAt` for ever, so a database that survived a month boundary would
     * stop returning them and the spec would fail for a reason that has nothing
     * to do with the code. Recreating them stamps `createdAt` at "now", which
     * is always inside the month the screen shows by default.
     *
     * The delete is narrowed to this fixture's own id prefix. Combined with
     * `assertSafeTestDatabase` above it cannot reach anything real.
     */
    await prisma.aiUsageEvent.deleteMany({
      where: { id: { startsWith: E2E_AI_SPEND.idPrefix } },
    });
    await prisma.aiUsageEvent.createMany({
      data: [
        // Workspace A: three charged calls, four refusals, one failure. The
        // mix matters — production today refuses every call, and the screen has
        // to make that visible rather than showing an empty table.
        ...E2E_AI_SPEND.clientA.costMicroUsdPerOkCall.map((costMicroUsd, i) => ({
          id: `${E2E_AI_SPEND.idPrefix}a-ok-${i}`,
          clientId: E2E_CLIENT.id,
          clientSlugAtCall: E2E_CLIENT.slug,
          feature: "REPLY_CLASSIFICATION" as const,
          status: "OK" as const,
          model: E2E_AI_SPEND.model,
          inputTokens: E2E_AI_SPEND.clientA.inputTokensPerOkCall,
          outputTokens: E2E_AI_SPEND.clientA.outputTokensPerOkCall,
          costMicroUsd,
          inputRatePerMTokMicroUsd: 1_000_000,
          outputRatePerMTokMicroUsd: 5_000_000,
          rateVersion: RATE_VERSION,
        })),
        ...Array.from({ length: E2E_AI_SPEND.clientA.refusedCalls }, (_, i) => ({
          id: `${E2E_AI_SPEND.idPrefix}a-refused-${i}`,
          clientId: E2E_CLIENT.id,
          clientSlugAtCall: E2E_CLIENT.slug,
          feature: "REPLY_CLASSIFICATION" as const,
          status: "REFUSED" as const,
          model: E2E_AI_SPEND.model,
          rateVersion: RATE_VERSION,
          outcomeCode: "no_api_key",
        })),
        ...Array.from({ length: E2E_AI_SPEND.clientA.errorCalls }, (_, i) => ({
          id: `${E2E_AI_SPEND.idPrefix}a-error-${i}`,
          clientId: E2E_CLIENT.id,
          clientSlugAtCall: E2E_CLIENT.slug,
          feature: "REPLY_CLASSIFICATION" as const,
          status: "ERROR" as const,
          model: E2E_AI_SPEND.model,
          rateVersion: RATE_VERSION,
          outcomeCode: "overloaded_error",
        })),
        // Workspace B: one charged call, so the spec proves the total is split
        // per client rather than lumped together.
        {
          id: `${E2E_AI_SPEND.idPrefix}b-ok-0`,
          clientId: E2E_CLIENT_B.id,
          clientSlugAtCall: E2E_CLIENT_B.slug,
          feature: "REPLY_CLASSIFICATION" as const,
          status: "OK" as const,
          model: E2E_AI_SPEND.model,
          inputTokens: E2E_AI_SPEND.clientB.inputTokens,
          outputTokens: E2E_AI_SPEND.clientB.outputTokens,
          costMicroUsd: E2E_AI_SPEND.clientB.costMicroUsd,
          inputRatePerMTokMicroUsd: 1_000_000,
          outputRatePerMTokMicroUsd: 5_000_000,
          rateVersion: RATE_VERSION,
        },
      ],
    });

    await prisma.contact.createMany({
      data: Array.from({ length: E2E_CONTACT_BULK.count }, (_, i) => ({
        // Fixed id — `Contact` has no unique (clientId, email), so without this
        // `skipDuplicates` dedupes nothing and every seed run adds another 260.
        id: e2eBulkContactId(i),
        clientId: E2E_CLIENT_BULK.id,
        email: e2eBulkContactEmail(i),
        fullName: `Bulk Contact ${String(i).padStart(4, "0")}`,
        emailDomain: "e2e-contacts.test",
      })),
      skipDuplicates: true,
    });

    /**
     * Inbound replies for the cross-client `/replies` queue.
     *
     * DELETED AND REWRITTEN each run, like the AI ledger above and for the
     * same class of reason: this screen is bounded to the last 30 days and
     * ranks by how long somebody has waited, so an upsert would pin
     * `receivedAt` to the first ever run — the rows would first go stale, then
     * drop out of the window entirely. Recreating them stamps each row a fixed
     * distance behind "now", which is what the assertions describe.
     *
     * The delete is narrowed to this fixture's own id prefix and sits behind
     * `assertSafeTestDatabase` above, so it cannot reach anything real.
     *
     * `linkedOutboundEmailId` is deliberately left null: an uncorrelated reply
     * has no handled-state to read, so these rows also prove that a reply the
     * matcher could not tie to a send is still routed to a person rather than
     * quietly dropped.
     */
    const seededAt = Date.now();
    await prisma.inboundReply.deleteMany({
      where: { id: { startsWith: E2E_REPLIES_WAITING.idPrefix } },
    });
    await prisma.inboundReply.createMany({
      data: [
        ...E2E_REPLIES_WAITING.expectedOrder.map((row, i) => ({
          id: `${E2E_REPLIES_WAITING.idPrefix}shown-${String(i)}`,
          clientId: E2E_CLIENT.id,
          fromEmail: row.email,
          subject: `E2E waiting reply ${String(i)}`,
          bodyPreview: "Seeded reply for the waiting-for-a-person queue.",
          receivedAt: new Date(seededAt - row.hoursAgo * 3_600_000),
          // Index 3 is the UNCLASSIFIED row — the state production is entirely
          // in today, because ANTHROPIC_API_KEY is unset in Azure. It must
          // still appear on the screen.
          classification:
            i === 0 || i === 1
              ? ("POSITIVE" as const)
              : i === 2
                ? ("REFERRAL" as const)
                : i === 3
                  ? null
                  : ("INTERESTED_LATER" as const),
          classificationRationale:
            i === 0 ? E2E_REPLIES_WAITING.topRationale : null,
        })),
        // The two that must never reach the queue. A rejection needs no
        // action, and an opt-out was already actioned at ingest.
        {
          id: `${E2E_REPLIES_WAITING.idPrefix}excluded-0`,
          clientId: E2E_CLIENT.id,
          fromEmail: E2E_REPLIES_WAITING.excluded[0],
          subject: "E2E rejection",
          receivedAt: new Date(seededAt - 3_600_000),
          classification: "NOT_INTERESTED" as const,
        },
        {
          id: `${E2E_REPLIES_WAITING.idPrefix}excluded-1`,
          clientId: E2E_CLIENT.id,
          fromEmail: E2E_REPLIES_WAITING.excluded[1],
          subject: "E2E opt-out",
          receivedAt: new Date(seededAt - 3_600_000),
          classification: "UNSUBSCRIBE" as const,
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedE2eFixtures(process.env.E2E_DATABASE_URL).catch((error: unknown) => {
  console.error("e2e fixture seed failed:", error);
  process.exit(1);
});
