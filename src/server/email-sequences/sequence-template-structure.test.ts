import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Queue item 133, finding 2 — "a person cannot make out which intro goes
 * with which follow-up." Drives the REAL `loadClientSequenceTemplateStructures`
 * against a mocked Prisma client and proves it returns each sequence's
 * templates in send order, so the Templates screen can show the pairing the
 * category-grouped list hides.
 */

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    clientEmailSequence: {
      findMany: findManyMock,
    },
  },
}));

const { loadClientSequenceTemplateStructures } = await import("./queries");

const CLIENT_ID = "client_1";

beforeEach(() => {
  findManyMock.mockReset();
});

describe("loadClientSequenceTemplateStructures", () => {
  it("returns an empty list without querying when clientId is blank", async () => {
    const result = await loadClientSequenceTemplateStructures("");
    expect(result).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns each sequence's steps in send order, naming the template at each step", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "seq_1",
        name: "Roofing outreach",
        status: "ACTIVE",
        steps: [
          {
            id: "step_intro",
            category: "INTRODUCTION",
            position: 0,
            template: { id: "tmpl_intro", name: "Roofing intro", status: "APPROVED" },
          },
          {
            id: "step_f1",
            category: "FOLLOW_UP_1",
            position: 1,
            template: { id: "tmpl_f1", name: "Roofing follow-up 1", status: "APPROVED" },
          },
        ],
      },
    ]);

    const result = await loadClientSequenceTemplateStructures(CLIENT_ID);

    expect(result).toEqual([
      {
        sequenceId: "seq_1",
        sequenceName: "Roofing outreach",
        sequenceStatus: "ACTIVE",
        steps: [
          {
            id: "step_intro",
            category: "INTRODUCTION",
            position: 0,
            templateId: "tmpl_intro",
            templateName: "Roofing intro",
            templateStatus: "APPROVED",
          },
          {
            id: "step_f1",
            category: "FOLLOW_UP_1",
            position: 1,
            templateId: "tmpl_f1",
            templateName: "Roofing follow-up 1",
            templateStatus: "APPROVED",
          },
        ],
      },
    ]);
  });

  it("keeps two sequences' templates separate — the exact confusion this row fixes", async () => {
    // Two sequences can each have their own INTRODUCTION template; the
    // category-grouped Templates list mixes both into one "Introduction
    // email" bucket. This query must keep them attached to their own
    // sequence so the pairing is visible.
    findManyMock.mockResolvedValue([
      {
        id: "seq_a",
        name: "Sequence A",
        status: "ACTIVE",
        steps: [
          {
            id: "step_a_intro",
            category: "INTRODUCTION",
            position: 0,
            template: { id: "tmpl_a_intro", name: "A intro", status: "APPROVED" },
          },
        ],
      },
      {
        id: "seq_b",
        name: "Sequence B",
        status: "DRAFT",
        steps: [
          {
            id: "step_b_intro",
            category: "INTRODUCTION",
            position: 0,
            template: { id: "tmpl_b_intro", name: "B intro", status: "DRAFT" },
          },
        ],
      },
    ]);

    const result = await loadClientSequenceTemplateStructures(CLIENT_ID);

    expect(result).toHaveLength(2);
    expect(result[0].steps.map((s) => s.templateId)).toEqual(["tmpl_a_intro"]);
    expect(result[1].steps.map((s) => s.templateId)).toEqual(["tmpl_b_intro"]);
  });

  it("returns a sequence with no steps as an empty step list, not an error", async () => {
    findManyMock.mockResolvedValue([
      { id: "seq_empty", name: "Empty sequence", status: "DRAFT", steps: [] },
    ]);

    const result = await loadClientSequenceTemplateStructures(CLIENT_ID);

    expect(result).toEqual([
      {
        sequenceId: "seq_empty",
        sequenceName: "Empty sequence",
        sequenceStatus: "DRAFT",
        steps: [],
      },
    ]);
  });
});
