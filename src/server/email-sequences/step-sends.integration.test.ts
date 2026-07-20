import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import {
  SequenceStepSendPlanFailure,
  loadClientSequencePrepSnapshots,
  loadSequenceStepSendOverview,
  planSequenceStepSends,
} from "./step-sends";

/**
 * Integration coverage for the sequence step-send PLANNER.
 *
 * SAFETY: this module is a planner, not a dispatcher — verified before these
 * tests were written. It contains no `outboundEmail` writes, no mailbox
 * reservation, and no Graph/Gmail/ESP call; its only writes are to
 * `ClientEmailSequenceStepSend`. Planning therefore cannot send mail. The two
 * invariants that keep it that way — never persisting SENT/FAILED, and never
 * creating an OutboundEmail — are asserted explicitly below rather than assumed
 * from the docblock.
 */

const CLIENT_ID = "itest-ss-client";
const OTHER_CLIENT_ID = "itest-ss-other";
const LIST_ID = "itest-ss-list";
const SEQUENCE_ID = "itest-ss-seq";
const STEP_ID = "itest-ss-step";
const TEMPLATE_ID = "itest-ss-tpl";
const STAFF_ID = "itest-ss-staff";

async function expectPlanFailure(
  run: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(SequenceStepSendPlanFailure);
    expect((error as SequenceStepSendPlanFailure).code).toBe(expected);
    return;
  }
  throw new Error(`Expected ${expected} but the call succeeded`);
}

/** Client + list + sequence + step + template, with no enrollments yet. */
async function seedSequence(): Promise<void> {
  await prisma.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        name: "Step Send Workspace",
        slug: "step-send-workspace",
        status: "ACTIVE",
        defaultSenderEmail: "sender@opensdoors.example",
      },
      { id: OTHER_CLIENT_ID, name: "Other", slug: "ss-other", status: "ACTIVE" },
    ],
  });
  await prisma.staffUser.create({
    data: {
      id: STAFF_ID,
      entraObjectId: "itest-ss-oid",
      email: "ss-staff@opensdoors.example",
      isActive: true,
    },
  });
  await prisma.contactList.create({
    data: { id: LIST_ID, name: "Step Send List", clientId: CLIENT_ID },
  });
  await prisma.clientEmailTemplate.create({
    data: {
      id: TEMPLATE_ID,
      clientId: CLIENT_ID,
      name: "Intro",
      category: "INTRODUCTION",
      subject: "Hello {{first_name}}",
      content: "Hi {{first_name}}, a quick note from {{sender_company_name}}.",
      status: "APPROVED",
    },
  });
  await prisma.clientEmailSequence.create({
    data: {
      id: SEQUENCE_ID,
      clientId: CLIENT_ID,
      name: "Spring",
      contactListId: LIST_ID,
      status: "APPROVED",
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
}

/** Adds a contact plus a PENDING enrollment on the sequence. */
async function enrollContact(
  suffix: string,
  overrides: {
    email?: string | null;
    isSuppressed?: boolean;
    status?: "PENDING" | "PAUSED" | "COMPLETED" | "EXCLUDED";
  } = {},
): Promise<{ contactId: string; enrollmentId: string }> {
  const contactId = `itest-ss-contact-${suffix}`;
  const enrollmentId = `itest-ss-enroll-${suffix}`;
  await prisma.contact.create({
    data: {
      id: contactId,
      clientId: CLIENT_ID,
      email: overrides.email === undefined ? `c${suffix}@example.test` : overrides.email,
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Analytical Engines",
      isSuppressed: overrides.isSuppressed ?? false,
    },
  });
  await prisma.clientEmailSequenceEnrollment.create({
    data: {
      id: enrollmentId,
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      contactId,
      contactListId: LIST_ID,
      status: overrides.status ?? "PENDING",
    },
  });
  return { contactId, enrollmentId };
}

function plan(overrides: Partial<Parameters<typeof planSequenceStepSends>[0]> = {}) {
  return planSequenceStepSends({
    clientId: CLIENT_ID,
    sequenceId: SEQUENCE_ID,
    stepId: STEP_ID,
    staffUserId: STAFF_ID,
    ...overrides,
  });
}

/** A send to `email` that completed `daysAgo` days ago, outside any sequence. */
async function recordPastSend(
  id: string,
  email: string,
  daysAgo: number,
  status: "SENT" | "BOUNCED" = "SENT",
): Promise<void> {
  const sentAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await prisma.outboundEmail.create({
    data: {
      id,
      clientId: CLIENT_ID,
      toEmail: email,
      status,
      sentAt,
      queuedAt: sentAt,
    },
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  await seedSequence();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("planSequenceStepSends — guards", () => {
  it("reports SEQUENCE_NOT_FOUND for an unknown sequence", async () => {
    await enrollContact("a");
    await expectPlanFailure(() => plan({ sequenceId: "missing" }), "SEQUENCE_NOT_FOUND");
  });

  it("reports WRONG_CLIENT when the sequence belongs to another workspace", async () => {
    await enrollContact("a");
    await expectPlanFailure(
      () => plan({ clientId: OTHER_CLIENT_ID }),
      "WRONG_CLIENT",
    );
  });

  it("reports STEP_NOT_FOUND for a step outside this sequence", async () => {
    await enrollContact("a");
    await expectPlanFailure(() => plan({ stepId: "missing-step" }), "STEP_NOT_FOUND");
  });

  it("reports NO_ENROLLMENTS when nobody is enrolled", async () => {
    await expectPlanFailure(() => plan(), "NO_ENROLLMENTS");
    expect(await prisma.clientEmailSequenceStepSend.count()).toBe(0);
  });
});

describe("planSequenceStepSends — planning", () => {
  it("persists one plan row per enrollment and returns previews", async () => {
    await enrollContact("a");
    await enrollContact("b");

    const result = await plan();

    expect(result.counts.total).toBe(2);
    expect(result.previews).toHaveLength(2);
    expect(result.sequenceId).toBe(SEQUENCE_ID);
    expect(result.stepCategory).toBe("INTRODUCTION");

    const rows = await prisma.clientEmailSequenceStepSend.findMany({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.clientId === CLIENT_ID)).toBe(true);
    expect(rows.every((r) => r.createdByStaffUserId === STAFF_ID)).toBe(true);
  });

  it("renders the template into the stored preview", async () => {
    await enrollContact("a");

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.subjectPreview).toContain("Ada");
    expect(row.bodyPreview).toContain("Ada");
    // The placeholder is resolved at plan time, not left raw.
    expect(row.bodyPreview ?? "").not.toContain("{{first_name}}");
  });

  it("marks a suppressed contact as SUPPRESSED rather than READY", async () => {
    await enrollContact("a", { isSuppressed: true });

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).toBe("SUPPRESSED");
  });

  it("does not mark a contact without an email as READY", async () => {
    await enrollContact("a", { email: null });

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).not.toBe("READY");
  });
});

describe("planSequenceStepSends — safety invariants", () => {
  it("never creates an OutboundEmail", async () => {
    // The defining property of the planner: planning is not sending.
    await enrollContact("a");
    await enrollContact("b");

    await plan();

    expect(await prisma.outboundEmail.count()).toBe(0);
  });

  it("never reserves mailbox send capacity", async () => {
    await enrollContact("a");

    await plan();

    expect(await prisma.mailboxSendReservation.count()).toBe(0);
  });

  it("never persists a SENT or FAILED status", async () => {
    await enrollContact("a");
    await enrollContact("b", { isSuppressed: true });

    await plan();

    const rows = await prisma.clientEmailSequenceStepSend.findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(["SENT", "FAILED"]).not.toContain(row.status);
    }
  });

  it("does not advance the enrollment's step position", async () => {
    const { enrollmentId } = await enrollContact("a");

    await plan();

    const enrollment = await prisma.clientEmailSequenceEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(enrollment.currentStepPosition).toBe(0);
  });
});

describe("planSequenceStepSends — idempotency", () => {
  it("updates the existing plan row instead of duplicating on re-plan", async () => {
    await enrollContact("a");

    await plan();
    await plan();

    const rows = await prisma.clientEmailSequenceStepSend.findMany({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(rows).toHaveLength(1);
  });

  it("refuses to rewrite a row the dispatcher already advanced to SENT", async () => {
    // Protects real send history from being clobbered by a later re-plan.
    await enrollContact("a");
    await plan();

    const planned = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    await prisma.clientEmailSequenceStepSend.update({
      where: { id: planned.id },
      data: { status: "SENT", blockedReason: null },
    });

    await plan();

    const after = await prisma.clientEmailSequenceStepSend.findUniqueOrThrow({
      where: { id: planned.id },
    });
    expect(after.status).toBe("SENT");
  });

  it("refuses to rewrite a FAILED row too", async () => {
    await enrollContact("a");
    await plan();

    const planned = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    await prisma.clientEmailSequenceStepSend.update({
      where: { id: planned.id },
      data: { status: "FAILED" },
    });

    await plan();

    const after = await prisma.clientEmailSequenceStepSend.findUniqueOrThrow({
      where: { id: planned.id },
    });
    expect(after.status).toBe("FAILED");
  });
});

describe("planSequenceStepSends — outreach cooldown", () => {
  it("does not mark a recently contacted address as READY", async () => {
    await enrollContact("a", { email: "recent@example.test" });
    await recordPastSend("ob-recent", "recent@example.test", 1);

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).not.toBe("READY");
  });

  it("allows an address whose last contact is outside the cooldown window", async () => {
    await enrollContact("a", { email: "old@example.test" });
    await recordPastSend("ob-old", "old@example.test", 90);

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).toBe("READY");
  });

  it("matches the cooldown address case-insensitively", async () => {
    await enrollContact("a", { email: "Mixed@Example.test" });
    await recordPastSend("ob-mixed", "mixed@example.test", 1);

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).not.toBe("READY");
  });

  it("bypasses the cooldown timer when explicitly permitted", async () => {
    // F3 — re-engage. Bypasses ONLY the timer; other guards still apply.
    await enrollContact("a", { email: "recent@example.test" });
    await recordPastSend("ob-recent", "recent@example.test", 1);

    await plan({ bypassCooldown: true });

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).toBe("READY");
  });

  it("still suppresses a suppressed contact even when the cooldown is bypassed", async () => {
    await enrollContact("a", { email: "recent@example.test", isSuppressed: true });
    await recordPastSend("ob-recent", "recent@example.test", 1);

    await plan({ bypassCooldown: true });

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).toBe("SUPPRESSED");
  });

  it("ignores a send belonging to this same sequence", async () => {
    // A step-1 send must not block the step-2 follow-up to the same person.
    await enrollContact("a", { email: "inseq@example.test" });
    await plan();

    const planned = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    const sentAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const outbound = await prisma.outboundEmail.create({
      data: {
        id: "ob-inseq",
        clientId: CLIENT_ID,
        toEmail: "inseq@example.test",
        status: "SENT",
        sentAt,
        queuedAt: sentAt,
      },
    });
    await prisma.clientEmailSequenceStepSend.update({
      where: { id: planned.id },
      data: { outboundEmailId: outbound.id },
    });

    await plan();

    const after = await prisma.clientEmailSequenceStepSend.findUniqueOrThrow({
      where: { id: planned.id },
    });
    expect(after.status).toBe("READY");
  });

  it("ignores a send with no sentAt when applying the cooldown", async () => {
    await enrollContact("a", { email: "queued@example.test" });
    await prisma.outboundEmail.create({
      data: {
        id: "ob-queued",
        clientId: CLIENT_ID,
        toEmail: "queued@example.test",
        status: "QUEUED",
        sentAt: null,
      },
    });

    await plan();

    const row = await prisma.clientEmailSequenceStepSend.findFirstOrThrow({
      where: { sequenceId: SEQUENCE_ID },
    });
    expect(row.status).toBe("READY");
  });
});

describe("loadSequenceStepSendOverview", () => {
  it("returns null for a step that is not part of the sequence", async () => {
    expect(
      await loadSequenceStepSendOverview({
        clientId: CLIENT_ID,
        sequenceId: SEQUENCE_ID,
        stepId: "missing-step",
      }),
    ).toBeNull();
  });

  it("reports zero counts before anything has been planned", async () => {
    const overview = await loadSequenceStepSendOverview({
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      stepId: STEP_ID,
    });

    expect(overview?.counts.total).toBe(0);
    expect(overview?.previews).toEqual([]);
    expect(overview?.latestPreparedAtIso).toBeNull();
  });

  it("summarises the rows written by a plan", async () => {
    await enrollContact("a");
    await enrollContact("b", { isSuppressed: true });
    await plan();

    const overview = await loadSequenceStepSendOverview({
      clientId: CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      stepId: STEP_ID,
    });

    expect(overview?.category).toBe("INTRODUCTION");
    expect(overview?.counts.total).toBe(2);
    expect(overview?.previews).toHaveLength(2);
    expect(overview?.latestPreparedAtIso).not.toBeNull();
    expect(overview?.latestSubjectPreview).toContain("Ada");
  });

  it("does not expose another workspace's plan rows", async () => {
    await enrollContact("a");
    await plan();

    const overview = await loadSequenceStepSendOverview({
      clientId: OTHER_CLIENT_ID,
      sequenceId: SEQUENCE_ID,
      stepId: STEP_ID,
    });

    expect(overview?.counts.total).toBe(0);
  });
});

describe("loadClientSequencePrepSnapshots", () => {
  it("returns an empty list for a workspace with no sequences", async () => {
    expect(await loadClientSequencePrepSnapshots(OTHER_CLIENT_ID)).toEqual([]);
  });

  it("reports the introduction step and enrollment count", async () => {
    await enrollContact("a");
    await enrollContact("b");

    const snapshots = await loadClientSequencePrepSnapshots(CLIENT_ID);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.sequenceId).toBe(SEQUENCE_ID);
    expect(snapshots[0]?.sequenceName).toBe("Spring");
    expect(snapshots[0]?.introductionStepId).toBe(STEP_ID);
    expect(snapshots[0]?.introductionTemplateId).toBe(TEMPLATE_ID);
    expect(snapshots[0]?.enrollmentCount).toBe(2);
  });

  it("reflects planned counts once a plan has run", async () => {
    await enrollContact("a");
    await plan();

    const snapshots = await loadClientSequencePrepSnapshots(CLIENT_ID);

    expect(snapshots[0]?.counts.total).toBe(1);
    expect(snapshots[0]?.latestPreparedAtIso).not.toBeNull();
  });

  it("scopes snapshots to the requested workspace", async () => {
    await enrollContact("a");

    expect(await loadClientSequencePrepSnapshots(OTHER_CLIENT_ID)).toEqual([]);
    expect(await loadClientSequencePrepSnapshots(CLIENT_ID)).toHaveLength(1);
  });
});
