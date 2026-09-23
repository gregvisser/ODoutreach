import { beforeEach, describe, expect, it, vi } from "vitest";

const { staffMock, accessMock, mutatorMock, beginMock, redirectMock } = vi.hoisted(() => ({
  staffMock: vi.fn(),
  accessMock: vi.fn(),
  mutatorMock: vi.fn(),
  beginMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff: staffMock }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess: accessMock }));
vi.mock("@/server/email-templates/mutator-access", () => ({
  requireClientEmailTemplateMutator: mutatorMock,
}));
vi.mock("@/server/ai/sequence-draft-run", () => ({
  beginSequenceDraftRun: beginMock,
}));
vi.mock("@/server/ai/draft-sequence", () => ({
  draftSequenceForClient: vi.fn(),
}));

import { draftClientSequenceWithAiAction } from "./ai-sequence-actions";

beforeEach(() => {
  staffMock.mockReset().mockResolvedValue({ id: "staff-1", role: "ADMIN" });
  accessMock.mockReset().mockResolvedValue(undefined);
  mutatorMock.mockReset().mockResolvedValue(undefined);
  beginMock.mockReset().mockResolvedValue({ runId: "run-1", alreadyRunning: false });
  redirectMock.mockClear();
});

describe("draftClientSequenceWithAiAction", () => {
  it("redirects to the run immediately and does not draft inside the request", async () => {
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(beginMock).toHaveBeenCalledWith({ clientId: "client-1", staffUserId: "staff-1" });
    expect(redirectMock).toHaveBeenCalledWith(
      "/clients/client-1/templates?sequenceDraft=run-1#ai-sequence-draft",
    );
    const { draftSequenceForClient } = await import("@/server/ai/draft-sequence");
    expect(draftSequenceForClient).not.toHaveBeenCalled();
  });

  it("redirects with a start error when the run cannot be recorded", async () => {
    beginMock.mockRejectedValueOnce(new Error("database unavailable"));
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith(
      "/clients/client-1/templates?templateError=The+sequence+could+not+be+started.+Nothing+was+drafted+and+nothing+was+sent.#ai-sequence-draft",
    );
  });
});
