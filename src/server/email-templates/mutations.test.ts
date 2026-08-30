import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 130 — "the templates screen has no way to remove a template."
 * `deleteEmailTemplate` is the new mutation; these tests drive the REAL
 * exported function (not a re-implementation) against a mocked Prisma
 * client, proving both halves of the delete boundary read off the schema's
 * own `onDelete: Restrict` relations on `ClientEmailSequenceStep.template`
 * and `ClientEmailSequenceStepSend.template`:
 *   - a template with zero sequence steps and zero step-sends can be deleted
 *   - a template referenced by either is refused with a readable reason,
 *     never a silent failure or a raw Prisma foreign-key error
 */

const { findUniqueMock, deleteMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    clientEmailTemplate: {
      findUnique: findUniqueMock,
      delete: deleteMock,
    },
  },
}));

const { deleteEmailTemplate, TemplateMutationError } = await import(
  "./mutations"
);

const CLIENT_ID = "client_1";
const TEMPLATE_ID = "tmpl_1";
const STAFF_ID = "staff_1";

beforeEach(() => {
  findUniqueMock.mockReset();
  deleteMock.mockReset();
});

describe("deleteEmailTemplate", () => {
  it("deletes a template that has never been used in any sequence and has no send history", async () => {
    findUniqueMock.mockResolvedValue({
      id: TEMPLATE_ID,
      clientId: CLIENT_ID,
      name: "Never-used draft",
      _count: { sequenceSteps: 0, sequenceStepSends: 0 },
    });
    deleteMock.mockResolvedValue({ id: TEMPLATE_ID });

    const result = await deleteEmailTemplate({
      templateId: TEMPLATE_ID,
      clientId: CLIENT_ID,
      staffUserId: STAFF_ID,
    });

    expect(result).toEqual({ id: TEMPLATE_ID, name: "Never-used draft" });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
  });

  it("refuses to delete a template used in a sequence step, with a readable reason, and never calls delete", async () => {
    findUniqueMock.mockResolvedValue({
      id: TEMPLATE_ID,
      clientId: CLIENT_ID,
      name: "Live introduction",
      _count: { sequenceSteps: 1, sequenceStepSends: 0 },
    });

    await expect(
      deleteEmailTemplate({
        templateId: TEMPLATE_ID,
        clientId: CLIENT_ID,
        staffUserId: STAFF_ID,
      }),
    ).rejects.toMatchObject({
      name: "TemplateMutationError",
      detail: { code: "IN_USE" },
    });
    expect(deleteMock).not.toHaveBeenCalled();

    try {
      await deleteEmailTemplate({
        templateId: TEMPLATE_ID,
        clientId: CLIENT_ID,
        staffUserId: STAFF_ID,
      });
      throw new Error("expected deleteEmailTemplate to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateMutationError);
      expect((e as Error).message).toContain("sequence step");
      expect((e as Error).message).toContain("archived");
    }
  });

  it("refuses to delete a template with real send history even when no reason to expect a live step", async () => {
    findUniqueMock.mockResolvedValue({
      id: TEMPLATE_ID,
      clientId: CLIENT_ID,
      name: "Sent once",
      _count: { sequenceSteps: 0, sequenceStepSends: 1 },
    });

    await expect(
      deleteEmailTemplate({
        templateId: TEMPLATE_ID,
        clientId: CLIENT_ID,
        staffUserId: STAFF_ID,
      }),
    ).rejects.toThrow(/real email/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("refuses cross-tenant delete before ever checking usage", async () => {
    findUniqueMock.mockResolvedValue({
      id: TEMPLATE_ID,
      clientId: "some_other_client",
      name: "Not yours",
      _count: { sequenceSteps: 0, sequenceStepSends: 0 },
    });

    await expect(
      deleteEmailTemplate({
        templateId: TEMPLATE_ID,
        clientId: CLIENT_ID,
        staffUserId: STAFF_ID,
      }),
    ).rejects.toMatchObject({ detail: { code: "WRONG_CLIENT" } });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("reports NOT_FOUND rather than deleting when the template does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      deleteEmailTemplate({
        templateId: "missing",
        clientId: CLIENT_ID,
        staffUserId: STAFF_ID,
      }),
    ).rejects.toMatchObject({ detail: { code: "NOT_FOUND" } });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
