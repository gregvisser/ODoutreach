import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Prisma: a seed lookup delegate plus a $transaction whose invocation we
// can spy on (so we can prove the writer never even opens a transaction for a
// seed address).
const {
  seedFindFirst,
  txSpy,
  findUnique,
  createSupp,
  updateSupp,
  updateManyContacts,
  createAudit,
} = vi.hoisted(() => ({
  seedFindFirst: vi.fn(),
  txSpy: vi.fn(),
  findUnique: vi.fn(),
  createSupp: vi.fn(),
  updateSupp: vi.fn(),
  updateManyContacts: vi.fn(),
  createAudit: vi.fn(),
}));

const tx = {
  suppressedEmail: {
    findUnique: (...a: unknown[]) => findUnique(...a),
    create: (...a: unknown[]) => createSupp(...a),
    update: (...a: unknown[]) => updateSupp(...a),
  },
  contact: { updateMany: (...a: unknown[]) => updateManyContacts(...a) },
  auditLog: { create: (...a: unknown[]) => createAudit(...a) },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    internalSeedAddress: {
      findFirst: (...a: unknown[]) => seedFindFirst(...a),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => {
      txSpy();
      return fn(tx);
    },
  },
}));

import { suppressRecipientForHardBounce } from "./bounce-suppression";

const AT = new Date("2026-06-25T10:00:00.000Z");
const FLAG = "INTERNAL_SEED_ALLOWLIST_ENABLED";
const prevFlag = process.env[FLAG];

function baseInput(over: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    email: "adam@opensdoors.co.uk",
    contactId: "ct-1",
    outboundEmailId: "out-1",
    providerEventType: "email.bounced",
    at: AT,
    ...over,
  };
}

beforeEach(() => {
  seedFindFirst.mockReset();
  txSpy.mockReset();
  findUnique.mockReset();
  createSupp.mockReset();
  updateSupp.mockReset();
  updateManyContacts.mockReset();
  createAudit.mockReset();
  updateManyContacts.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
});

describe("Feature A — no automated process can suppress a seed address", () => {
  it("(ii) a HARD BOUNCE never suppresses a seed address (no transaction, no writes)", async () => {
    process.env[FLAG] = "true";
    seedFindFirst.mockResolvedValue({ id: "seed_adam" });

    const res = await suppressRecipientForHardBounce(baseInput());

    expect(res.suppressed).toBe(false);
    expect(res.skippedInternalSeed).toBe(true);
    // The writer short-circuits BEFORE opening a transaction or touching any row.
    expect(txSpy).not.toHaveBeenCalled();
    expect(createSupp).not.toHaveBeenCalled();
    expect(updateManyContacts).not.toHaveBeenCalled();
    expect(createAudit).not.toHaveBeenCalled();
  });

  it("(ii) a SPAM COMPLAINT never suppresses a seed address either", async () => {
    process.env[FLAG] = "true";
    seedFindFirst.mockResolvedValue({ id: "seed_adam" });

    const res = await suppressRecipientForHardBounce(
      baseInput({ reason: "complaint", providerEventType: "email.complained" }),
    );

    expect(res.suppressed).toBe(false);
    expect(res.skippedInternalSeed).toBe(true);
    expect(txSpy).not.toHaveBeenCalled();
    expect(createSupp).not.toHaveBeenCalled();
  });

  it("with the flag OFF, the seed guard is inert — a bounce suppresses normally (no behaviour change, no seed query)", async () => {
    delete process.env[FLAG];
    findUnique.mockResolvedValue(null);
    createSupp.mockResolvedValue({ id: "supp-1" });

    const res = await suppressRecipientForHardBounce(baseInput());

    expect(seedFindFirst).not.toHaveBeenCalled();
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(createSupp).toHaveBeenCalledTimes(1);
    expect(res.suppressed).toBe(true);
    expect(res.skippedInternalSeed).toBeUndefined();
  });

  it("with the flag ON, a NON-seed address still suppresses normally", async () => {
    process.env[FLAG] = "true";
    seedFindFirst.mockResolvedValue(null); // not a seed
    findUnique.mockResolvedValue(null);
    createSupp.mockResolvedValue({ id: "supp-2" });

    const res = await suppressRecipientForHardBounce(
      baseInput({ email: "dead@acme.com" }),
    );

    expect(seedFindFirst).toHaveBeenCalledTimes(1);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(createSupp).toHaveBeenCalledTimes(1);
    expect(res.suppressed).toBe(true);
  });
});
