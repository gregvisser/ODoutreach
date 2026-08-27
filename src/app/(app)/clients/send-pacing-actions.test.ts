import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `setClientSendBatchSizeAction` — the per-client "how many at a time" control.
 *
 * The value this action writes decides how much real email leaves a mailbox in
 * one go, so the interesting tests are the refusals: a staff member without
 * mailbox rights, a deleted workspace, and every way a number box can produce
 * something that is not a sane batch size.
 */
const {
  requireStaff,
  requireMutator,
  clientFindFirst,
  clientUpdate,
} = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  requireMutator: vi.fn(),
  clientFindFirst: vi.fn(),
  clientUpdate: vi.fn(),
}));

vi.mock("@/server/auth/staff", () => ({
  requireOpensDoorsStaff: (...a: unknown[]) => requireStaff(...a),
}));
vi.mock("@/server/mailbox-identities/mutator-access", () => ({
  requireClientMailboxMutator: (...a: unknown[]) => requireMutator(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findFirst: (...a: unknown[]) => clientFindFirst(...a),
      update: (...a: unknown[]) => clientUpdate(...a),
    },
  },
}));

import { MAX_SEND_BATCH_SIZE } from "@/lib/mailboxes/send-pacing";

import { setClientSendBatchSizeAction } from "./send-pacing-actions";

describe("setClientSendBatchSizeAction", () => {
  beforeEach(() => {
    requireStaff.mockReset().mockResolvedValue({ id: "staff-1" });
    requireMutator.mockReset().mockResolvedValue(undefined);
    clientFindFirst.mockReset().mockResolvedValue({ id: "c1" });
    clientUpdate.mockReset().mockResolvedValue({});
  });

  it("saves a valid batch size", async () => {
    const res = await setClientSendBatchSizeAction("c1", 6);

    expect(res.ok).toBe(true);
    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { sendBatchSize: 6 },
    });
  });

  it("clearing it returns the workspace to the standard pace", async () => {
    const res = await setClientSendBatchSizeAction("c1", null);

    expect(res.ok).toBe(true);
    expect(clientUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { sendBatchSize: null },
    });
    expect(res.ok && res.message).toMatch(/standard pace/i);
  });

  it("refuses a staff member without mailbox rights, and writes nothing", async () => {
    requireMutator.mockRejectedValue(new Error("Forbidden"));

    const res = await setClientSendBatchSizeAction("c1", 4);

    expect(res.ok).toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("refuses a deleted workspace, and writes nothing", async () => {
    clientFindFirst.mockResolvedValue(null);

    const res = await setClientSendBatchSizeAction("c1", 4);

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/not found/i);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("refuses a value that would empty a mailbox in one burst", async () => {
    for (const bad of [0, -1, MAX_SEND_BATCH_SIZE + 1, 1000]) {
      const res = await setClientSendBatchSizeAction("c1", bad);
      expect(res.ok).toBe(false);
    }
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a whole number", async () => {
    for (const bad of [4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await setClientSendBatchSizeAction("c1", bad);
      expect(res.ok).toBe(false);
    }
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it("accepts the boundaries", async () => {
    expect((await setClientSendBatchSizeAction("c1", 1)).ok).toBe(true);
    expect(
      (await setClientSendBatchSizeAction("c1", MAX_SEND_BATCH_SIZE)).ok,
    ).toBe(true);
  });
});
