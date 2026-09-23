import { beforeEach, describe, expect, it, vi } from "vitest";

const { staffMock, accessMock, mutatorMock, beginMock, redirectMock, reportErrorMock } =
  vi.hoisted(() => ({
    staffMock: vi.fn(),
    accessMock: vi.fn(),
    mutatorMock: vi.fn(),
    beginMock: vi.fn(),
    reportErrorMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      const error = new Error("NEXT_REDIRECT");
      (error as Error & { digest: string }).digest = `NEXT_REDIRECT;push;${url};307;`;
      throw error;
    }),
  }));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  unstable_rethrow: (error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  reportError: reportErrorMock,
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

import { SEQUENCE_DRAFT_START_FAILED_MESSAGE } from "@/lib/ai/sequence-draft-start";

import { draftClientSequenceWithAiAction } from "./ai-sequence-actions";

const startFailedParams = new URLSearchParams();
startFailedParams.set("templateError", SEQUENCE_DRAFT_START_FAILED_MESSAGE);
const START_FAILED_URL = `/clients/client-1/templates?${startFailedParams.toString()}#ai-sequence-draft`;

beforeEach(() => {
  staffMock.mockReset().mockResolvedValue({ id: "staff-1", role: "ADMIN" });
  accessMock.mockReset().mockResolvedValue(undefined);
  mutatorMock.mockReset().mockResolvedValue(undefined);
  beginMock.mockReset().mockResolvedValue({ runId: "run-1", alreadyRunning: false });
  redirectMock.mockClear();
  reportErrorMock.mockClear();
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
    expect(reportErrorMock).not.toHaveBeenCalled();
    const { draftSequenceForClient } = await import("@/server/ai/draft-sequence");
    expect(draftSequenceForClient).not.toHaveBeenCalled();
  });

  it("redirects with a start error when the run cannot be recorded", async () => {
    beginMock.mockRejectedValueOnce(new Error("database unavailable"));
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith(START_FAILED_URL);
    expect(reportErrorMock).toHaveBeenCalledOnce();
    const { draftSequenceForClient } = await import("@/server/ai/draft-sequence");
    expect(draftSequenceForClient).not.toHaveBeenCalled();
  });

  it("turns an access throw into the banner instead of an uncaught error", async () => {
    accessMock.mockRejectedValueOnce(new Error("FORBIDDEN_CLIENT"));
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(beginMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(START_FAILED_URL);
    expect(START_FAILED_URL).not.toContain("FORBIDDEN_CLIENT");
  });

  it("turns a staff throw into the banner when the client id is known", async () => {
    staffMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(accessMock).not.toHaveBeenCalled();
    expect(beginMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(START_FAILED_URL);
  });

  it("turns a mutator throw into the banner and does not start a run", async () => {
    mutatorMock.mockRejectedValueOnce(
      new Error("You do not have permission to manage email templates for this client."),
    );
    const formData = new FormData();
    formData.set("clientId", "client-1");

    await expect(draftClientSequenceWithAiAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(beginMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(START_FAILED_URL);
    expect(START_FAILED_URL).not.toContain("permission");
  });

  it("returns without throwing when the client id cannot be redirected to", async () => {
    const formData = new FormData();
    formData.set("clientId", "../other");

    await expect(draftClientSequenceWithAiAction(formData)).resolves.toBeUndefined();

    expect(beginMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it("does not throw when staff rejects and there is no client page to return to", async () => {
    staffMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const formData = new FormData();

    await expect(draftClientSequenceWithAiAction(formData)).resolves.toBeUndefined();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });
});
