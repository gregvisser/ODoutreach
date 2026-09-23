import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, draftMock, revalidatePathMock } = vi.hoisted(() => ({
  prismaMock: {
    aiSequenceDraftRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  draftMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void task() }));
vi.mock("./draft-sequence", () => ({ draftSequenceForClient: draftMock }));

import { logger } from "@/lib/logger";

import { AI_CALL_TIMEOUT_MS, AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS } from "./anthropic-messages";
import { SEQUENCE_DRAFT_INTERRUPTED_MESSAGE } from "./sequence-draft-messages";
import {
  beginSequenceDraftRun,
  executeSequenceDraftRun,
  expireStaleSequenceDraftRuns,
  isSequenceDraftRunStale,
  readSequenceDraftRun,
  sequenceDraftRunDeadlineMs,
} from "./sequence-draft-run";

const NOW = new Date("2026-09-23T16:00:00.000Z");

beforeEach(() => {
  prismaMock.aiSequenceDraftRun.create.mockReset();
  prismaMock.aiSequenceDraftRun.findFirst.mockReset();
  prismaMock.aiSequenceDraftRun.findUnique.mockReset();
  prismaMock.aiSequenceDraftRun.updateMany.mockReset().mockResolvedValue({ count: 1 });
  draftMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("sequence draft run deadline", () => {
  it("keeps reply classification on the short timeout", () => {
    expect(AI_CALL_TIMEOUT_MS).toBe(20_000);
    expect(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS).toBe(180_000);
    expect(sequenceDraftRunDeadlineMs()).toBe(210_000);
  });

  it("treats an open run as stale only after the model timeout plus grace", () => {
    const deadline = sequenceDraftRunDeadlineMs();
    const createdAt = new Date(NOW.getTime() - (deadline - 1_000));
    expect(
      isSequenceDraftRunStale(
        { status: "RUNNING", startedAt: createdAt, createdAt },
        NOW,
      ),
    ).toBe(false);
    expect(
      isSequenceDraftRunStale(
        {
          status: "RUNNING",
          startedAt: new Date(NOW.getTime() - (deadline + 1)),
          createdAt,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSequenceDraftRunStale(
        { status: "SUCCEEDED", startedAt: new Date(0), createdAt: new Date(0) },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("beginSequenceDraftRun", () => {
  it("records a queued run and schedules one background call", async () => {
    prismaMock.aiSequenceDraftRun.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.aiSequenceDraftRun.create.mockResolvedValueOnce({ id: "run-1" });
    const schedule = vi.fn();

    const started = await beginSequenceDraftRun({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
      schedule,
    });

    expect(started).toEqual({ runId: "run-1", alreadyRunning: false });
    expect(prismaMock.aiSequenceDraftRun.create).toHaveBeenCalledWith({
      data: {
        clientId: "client-1",
        requestedByStaffUserId: "staff-1",
        status: "QUEUED",
        activeClientId: "client-1",
      },
      select: { id: true },
    });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith("run-1");
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("joins the in-flight run instead of starting a second model call", async () => {
    prismaMock.aiSequenceDraftRun.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.aiSequenceDraftRun.create.mockRejectedValueOnce({ code: "P2002" });
    prismaMock.aiSequenceDraftRun.findFirst.mockResolvedValueOnce({ id: "run-existing" });
    const schedule = vi.fn();

    const started = await beginSequenceDraftRun({
      clientId: "client-1",
      staffUserId: "staff-1",
      now: NOW,
      schedule,
    });

    expect(started).toEqual({ runId: "run-existing", alreadyRunning: true });
    expect(schedule).not.toHaveBeenCalled();
    expect(draftMock).not.toHaveBeenCalled();
  });
});

describe("executeSequenceDraftRun", () => {
  it("calls the drafter once and stores the success sentence", async () => {
    prismaMock.aiSequenceDraftRun.findUnique.mockResolvedValueOnce({
      id: "run-1",
      clientId: "client-1",
      requestedByStaffUserId: "staff-1",
      status: "QUEUED",
    });
    draftMock.mockResolvedValueOnce({
      ok: true,
      templateIds: ["tpl-1", "tpl-2"],
      steps: [{ absoluteDay: 1 }, { absoluteDay: 4 }],
      unknownPlaceholders: [],
      costMicroUsd: 12,
    });

    await executeSequenceDraftRun("run-1");

    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(draftMock).toHaveBeenCalledWith({
      clientId: "client-1",
      staffUserId: "staff-1",
    });
    expect(prismaMock.aiSequenceDraftRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: "run-1", status: "RUNNING" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        reason: null,
        activeClientId: null,
        templateIds: ["tpl-1", "tpl-2"],
        message:
          "2 drafts written for days 1, 4. Read and approve each one before it can be sent.",
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/clients/client-1/templates");
  });

  it("records a provider timeout without calling the drafter again", async () => {
    prismaMock.aiSequenceDraftRun.findUnique.mockResolvedValueOnce({
      id: "run-1",
      clientId: "client-1",
      requestedByStaffUserId: "staff-1",
      status: "QUEUED",
    });
    draftMock.mockResolvedValueOnce({
      ok: false,
      reason: "xai_timeout: exceeded 180000ms",
    });

    await executeSequenceDraftRun("run-1");

    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiSequenceDraftRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: "run-1", status: "RUNNING" },
      data: expect.objectContaining({
        status: "FAILED",
        reason: "xai_timeout: exceeded 180000ms",
        message:
          "The AI provider is temporarily unavailable. Nothing was charged — try again shortly.",
        templateIds: [],
        activeClientId: null,
      }),
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: "timeout",
        reason: "xai_timeout: exceeded 180000ms",
        runId: "run-1",
      }),
      "Sequence draft run failed",
    );
  });

  it("marks a thrown drafter failure once and does not try again", async () => {
    prismaMock.aiSequenceDraftRun.findUnique.mockResolvedValueOnce({
      id: "run-1",
      clientId: "client-1",
      requestedByStaffUserId: "staff-1",
      status: "QUEUED",
    });
    draftMock.mockRejectedValueOnce(new Error("socket hang up"));

    await executeSequenceDraftRun("run-1");

    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiSequenceDraftRun.updateMany).toHaveBeenLastCalledWith({
      where: { id: "run-1", status: "RUNNING" },
      data: expect.objectContaining({
        status: "FAILED",
        reason: "sequence_draft_crashed",
      }),
    });
  });

  it("does not call the drafter for a run that is already running", async () => {
    prismaMock.aiSequenceDraftRun.findUnique.mockResolvedValueOnce({
      id: "run-1",
      clientId: "client-1",
      requestedByStaffUserId: "staff-1",
      status: "RUNNING",
    });

    await executeSequenceDraftRun("run-1");

    expect(draftMock).not.toHaveBeenCalled();
  });
});

describe("stale runs", () => {
  it("marks an abandoned run failed and does not start a model call", async () => {
    const startedAt = new Date(NOW.getTime() - sequenceDraftRunDeadlineMs() - 1);
    prismaMock.aiSequenceDraftRun.findFirst.mockResolvedValueOnce({
      id: "run-1",
      clientId: "client-1",
      status: "RUNNING",
      startedAt,
      createdAt: startedAt,
      message: null,
    });

    const view = await readSequenceDraftRun({
      clientId: "client-1",
      runId: "run-1",
      now: NOW,
    });

    expect(view).toEqual({
      status: "FAILED",
      message: SEQUENCE_DRAFT_INTERRUPTED_MESSAGE,
    });
    expect(draftMock).not.toHaveBeenCalled();
    expect(prismaMock.aiSequenceDraftRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", status: { in: ["QUEUED", "RUNNING"] } },
      data: expect.objectContaining({
        status: "FAILED",
        reason: "sequence_draft_interrupted",
        activeClientId: null,
      }),
    });
  });

  it("clears the in-flight lock when expiring a client", async () => {
    await expireStaleSequenceDraftRuns({ clientId: "client-1", now: NOW });
    expect(prismaMock.aiSequenceDraftRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activeClientId: null, status: "FAILED" }),
      }),
    );
    expect(draftMock).not.toHaveBeenCalled();
  });
});
