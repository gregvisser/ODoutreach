import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 109 — "I click launch sequence and nothing happens... no email was
 * sent, no row was created, no error was shown." Measured against production:
 * zero new `OutboundEmail`/`ClientEmailSequenceStepSend` rows of ANY kind
 * (not even a BLOCKED one) after a real click, with structured logging off
 * (App Insights: zero telemetry ever ingested; App Service app/http logs:
 * off) so the click could not be traced server-side either. See
 * `docs/ops/2026-08-30-row109-launch-button-silence.md`.
 *
 * Reading `sendClientEmailSequenceIntroductionAction` /
 * `sendClientEmailSequenceStepAction` found a real, provable defect that
 * matches the symptom exactly: `requireClientAccess` and
 * `requireClientEmailSequenceMutator` ran BEFORE the action's try/catch, so
 * any failure there — a permission edge case, a transient DB hiccup — threw
 * UNCAUGHT. The request would have reached the server and done nothing the
 * operator could see: no flash, no queued row, no BLOCKED row. Every other
 * failure path inside `sendSequenceIntroductionBatch` / `sendSequenceStepBatch`
 * was already caught and turned into a redirect with a named reason — this
 * was the one gap.
 *
 * This drives the REAL exported server actions (not a re-implementation) and
 * proves the fix: a failure from either check now always redirects back with
 * a named reason, the same way every other failure in this file already does.
 */

const {
  staffMock,
  accessMock,
  mutatorMock,
  introBatchMock,
  stepBatchMock,
  redirectMock,
  outboundEmailFindManyMock,
} = vi.hoisted(() => ({
  staffMock: vi.fn(),
  accessMock: vi.fn(),
  mutatorMock: vi.fn(),
  introBatchMock: vi.fn(),
  stepBatchMock: vi.fn(),
  // Mirrors next/navigation's real behaviour closely enough for this test:
  // redirect() never returns — it throws a control-flow error the framework
  // converts into an actual redirect. The action's catch blocks specifically
  // re-throw anything whose message starts with "NEXT_" rather than treating
  // it as a normal failure, so the mock must shape its throw the same way.
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
  // Row 111 finding 1 — after dispatch, the action re-reads each newly
  // created OutboundEmail's real status to report what actually happened
  // rather than the fixed intake word "queued".
  outboundEmailFindManyMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { outboundEmail: { findMany: outboundEmailFindManyMock } },
}));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: staffMock }));
vi.mock("@/server/tenant/access", () => ({
  requireClientAccess: accessMock,
  canUseCooldownReengage: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/server/email-sequences/mutator-access", () => ({
  requireClientEmailSequenceMutator: mutatorMock,
}));
vi.mock("@/server/email-sequences/send-introduction", () => ({
  sendSequenceIntroductionBatch: introBatchMock,
  sendSequenceStepBatch: stepBatchMock,
  SequenceIntroSendError: class SequenceIntroSendError extends Error {},
  SequenceStepSendError: class SequenceStepSendError extends Error {},
}));
vi.mock("@/server/email-sequences/enrollments", () => ({
  enrollSequenceContacts: vi.fn(),
  EnrollmentFailure: class EnrollmentFailure extends Error {},
}));
vi.mock("@/server/email-sequences/step-sends", () => ({
  planSequenceStepSends: vi.fn(),
  SequenceStepSendPlanFailure: class SequenceStepSendPlanFailure extends Error {},
}));
vi.mock("@/server/email-sequences/auto-prepare-sequence-for-launch", () => ({
  autoPrepareSequenceForLaunch: vi.fn(),
}));
vi.mock("@/server/email-sequences/mutations", () => ({
  approveSequence: vi.fn(),
  archiveSequence: vi.fn(),
  createSequence: vi.fn(),
  deleteOrArchiveSequence: vi.fn(),
  markSequenceReadyForReview: vi.fn(),
  returnSequenceToDraft: vi.fn(),
  SequenceMutationFailure: class SequenceMutationFailure extends Error {},
  setSequenceSteps: vi.fn(),
  updateSequenceMetadata: vi.fn(),
}));

import {
  sendClientEmailSequenceIntroductionAction,
  sendClientEmailSequenceStepAction,
} from "./sequence-actions";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  staffMock.mockResolvedValue({ id: "staff_1", role: "ADMIN" });
  accessMock.mockResolvedValue(undefined);
  mutatorMock.mockResolvedValue(undefined);
  outboundEmailFindManyMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendClientEmailSequenceIntroductionAction — a failed access/mutator check always produces a visible outcome", () => {
  it("redirects with the named reason when requireClientAccess fails, instead of throwing uncaught", async () => {
    accessMock.mockRejectedValueOnce(new Error("FORBIDDEN_CLIENT"));

    await expect(
      sendClientEmailSequenceIntroductionAction(
        formData({
          clientId: "cl_1",
          sequenceId: "seq_1",
          confirmationPhrase: "SEND INTRODUCTION",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(redirectMock.mock.calls[0]?.[0] as string);
    expect(url).toContain("sequenceError=");
    expect(url).toContain("FORBIDDEN_CLIENT");
    // The batch must never run once access was refused.
    expect(introBatchMock).not.toHaveBeenCalled();
  });

  it("redirects with the named reason when requireClientEmailSequenceMutator fails", async () => {
    mutatorMock.mockRejectedValueOnce(
      new Error(
        "You do not have permission to manage email sequences for this client.",
      ),
    );

    await expect(
      sendClientEmailSequenceIntroductionAction(
        formData({
          clientId: "cl_1",
          sequenceId: "seq_1",
          confirmationPhrase: "SEND INTRODUCTION",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const url = (redirectMock.mock.calls[0]?.[0] as string).replace(/\+/g, " ");
    expect(decodeURIComponent(url)).toContain(
      "permission to manage email sequences",
    );
    expect(introBatchMock).not.toHaveBeenCalled();
  });

  it("still redirects to a success flash on the normal path (guard against a false-positive fix)", async () => {
    introBatchMock.mockResolvedValueOnce({
      counts: {
        queued: 1,
        blockedAllowlist: 0,
        blockedLaunchApproval: 0,
        suppressedAtExecutionTime: 0,
        blockedPlanClassifier: 0,
        blockedAlreadySent: 0,
      },
      queued: [
        {
          stepSendId: "ss_1",
          outboundEmailId: "oe_1",
          contactEmail: "a@b.com",
          allowlistedDomain: "b.com",
        },
      ],
      blocked: [],
    });
    // The worker has not resolved this row yet by the time we re-check.
    outboundEmailFindManyMock.mockResolvedValueOnce([{ status: "QUEUED" }]);

    await expect(
      sendClientEmailSequenceIntroductionAction(
        formData({
          clientId: "cl_1",
          sequenceId: "seq_1",
          confirmationPhrase: "SEND INTRODUCTION",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(introBatchMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(
      (redirectMock.mock.calls[0]?.[0] as string).replace(/\+/g, " "),
    );
    expect(url).toContain("sequence=1 introduction queued — sending shortly");
  });

  /**
   * Row 111 finding 1 — the exact confusion Greg hit: the banner said
   * "queued" while, in production, the send had very often already gone
   * out (`docs/ops/SEND-PROOF-2026-08-30.md` measured QUEUED → SENT in
   * ~1.2s via `triggerOutboundQueueDrain`, which the batch call awaits
   * before this action ever builds its flash message). Once dispatch has
   * actually completed by the time we re-check, the banner must say so.
   */
  it("says 'sent', not 'queued', once the dispatched row has actually gone out", async () => {
    introBatchMock.mockResolvedValueOnce({
      counts: {
        queued: 1,
        blockedAllowlist: 0,
        blockedLaunchApproval: 0,
        suppressedAtExecutionTime: 0,
        blockedPlanClassifier: 0,
        blockedAlreadySent: 0,
      },
      queued: [
        {
          stepSendId: "ss_1",
          outboundEmailId: "oe_1",
          contactEmail: "a@b.com",
          allowlistedDomain: "b.com",
        },
      ],
      blocked: [],
    });
    outboundEmailFindManyMock.mockResolvedValueOnce([{ status: "SENT" }]);

    await expect(
      sendClientEmailSequenceIntroductionAction(
        formData({
          clientId: "cl_1",
          sequenceId: "seq_1",
          confirmationPhrase: "SEND INTRODUCTION",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(outboundEmailFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["oe_1"] } },
      }),
    );
    const url = decodeURIComponent(
      (redirectMock.mock.calls[0]?.[0] as string).replace(/\+/g, " "),
    );
    expect(url).toContain("sequence=1 introduction sent");
    expect(url).not.toMatch(/queued/i);
  });
});

describe("sendClientEmailSequenceStepAction — same fix applied to the follow-up dispatch action", () => {
  it("redirects with the named reason when requireClientAccess fails, instead of throwing uncaught", async () => {
    accessMock.mockRejectedValueOnce(new Error("FORBIDDEN_CLIENT"));

    await expect(
      sendClientEmailSequenceStepAction(
        formData({
          clientId: "cl_1",
          sequenceId: "seq_1",
          category: "INTRODUCTION",
          confirmationPhrase: "SEND INTRODUCTION",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(redirectMock.mock.calls[0]?.[0] as string);
    expect(url).toContain("FORBIDDEN_CLIENT");
    expect(stepBatchMock).not.toHaveBeenCalled();
  });
});
