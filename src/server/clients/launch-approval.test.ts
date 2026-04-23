import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffUser } from "@/generated/prisma/client";
import type { LaunchApprovalPolicyResult } from "@/lib/clients/client-launch-approval";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    client: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof prismaMock) => Promise<unknown>) =>
      cb(prismaMock),
    ),
  };
  return { prismaMock };
});

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import {
  approveClientLaunch,
  type LaunchApprovalSnapshot,
} from "./launch-approval";

const staff = { id: "staff-1", role: "OPERATOR" } as StaffUser;

function snapshotWithPolicy(overrides: {
  canApprove: boolean;
  blockers?: string[];
  warnings?: string[];
  status?: "ONBOARDING" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  canMutate?: boolean;
}): LaunchApprovalSnapshot {
  const policy: LaunchApprovalPolicyResult = {
    canApprove: overrides.canApprove,
    blockers: overrides.blockers ?? [],
    warnings: overrides.warnings ?? [],
    checklist: [
      {
        id: "brief",
        label: "Business brief complete",
        ok: overrides.canApprove,
        detail: "test",
      },
    ],
  };
  return {
    clientId: "c1",
    clientStatus: overrides.status ?? "ONBOARDING",
    launchApprovedAt: null,
    launchApprovedByStaffUserId: null,
    launchApprovalMode: null,
    launchApprovalNotes: null,
    storedChecklist: null,
    approvedByStaff: null,
    canMutate: overrides.canMutate ?? true,
    policy,
    evaluatedMode: "CONTROLLED_INTERNAL",
    readinessRows: [],
  };
}

beforeEach(() => {
  prismaMock.client.update.mockReset();
  prismaMock.auditLog.create.mockReset();
  prismaMock.$transaction.mockReset();
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock),
  );
  prismaMock.client.update.mockResolvedValue({ id: "c1" });
  prismaMock.auditLog.create.mockResolvedValue({ id: "log-1" });
});

describe("approveClientLaunch", () => {
  it("rejects when the confirmation phrase is missing or wrong case", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "approve launch",
      snapshotLoader: () =>
        Promise.resolve(snapshotWithPolicy({ canApprove: true })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFIRMATION_INVALID");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("trims the confirmation phrase before comparison", async () => {
    const loader = vi.fn(() =>
      Promise.resolve(snapshotWithPolicy({ canApprove: true })),
    );
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "   APPROVE LAUNCH   ",
      snapshotLoader: loader,
    });
    expect(result.ok).toBe(true);
    expect(prismaMock.client.update).toHaveBeenCalledOnce();
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects when policy blockers exist and records nothing", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      snapshotLoader: () =>
        Promise.resolve(
          snapshotWithPolicy({
            canApprove: false,
            blockers: ["Business brief is not complete."],
          }),
        ),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("POLICY_BLOCKED");
      expect(result.blockers).toEqual(["Business brief is not complete."]);
    }
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects LIVE_PROSPECT because it is not operator-selectable yet", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "LIVE_PROSPECT",
      confirmationPhrase: "APPROVE LAUNCH",
      snapshotLoader: () =>
        Promise.resolve(snapshotWithPolicy({ canApprove: true })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MODE_NOT_ALLOWED");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("rejects when the client is already ACTIVE", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      snapshotLoader: () =>
        Promise.resolve(
          snapshotWithPolicy({ canApprove: true, status: "ACTIVE" }),
        ),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_ACTIVE");
  });

  it("rejects when the operator cannot mutate the client", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      snapshotLoader: () =>
        Promise.resolve(
          snapshotWithPolicy({ canApprove: true, canMutate: false }),
        ),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("rejects when the snapshot loader returns null (not found / forbidden)", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      snapshotLoader: () => Promise.resolve(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("writes Client update + AuditLog atomically on success", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      notes: "Controlled internal pilot approved by GV.",
      snapshotLoader: () =>
        Promise.resolve(snapshotWithPolicy({ canApprove: true })),
    });
    expect(result.ok).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.client.update).toHaveBeenCalledOnce();
    const updateArgs = prismaMock.client.update.mock.calls[0]![0] as {
      where: { id: string };
      data: {
        status: string;
        launchApprovedAt: Date;
        launchApprovedByStaffUserId: string;
        launchApprovalMode: string;
        launchApprovalNotes: string | null;
      };
    };
    expect(updateArgs.where.id).toBe("c1");
    expect(updateArgs.data.status).toBe("ACTIVE");
    expect(updateArgs.data.launchApprovedByStaffUserId).toBe("staff-1");
    expect(updateArgs.data.launchApprovalMode).toBe("CONTROLLED_INTERNAL");
    expect(updateArgs.data.launchApprovalNotes).toBe(
      "Controlled internal pilot approved by GV.",
    );
    expect(updateArgs.data.launchApprovedAt).toBeInstanceOf(Date);

    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
    const auditArgs = prismaMock.auditLog.create.mock.calls[0]![0] as {
      data: {
        staffUserId: string;
        clientId: string;
        action: string;
        entityType: string;
        metadata: { event: string; mode: string };
      };
    };
    expect(auditArgs.data.staffUserId).toBe("staff-1");
    expect(auditArgs.data.clientId).toBe("c1");
    expect(auditArgs.data.action).toBe("UPDATE");
    expect(auditArgs.data.entityType).toBe("Client.launchApproval");
    expect(auditArgs.data.metadata.event).toBe("client_launch_approved");
    expect(auditArgs.data.metadata.mode).toBe("CONTROLLED_INTERNAL");
  });

  it("rejects notes longer than the maximum", async () => {
    const result = await approveClientLaunch({
      staff,
      clientId: "c1",
      mode: "CONTROLLED_INTERNAL",
      confirmationPhrase: "APPROVE LAUNCH",
      notes: "x".repeat(3000),
      snapshotLoader: () =>
        Promise.resolve(snapshotWithPolicy({ canApprove: true })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOTES_TOO_LONG");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });
});
