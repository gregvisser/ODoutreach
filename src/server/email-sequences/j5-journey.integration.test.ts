import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE } from "@/lib/email-sequences/sequence-send-execution-constants";
import { ingestInboundForClient } from "@/server/email/inbound/ingest";
import { executeOutboundSend } from "@/server/email/outbound/execute-one";
import { performUnsubscribe } from "@/server/unsubscribe/unsubscribe-service";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import { enrollSequenceContacts } from "./enrollments";
import { sendSequenceStepBatch } from "./send-introduction";
import { planSequenceStepSends } from "./step-sends";

/**
 * J5 — the critical journey the product is actually sold on, walked end to end:
 *
 *   enrol -> launch -> send -> reply ingested -> opt-out honoured
 *
 * ## Why this file exists
 *
 * SCOPE.md §2 lists five critical journeys. J1-J4 have had e2e coverage since
 * 2026-08-09; J5 has not, and it is the only one that reaches a real third
 * party's inbox. Every LINK in the chain was individually tested — enrolment,
 * the planner (`step-sends.integration.test.ts`), the dispatcher
 * (`execute-one.integration.test.ts`), inbound ingest, the unsubscribe service.
 * The CHAIN was not. That distinction matters here more than most places: this
 * repository's recurring defect is a component that is built, wired, reports
 * success and never fires, and per-link tests are exactly the tests that cannot
 * see it. A break in the joins — a token minted at launch that never reaches the
 * message body, a suppression written that the next planner does not read —
 * passes every existing test and fails the customer.
 *
 * So this test asserts the JOINS, not the links. The opt-out token is read back
 * out of the bytes the transport was actually handed rather than minted by the
 * test, so the rail is checked as the recipient would receive it.
 *
 * Two joins were proven capable of turning this test red by deliberately
 * breaking the product and observing the failure (2026-08-27):
 *
 *   * the planner ignoring `Contact.isSuppressed` — i.e. an opt-out that is
 *     recorded but never read, which is this repository's signature defect —
 *     failed step 6 with `expected 1 to be +0`;
 *   * the inbound matcher no longer linking a reply to its contact failed
 *     step 4 with `expected null to be 'itest-j5-contact'`.
 *
 * ## Why this is an integration test and not Playwright
 *
 * The `e2e/` suite deliberately makes a real send impossible — every provider
 * credential is blanked in `e2e/env.ts`. That is a safety property worth more
 * than browser fidelity, and weakening it to let a browser test "send" would
 * trade a real guarantee for a cosmetic one. The transport must instead be
 * CAPTURED, which needs a module boundary a built production server does not
 * offer. This harness has one; Playwright does not. The browser-observable ends
 * of the journey stay covered by `e2e/`.
 *
 * ## Safety — no mail can leave, in four independent layers
 *
 *  1. `fetch` is stubbed to throw, so any unmocked HTTP attempt fails loudly.
 *  2. Both mailbox transports and their token getters are mocked. The Microsoft
 *     ones throw: this journey sends via Gmail, so a Graph call means the
 *     dispatcher routed somewhere unexpected and the test must fail, not pass.
 *  3. `vitest.integration.config.ts` blanks every provider credential.
 *  4. The database is the throwaway e2e one, guarded by `assertSafeTestDatabase`.
 *
 * The captured transport records the RFC 5322 message instead of sending it,
 * which is what makes asserting on real message bytes possible at all.
 */

/**
 * The dispatcher verifies the recipient's domain can receive mail before
 * sending, and `@example.test` (RFC 2606) never resolves by design. Fake a
 * deliverable answer; the gate itself is covered in
 * `execute-one-address-verification.test.ts`.
 */
vi.mock("node:dns", () => ({
  promises: {
    resolveMx: async () => [{ exchange: "mx.deliverable.test", priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => [],
  },
}));

/** The captured transport: records what would have been sent, and sends nothing. */
const sentMessages: string[] = [];

vi.mock("@/server/mailbox/gmail-sendmail", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/mailbox/gmail-sendmail")>();
  return {
    ...actual,
    sendGmailUsersMessagesSend: vi.fn(
      async (input: { accessToken: string; rfc5322Message: string }) => {
        sentMessages.push(input.rfc5322Message);
        return { ok: true as const, providerMessageId: "j5-captured-gmail-id" };
      },
    ),
    findGmailMessageIdByRfc822MessageId: vi.fn(async () => null),
  };
});

vi.mock("@/server/mailbox/microsoft-graph-sendmail", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/mailbox/microsoft-graph-sendmail")
  >();
  const refuse = () => {
    throw new Error("J5 routed to Microsoft Graph; this journey sends via Gmail");
  };
  return {
    ...actual,
    sendMicrosoftGraphSendMail: vi.fn(refuse),
    sendMicrosoftGraphMimeSendMail: vi.fn(refuse),
    findGraphSentMessageId: vi.fn(async () => null),
  };
});

vi.mock("@/server/mailbox/google-mailbox-access", () => ({
  getGoogleGmailAccessTokenForMailbox: vi.fn(async () => "j5-fake-access-token"),
}));

vi.mock("@/server/mailbox/microsoft-mailbox-access", () => ({
  getMicrosoftGraphAccessTokenForMailbox: vi.fn(async () => ({
    ok: false as const,
    error: "j5-no-microsoft-token",
  })),
}));

const CLIENT_ID = "itest-j5-client";
const CLIENT_SLUG = "j5-workspace";
const STAFF_ID = "itest-j5-staff";
const LIST_ID = "itest-j5-list";
const SEQUENCE_ID = "itest-j5-seq";
const STEP_ID = "itest-j5-step";
const TEMPLATE_ID = "itest-j5-tpl";
const MAILBOX_ID = "itest-j5-mailbox";
const CONTACT_ID = "itest-j5-contact";

const PROSPECT_EMAIL = "ada@prospect.example.test";
const SENDER_EMAIL = "outreach@j5client.test";
/** The client's sender-aligned link domain — where the opt-out link must live. */
const LINK_DOMAIN = "go.j5client.test";

/** `sendSequenceStepBatch` takes the staff row, not just an id. */
async function loadStaff() {
  return prisma.staffUser.findUniqueOrThrow({ where: { id: STAFF_ID } });
}

/**
 * A workspace in the state a real launch requires: ACTIVE, launch-approved, with
 * a verified sender-aligned link domain and one connected Gmail mailbox that is
 * allowed to send. Anything less and governance blocks before the transport,
 * which would make the journey pass for the wrong reason.
 */
async function seedLaunchReadyWorkspace(): Promise<void> {
  await prisma.client.create({
    data: {
      id: CLIENT_ID,
      name: "J5 Workspace",
      slug: CLIENT_SLUG,
      status: "ACTIVE",
      defaultSenderEmail: SENDER_EMAIL,
      launchApprovedAt: new Date("2026-01-01T09:00:00.000Z"),
      outreachLinkDomain: LINK_DOMAIN,
      outreachLinkDomainVerifiedAt: new Date("2026-01-01T09:00:00.000Z"),
    },
  });

  await prisma.staffUser.create({
    data: {
      id: STAFF_ID,
      entraObjectId: "itest-j5-oid",
      email: "j5-staff@opensdoors.example",
      displayName: "J5 Operator",
      role: "ADMIN",
      isActive: true,
      isSuperAdmin: true,
    },
  });

  await prisma.clientMailboxIdentity.create({
    data: {
      id: MAILBOX_ID,
      clientId: CLIENT_ID,
      provider: "GOOGLE",
      email: SENDER_EMAIL,
      emailNormalized: SENDER_EMAIL,
      isActive: true,
      canSend: true,
      isSendingEnabled: true,
      connectionStatus: "CONNECTED",
      connectedAt: new Date("2026-01-01T09:00:00.000Z"),
      senderDisplayName: "J5 Sender",
    },
  });

  await prisma.contactList.create({
    data: { id: LIST_ID, name: "J5 List", clientId: CLIENT_ID },
  });

  await prisma.clientEmailTemplate.create({
    data: {
      id: TEMPLATE_ID,
      clientId: CLIENT_ID,
      name: "J5 Intro",
      category: "INTRODUCTION",
      subject: "Hello {{first_name}}",
      content: "Hi {{first_name}}, a quick note about your work.",
      status: "APPROVED",
    },
  });

  await prisma.clientEmailSequence.create({
    data: {
      id: SEQUENCE_ID,
      clientId: CLIENT_ID,
      name: "J5 Sequence",
      contactListId: LIST_ID,
      status: "APPROVED",
      launchPreferredMailboxId: MAILBOX_ID,
    },
  });

  await prisma.clientEmailSequenceStep.create({
    data: {
      id: STEP_ID,
      sequenceId: SEQUENCE_ID,
      position: 1,
      category: "INTRODUCTION",
      templateId: TEMPLATE_ID,
      delayDays: 0,
      delayHours: 0,
    },
  });

  await prisma.contact.create({
    data: {
      id: CONTACT_ID,
      clientId: CLIENT_ID,
      email: PROSPECT_EMAIL,
      emailDomain: "prospect.example.test",
      firstName: "Ada",
      lastName: "Lovelace",
      fullName: "Ada Lovelace",
      company: "Analytical Engines",
      isSuppressed: false,
    },
  });

  // List membership is the join table, not a column on Contact — and it is what
  // the enrolment reads to find candidates.
  await prisma.contactListMember.create({
    data: {
      contactListId: LIST_ID,
      contactId: CONTACT_ID,
      clientId: CLIENT_ID,
    },
  });
}

/**
 * Everything after the RFC 5322 header block — the part a human actually reads.
 *
 * The split matters. An earlier version of this helper searched the WHOLE
 * message and stayed green when the in-body link was deliberately removed,
 * because it was matching the `List-Unsubscribe` HEADER instead. A header-only
 * opt-out satisfies mail providers but leaves the recipient with no link to
 * click, which is the failure this journey is supposed to catch. So the body is
 * isolated first, and the header is asserted separately.
 */
function messageBody(message: string): string {
  const normalised = message.replace(/\r\n/g, "\n");
  const boundary = normalised.indexOf("\n\n");
  return boundary === -1 ? "" : normalised.slice(boundary + 2);
}

/**
 * Pull the opt-out token out of the BODY the transport was handed.
 *
 * Deliberately not `issueUnsubscribeToken` in the test: reading it back from the
 * captured bytes is what proves the rail survives the whole compose path. If the
 * link is dropped anywhere between minting at launch and the body at dispatch,
 * this returns null and the journey fails.
 *
 * Two path forms are accepted because both are legitimate rails and the compose
 * path chooses between them: `/api/unsubscribe/<token>` is the RFC 8058
 * one-click endpoint (which answers a human's GET with a 302 to the confirmation
 * page), and `/unsubscribe/<token>` is that page directly. What must never
 * happen is NEITHER — an outreach email with no working opt-out.
 */
function unsubscribeTokenFromSentMessage(message: string): string | null {
  const match = messageBody(message)
    // Quoted-printable soft line breaks split long URLs across lines in the
    // MIME body, so undo them or the token comes back truncated.
    .replace(/=\n/g, "")
    .match(unsubscribeUrlPattern());
  return match ? match[1] : null;
}

function unsubscribeUrlPattern(flags = ""): RegExp {
  const host = LINK_DOMAIN.replace(/\./g, "\\.");
  return new RegExp(`https://${host}/(?:api/)?unsubscribe/([A-Za-z0-9_-]+)`, flags);
}

/** How many opt-out links the recipient's mail client could render. */
function countUnsubscribeLinksInBody(message: string): number {
  const unfolded = messageBody(message).replace(/=\n/g, "");
  return unfolded.match(unsubscribeUrlPattern("g"))?.length ?? 0;
}

beforeEach(async () => {
  sentMessages.length = 0;
  vi.clearAllMocks();

  // Layer 1 — the network is closed. Any real transport attempt throws here.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK BLOCKED: a test attempted a real HTTP request");
    }),
  );

  // The relay's own guard reads this. Pin it off so the journey behaves the
  // same whether or not an autonomous cycle happens to be running the suite.
  vi.stubEnv("AUTONOMOUS_RELAY_ACTIVE", "");

  await resetIntegrationDatabase();
  await seedLaunchReadyWorkspace();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("J5 — enrol, launch, send, reply, opt-out", () => {
  it("carries one prospect through every stage, and refuses to email them after they opt out", async () => {
    const staff = await loadStaff();

    // ---- 1. ENROL ---------------------------------------------------------
    const enrolment = await enrollSequenceContacts({
      sequenceId: SEQUENCE_ID,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });
    expect(enrolment.inserted).toBe(1);
    expect(enrolment.totalEnrollments).toBe(1);

    // ---- 2. LAUNCH --------------------------------------------------------
    // Plan first (what the operator reviews), then dispatch the batch.
    const plan = await planSequenceStepSends({
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      stepId: STEP_ID,
      staffUserId: STAFF_ID,
    });
    expect(plan.counts.ready).toBe(1);

    const batch = await sendSequenceStepBatch({
      staff,
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      category: "INTRODUCTION",
      confirmationPhrase: SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
    });
    expect(batch.blocked).toEqual([]);
    expect(batch.counts.queued).toBe(1);

    const outboundId = batch.queued[0].outboundEmailId;
    const queuedRow = await prisma.outboundEmail.findUniqueOrThrow({
      where: { id: outboundId },
    });
    expect(queuedRow.status).toBe("QUEUED");
    expect(queuedRow.toEmail).toBe(PROSPECT_EMAIL);
    // The row must be bound to a real mailbox: a prospect row without one is
    // refused by the transport guard rather than falling back to the mock.
    expect(queuedRow.mailboxIdentityId).toBe(MAILBOX_ID);
    // Launch queues; it must not have sent anything itself.
    expect(sentMessages).toHaveLength(0);

    // ---- 3. SEND ----------------------------------------------------------
    // Claim the row the way the queue processor does, then dispatch it.
    await prisma.outboundEmail.update({
      where: { id: outboundId },
      data: {
        status: "PROCESSING",
        claimedAt: new Date(),
        claimExpiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    const dispatch = await executeOutboundSend(outboundId);
    expect(dispatch.ok).toBe(true);

    const sentRow = await prisma.outboundEmail.findUniqueOrThrow({
      where: { id: outboundId },
    });
    expect(sentRow.status).toBe("SENT");
    expect(sentRow.sentAt).not.toBeNull();
    expect(sentRow.providerMessageId).toBe("j5-captured-gmail-id");

    // Exactly one message reached the transport — not zero (silently dropped)
    // and not two (the duplicate-send defect).
    expect(sentMessages).toHaveLength(1);
    const wire = sentMessages[0];
    expect(wire).toContain(PROSPECT_EMAIL);
    // The greeting proves the template was really rendered, not sent raw.
    expect(wire).toContain("Ada");
    expect(wire).not.toContain("{{first_name}}");

    // ---- 4. REPLY ---------------------------------------------------------
    const reply = await ingestInboundForClient({
      clientId: CLIENT_ID,
      ingestionSource: "j5-journey-test",
      payload: {
        fromEmail: PROSPECT_EMAIL,
        toEmail: SENDER_EMAIL,
        subject: "Re: Hello Ada",
        bodyPreview: "Thanks — please take me off your list.",
        providerMessageId: "j5-inbound-1",
        receivedAt: new Date().toISOString(),
      },
    });
    expect(reply.skipped).toBeUndefined();
    expect(reply.id).not.toBeNull();

    const storedReply = await prisma.inboundReply.findUniqueOrThrow({
      where: { id: reply.id as string },
    });
    // The reply must land in THIS workspace and be attached to the prospect —
    // an unlinked reply is the failure this journey exists to catch.
    expect(storedReply.clientId).toBe(CLIENT_ID);
    expect(storedReply.contactId).toBe(CONTACT_ID);

    // ---- 5. OPT-OUT -------------------------------------------------------
    // Both opt-out rails must be present, and they are checked separately
    // because they fail independently: the header satisfies mail providers,
    // the in-body link is the one a human can actually click.
    expect(wire).toMatch(/^List-Unsubscribe:/m);
    expect(wire).toMatch(/^List-Unsubscribe-Post:\s*List-Unsubscribe=One-Click/m);

    // The token comes out of the BODY the transport was handed, so this fails
    // if the opt-out link never made it into the email the prospect received.
    const rawToken = unsubscribeTokenFromSentMessage(wire);
    expect(rawToken).not.toBeNull();

    // A recipient sees whichever MIME part their mail client renders, so the
    // opt-out has to be in BOTH — a plain-text footer and an HTML one.
    //
    // Measured while writing this test, and worth recording because it is the
    // opposite of this repository's usual defect: the opt-out is genuinely
    // REDUNDANT. It is written once at compose time
    // (`ensureUnsubscribeLinkInPlainTextBody`) and again at dispatch
    // (`buildMailboxGovernedEmailBodies`), and disabling EITHER source leaves
    // both parts still carrying a link. This assertion therefore documents a
    // real invariant, but it is not claimed to be the one that would catch a
    // single-rail regression — the assertions proven to go red are the reply
    // link and the suppression re-check below.
    expect(countUnsubscribeLinksInBody(wire)).toBeGreaterThanOrEqual(2);

    const optOut = await performUnsubscribe(rawToken as string);
    expect(optOut.status).toBe("unsubscribed");

    const suppressed = await prisma.suppressedEmail.findFirst({
      where: { clientId: CLIENT_ID, email: PROSPECT_EMAIL },
    });
    expect(suppressed).not.toBeNull();

    const contactAfter = await prisma.contact.findUniqueOrThrow({
      where: { id: CONTACT_ID },
    });
    expect(contactAfter.isSuppressed).toBe(true);

    // ---- 6. THE OPT-OUT IS HONOURED ---------------------------------------
    // The whole point of the journey. Re-planning the same step must now refuse
    // this prospect, and nothing further may reach the transport.
    await prisma.clientEmailSequenceEnrollment.updateMany({
      where: { clientId: CLIENT_ID, contactId: CONTACT_ID },
      data: { status: "PENDING" },
    });

    const replan = await planSequenceStepSends({
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      stepId: STEP_ID,
      staffUserId: STAFF_ID,
      // Bypass the 10-day re-contact timer, so the ONLY thing that can hold
      // this prospect back is the opt-out itself.
      bypassCooldown: true,
    });
    expect(replan.counts.ready).toBe(0);
    expect(replan.counts.suppressed).toBe(1);

    // Still exactly the one message from step 3.
    expect(sentMessages).toHaveLength(1);
  });
});
