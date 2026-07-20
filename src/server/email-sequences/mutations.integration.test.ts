import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import {
  SequenceMutationFailure,
  approveSequence,
  archiveSequence,
  createSequence,
  deleteOrArchiveSequence,
  markSequenceReadyForReview,
  returnSequenceToDraft,
  setSequenceSteps,
  updateSequenceMetadata,
} from "./mutations";

/**
 * Integration coverage for the sequence lifecycle. The rules worth protecting
 * here are cross-table invariants (sequence↔list and step↔template must share a
 * workspace) and the status state machine — neither is observable without a
 * real schema.
 */

const CLIENT_ID = "itest-seq-client";
const OTHER_CLIENT_ID = "itest-seq-other";
const LIST_ID = "itest-seq-list";
const OTHER_LIST_ID = "itest-seq-other-list";
const STAFF_ID = "itest-seq-staff";

/** Captures the typed failure detail, or fails the test if nothing was thrown. */
async function expectFailureCode(
  run: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(SequenceMutationFailure);
    expect((error as SequenceMutationFailure).detail.code).toBe(expected);
    return;
  }
  throw new Error(`Expected ${expected} but the call succeeded`);
}

async function seedWorkspaces(): Promise<void> {
  await prisma.client.createMany({
    data: [
      { id: CLIENT_ID, name: "Seq Workspace", slug: "seq-workspace", status: "ACTIVE" },
      { id: OTHER_CLIENT_ID, name: "Other", slug: "seq-other", status: "ACTIVE" },
    ],
  });
  await prisma.staffUser.create({
    data: {
      id: STAFF_ID,
      entraObjectId: "itest-seq-oid",
      email: "seq-staff@opensdoors.example",
      isActive: true,
    },
  });
  await prisma.contactList.createMany({
    data: [
      { id: LIST_ID, name: "Seq List", clientId: CLIENT_ID },
      { id: OTHER_LIST_ID, name: "Other List", clientId: OTHER_CLIENT_ID },
    ],
  });
}

async function makeTemplate(
  id: string,
  category: "INTRODUCTION" | "FOLLOW_UP_1",
  overrides: { clientId?: string; archived?: boolean } = {},
): Promise<string> {
  // Archiving sets BOTH the status enum and the timestamp — mirror
  // `archiveTemplate` exactly, since step validation keys off `status`.
  const archived = overrides.archived === true;
  await prisma.clientEmailTemplate.create({
    data: {
      id,
      clientId: overrides.clientId ?? CLIENT_ID,
      name: `Template ${id}`,
      category,
      subject: "Hello",
      content: "Body copy",
      ...(archived ? { status: "ARCHIVED" as const, archivedAt: new Date() } : {}),
    },
  });
  return id;
}

function newSequence(overrides: Partial<Parameters<typeof createSequence>[0]> = {}) {
  return createSequence({
    clientId: CLIENT_ID,
    staffUserId: STAFF_ID,
    name: "Spring Outreach",
    description: null,
    contactListId: LIST_ID,
    launchPreferredMailboxId: null,
    ...overrides,
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  await seedWorkspaces();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("createSequence", () => {
  it("creates a sequence in DRAFT", async () => {
    const sequence = await newSequence();

    expect(sequence.status).toBe("DRAFT");
    expect(sequence.clientId).toBe(CLIENT_ID);
    expect(sequence.contactListId).toBe(LIST_ID);

    const persisted = await prisma.clientEmailSequence.findUniqueOrThrow({
      where: { id: sequence.id },
    });
    expect(persisted.name).toBe("Spring Outreach");
  });

  it("rejects an empty name", async () => {
    await expectFailureCode(() => newSequence({ name: "   " }), "INVALID_INPUT");
    expect(await prisma.clientEmailSequence.count()).toBe(0);
  });

  it("refuses a contact list belonging to another workspace", async () => {
    // The invariant that stops one client's sequence targeting another's contacts.
    await expectFailureCode(
      () => newSequence({ contactListId: OTHER_LIST_ID }),
      "WRONG_LIST_CLIENT",
    );
    expect(await prisma.clientEmailSequence.count()).toBe(0);
  });

  it("refuses a contact list that does not exist", async () => {
    // A missing list is NOT_FOUND; a list owned by someone else is
    // WRONG_LIST_CLIENT. The two cases are reported distinctly.
    await expectFailureCode(
      () => newSequence({ contactListId: "missing-list" }),
      "NOT_FOUND",
    );
  });
});

describe("updateSequenceMetadata", () => {
  it("updates the name and description", async () => {
    const sequence = await newSequence();

    const updated = await updateSequenceMetadata({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      name: "Renamed",
      description: "New description",
      contactListId: LIST_ID,
      launchPreferredMailboxId: null,
    });

    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("New description");
  });

  it("reports NOT_FOUND for an unknown sequence", async () => {
    await expectFailureCode(
      () =>
        updateSequenceMetadata({
          sequenceId: "missing",
          clientId: CLIENT_ID,
          name: "X",
          description: null,
          contactListId: LIST_ID,
          launchPreferredMailboxId: null,
        }),
      "NOT_FOUND",
    );
  });

  it("refuses to update a sequence owned by another workspace", async () => {
    const sequence = await newSequence();

    await expectFailureCode(
      () =>
        updateSequenceMetadata({
          sequenceId: sequence.id,
          clientId: OTHER_CLIENT_ID,
          name: "Hijacked",
          description: null,
          contactListId: OTHER_LIST_ID,
          launchPreferredMailboxId: null,
        }),
      "WRONG_CLIENT",
    );

    const unchanged = await prisma.clientEmailSequence.findUniqueOrThrow({
      where: { id: sequence.id },
    });
    expect(unchanged.name).toBe("Spring Outreach");
  });
});

describe("setSequenceSteps", () => {
  it("persists ordered steps with their delays", async () => {
    const sequence = await newSequence();
    const intro = await makeTemplate("tpl-intro", "INTRODUCTION");
    const follow = await makeTemplate("tpl-follow", "FOLLOW_UP_1");

    await setSequenceSteps({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      steps: [
        { category: "INTRODUCTION", templateId: intro, delayDays: 0, delayHours: 0 },
        { category: "FOLLOW_UP_1", templateId: follow, delayDays: 3, delayHours: 2 },
      ],
      targetStatus: "DRAFT",
    });

    const steps = await prisma.clientEmailSequenceStep.findMany({
      where: { sequenceId: sequence.id },
      orderBy: { position: "asc" },
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]?.category).toBe("INTRODUCTION");
    expect(steps[1]?.delayDays).toBe(3);
    expect(steps[1]?.delayHours).toBe(2);
  });

  it("replaces the previous steps rather than appending", async () => {
    const sequence = await newSequence();
    const intro = await makeTemplate("tpl-intro", "INTRODUCTION");
    const follow = await makeTemplate("tpl-follow", "FOLLOW_UP_1");

    const base = { sequenceId: sequence.id, clientId: CLIENT_ID, targetStatus: "DRAFT" as const };
    await setSequenceSteps({
      ...base,
      steps: [
        { category: "INTRODUCTION", templateId: intro, delayDays: 0, delayHours: 0 },
        { category: "FOLLOW_UP_1", templateId: follow, delayDays: 3, delayHours: 0 },
      ],
    });
    await setSequenceSteps({
      ...base,
      steps: [
        { category: "INTRODUCTION", templateId: intro, delayDays: 1, delayHours: 0 },
      ],
    });

    const steps = await prisma.clientEmailSequenceStep.findMany({
      where: { sequenceId: sequence.id },
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.delayDays).toBe(1);
  });

  it("refuses a template owned by another workspace", async () => {
    const sequence = await newSequence();
    const foreign = await makeTemplate("tpl-foreign", "INTRODUCTION", {
      clientId: OTHER_CLIENT_ID,
    });

    // Surfaces as INVALID_STEPS: a template from another workspace is simply not
    // a usable step. What matters is that it is refused and nothing is written.
    await expectFailureCode(
      () =>
        setSequenceSteps({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          steps: [
            { category: "INTRODUCTION", templateId: foreign, delayDays: 0, delayHours: 0 },
          ],
          targetStatus: "DRAFT",
        }),
      "INVALID_STEPS",
    );
    expect(await prisma.clientEmailSequenceStep.count()).toBe(0);
  });

  it("refuses a template whose category does not match the step", async () => {
    const sequence = await newSequence();
    const follow = await makeTemplate("tpl-follow", "FOLLOW_UP_1");

    await expectFailureCode(
      () =>
        setSequenceSteps({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          steps: [
            { category: "INTRODUCTION", templateId: follow, delayDays: 0, delayHours: 0 },
          ],
          targetStatus: "DRAFT",
        }),
      "INVALID_STEPS",
    );
  });

  it("refuses an archived template", async () => {
    const sequence = await newSequence();
    const archived = await makeTemplate("tpl-archived", "INTRODUCTION", {
      archived: true,
    });

    await expectFailureCode(
      () =>
        setSequenceSteps({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          steps: [
            { category: "INTRODUCTION", templateId: archived, delayDays: 0, delayHours: 0 },
          ],
          targetStatus: "DRAFT",
        }),
      "INVALID_STEPS",
    );
  });

  it("requires an introduction step when targeting review", async () => {
    const sequence = await newSequence();
    const follow = await makeTemplate("tpl-follow", "FOLLOW_UP_1");

    await expectFailureCode(
      () =>
        setSequenceSteps({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          steps: [
            { category: "FOLLOW_UP_1", templateId: follow, delayDays: 1, delayHours: 0 },
          ],
          targetStatus: "READY_FOR_REVIEW",
        }),
      "INVALID_STEPS",
    );
  });
});

describe("status transitions", () => {
  /** A sequence with a valid introduction step, ready to move through the flow. */
  async function draftWithIntro() {
    const sequence = await newSequence();
    const intro = await makeTemplate("tpl-intro", "INTRODUCTION");
    await setSequenceSteps({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      steps: [
        { category: "INTRODUCTION", templateId: intro, delayDays: 0, delayHours: 0 },
      ],
      targetStatus: "DRAFT",
    });
    return sequence;
  }

  it("archives a draft sequence", async () => {
    const sequence = await draftWithIntro();

    const archived = await archiveSequence({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });

    expect(archived.status).toBe("ARCHIVED");
  });

  it("returns an archived sequence to draft", async () => {
    const sequence = await draftWithIntro();
    await archiveSequence({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });

    const restored = await returnSequenceToDraft({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });

    expect(restored.status).toBe("DRAFT");
  });

  it("refuses an illegal transition", async () => {
    // DRAFT -> DRAFT is not a legal move; the state machine must say so rather
    // than silently no-op.
    const sequence = await draftWithIntro();

    await expectFailureCode(
      () =>
        returnSequenceToDraft({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          staffUserId: STAFF_ID,
        }),
      "INVALID_STATUS_TRANSITION",
    );
  });

  it("blocks review when the contact list has nobody to send to", async () => {
    // The list exists but has no members — approval must not proceed.
    const sequence = await draftWithIntro();

    await expectFailureCode(
      () =>
        markSequenceReadyForReview({
          sequenceId: sequence.id,
          clientId: CLIENT_ID,
          staffUserId: STAFF_ID,
        }),
      "APPROVAL_BLOCKED",
    );
  });

  it("refuses to act on another workspace's sequence", async () => {
    const sequence = await draftWithIntro();

    await expectFailureCode(
      () =>
        archiveSequence({
          sequenceId: sequence.id,
          clientId: OTHER_CLIENT_ID,
          staffUserId: STAFF_ID,
        }),
      "WRONG_CLIENT",
    );
  });

  it("reports NOT_FOUND when the sequence does not exist", async () => {
    await expectFailureCode(
      () =>
        approveSequence({
          sequenceId: "missing",
          clientId: CLIENT_ID,
          staffUserId: STAFF_ID,
        }),
      "NOT_FOUND",
    );
  });
});

describe("deleteOrArchiveSequence", () => {
  it("hard-deletes a sequence that has never sent anything", async () => {
    const sequence = await newSequence();

    const result = await deleteOrArchiveSequence({
      sequenceId: sequence.id,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });

    expect(result.action).toBe("deleted");
    expect(result.sequenceName).toBe("Spring Outreach");
    expect(
      await prisma.clientEmailSequence.findUnique({ where: { id: sequence.id } }),
    ).toBeNull();
  });

  it("refuses to delete another workspace's sequence", async () => {
    const sequence = await newSequence();

    await expectFailureCode(
      () =>
        deleteOrArchiveSequence({
          sequenceId: sequence.id,
          clientId: OTHER_CLIENT_ID,
          staffUserId: STAFF_ID,
        }),
      "WRONG_CLIENT",
    );
    expect(
      await prisma.clientEmailSequence.findUnique({ where: { id: sequence.id } }),
    ).not.toBeNull();
  });
});
