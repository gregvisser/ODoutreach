import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 157: `operatorRequeueFailedAction` and `releaseStaleProcessingAction`
 * already returned real `{ok,error}` / `{released}` shapes — the bug was
 * that the page's form-action wrappers discarded them
 * (`src/components/ops/operator-mutation-buttons.tsx` now reads them
 * instead). These tests pin down the two branches an owner needs to see:
 * a refused requeue carrying real error text, and a release reporting the
 * actual count — not just "it ran."
 *
 * `@/server/email/outbound/queue-processor` is mocked (not exercised here)
 * so importing `actions.ts` doesn't pull in the send-pipeline's full
 * provider/credential dependency chain.
 */
const {
  requireSuperAdmin,
  requireOpensDoorsStaff,
  getAccessibleClientIds,
  requireClientAccess,
  releaseStaleProcessingClaimsForScope,
  operatorRequeueFailedSend,
  revalidatePath,
} = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireOpensDoorsStaff: vi.fn(),
  getAccessibleClientIds: vi.fn(),
  requireClientAccess: vi.fn(),
  releaseStaleProcessingClaimsForScope: vi.fn(),
  operatorRequeueFailedSend: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/staff", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
  requireOpensDoorsStaff: (...a: unknown[]) => requireOpensDoorsStaff(...a),
}));
vi.mock("@/server/tenant/access", () => ({
  getAccessibleClientIds: (...a: unknown[]) => getAccessibleClientIds(...a),
  requireClientAccess: (...a: unknown[]) => requireClientAccess(...a),
}));
vi.mock("@/server/email/outbound/operator-recovery", () => ({
  releaseStaleProcessingClaimsForScope: (...a: unknown[]) =>
    releaseStaleProcessingClaimsForScope(...a),
  operatorRequeueFailedSend: (...a: unknown[]) => operatorRequeueFailedSend(...a),
}));
vi.mock("@/server/email/outbound/queue-processor", () => ({
  processOutboundSendQueue: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/db", () => ({
  prisma: { client: { update: vi.fn() } },
}));

import {
  operatorRequeueFailedAction,
  releaseStaleProcessingAction,
} from "./actions";

describe("operatorRequeueFailedAction", () => {
  beforeEach(() => {
    requireOpensDoorsStaff.mockReset().mockResolvedValue({ id: "staff-1", isSuperAdmin: true });
    requireClientAccess.mockReset().mockResolvedValue(undefined);
    operatorRequeueFailedSend.mockReset();
    revalidatePath.mockReset();
  });

  it("forces the failure branch: a row with no match (already has a provider id, or already retried) reports the real reason, not a swallowed no-op", async () => {
    operatorRequeueFailedSend.mockResolvedValue({ count: 0 });

    const result = await operatorRequeueFailedAction({
      outboundEmailId: "email-1",
      clientId: "client-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not requeue/i);
    // A refused mutation must not revalidate — nothing changed to show.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports success and revalidates when a row is actually requeued", async () => {
    operatorRequeueFailedSend.mockResolvedValue({ count: 1 });

    const result = await operatorRequeueFailedAction({
      outboundEmailId: "email-1",
      clientId: "client-1",
    });

    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/outbound");
  });

  it("refuses a non-super-admin before ever touching the row", async () => {
    requireOpensDoorsStaff.mockResolvedValue({ id: "staff-2", isSuperAdmin: false });

    const result = await operatorRequeueFailedAction({
      outboundEmailId: "email-1",
      clientId: "client-1",
    });

    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(operatorRequeueFailedSend).not.toHaveBeenCalled();
  });
});

describe("releaseStaleProcessingAction", () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset().mockResolvedValue({ id: "staff-1" });
    getAccessibleClientIds.mockReset().mockResolvedValue(["client-1", "client-2"]);
    releaseStaleProcessingClaimsForScope.mockReset();
    revalidatePath.mockReset();
  });

  it("reports the actual released count, including zero", async () => {
    releaseStaleProcessingClaimsForScope.mockResolvedValue({ count: 0 });

    const result = await releaseStaleProcessingAction();

    expect(result).toEqual({ released: 0 });
  });

  it("reports a non-zero count and revalidates the page", async () => {
    releaseStaleProcessingClaimsForScope.mockResolvedValue({ count: 7 });

    const result = await releaseStaleProcessingAction();

    expect(result).toEqual({ released: 7 });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/outbound");
  });
});
