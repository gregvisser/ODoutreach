import { beforeEach, describe, expect, it, vi } from "vitest";

const { staffMock, accessMock, mutatorMock, preflightMock, scheduleMock, redirectMock } =
  vi.hoisted(() => ({
    staffMock: vi.fn(),
    accessMock: vi.fn(),
    mutatorMock: vi.fn(),
    preflightMock: vi.fn(),
    scheduleMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      const error = new Error("NEXT_REDIRECT");
      (error as Error & { digest: string }).digest = `NEXT_REDIRECT;push;${url};307;`;
      throw error;
    }),
  }));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: staffMock }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: accessMock }));
vi.mock("@/server/email-sequences/mutator-access", () => ({
  requireClientEmailSequenceMutator: mutatorMock,
}));
vi.mock("@/server/ai/review-campaign", () => ({
  preflightCampaignReview: preflightMock,
  scheduleCampaignReview: scheduleMock,
  reviewCampaign: vi.fn(),
}));

import { reviewClientCampaignWithAiAction } from "./ai-campaign-review-actions";

beforeEach(() => {
  staffMock.mockReset().mockResolvedValue({ id: "staff-1", role: "ADMIN" });
  accessMock.mockReset().mockResolvedValue(undefined);
  mutatorMock.mockReset().mockResolvedValue(undefined);
  preflightMock.mockReset().mockResolvedValue({ ok: true });
  scheduleMock.mockReset();
  redirectMock.mockClear();
});

describe("reviewClientCampaignWithAiAction", () => {
  it("schedules the review and redirects without waiting for the model", async () => {
    const formData = new FormData();
    formData.set("clientId", "client-1");
    formData.set("sequenceId", "seq-1");

    await expect(reviewClientCampaignWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(scheduleMock).toHaveBeenCalledWith({
      clientId: "client-1",
      sequenceId: "seq-1",
      staffUserId: "staff-1",
    });
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("campaignReviewPending=seq-1");
    expect(url).toContain("campaignReviewSince=");
    expect(url).toContain("#ai-campaign-review");
    const { reviewCampaign } = await import("@/server/ai/review-campaign");
    expect(reviewCampaign).not.toHaveBeenCalled();
  });

  it("redirects a campaign with no steps and does not schedule a call", async () => {
    preflightMock.mockResolvedValue({ ok: false, reason: "no_steps" });
    const formData = new FormData();
    formData.set("clientId", "client-1");
    formData.set("sequenceId", "seq-1");

    await expect(reviewClientCampaignWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(scheduleMock).not.toHaveBeenCalled();
    const url = redirectMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("campaignReviewError=");
    expect(url).toContain("nothing+to+review");
  });
});
