import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Prisma with exactly the delegates the gate + seed lookup touch.
const { seedFindFirst, suppEmailFindUnique, suppDomainFindUnique } = vi.hoisted(
  () => ({
    seedFindFirst: vi.fn(),
    suppEmailFindUnique: vi.fn(),
    suppDomainFindUnique: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    internalSeedAddress: {
      findFirst: (...a: unknown[]) => seedFindFirst(...a),
    },
    suppressedEmail: {
      findUnique: (...a: unknown[]) => suppEmailFindUnique(...a),
    },
    suppressedDomain: {
      findUnique: (...a: unknown[]) => suppDomainFindUnique(...a),
    },
  },
}));

import { evaluateSuppression } from "./suppression-guard";

const FLAG = "INTERNAL_SEED_ALLOWLIST_ENABLED";
const prevFlag = process.env[FLAG];

beforeEach(() => {
  seedFindFirst.mockReset();
  suppEmailFindUnique.mockReset();
  suppDomainFindUnique.mockReset();
  suppEmailFindUnique.mockResolvedValue(null);
  suppDomainFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
});

describe("Feature A — internal seed exemption at the suppression gate", () => {
  it("(i) a seed address ALWAYS passes the gate, even when it is on the suppression list", async () => {
    process.env[FLAG] = "true";
    seedFindFirst.mockResolvedValue({ id: "seed_adam" });
    // Even if the email suppression row WOULD match, the seed exemption wins.
    suppEmailFindUnique.mockResolvedValue({ email: "adam@opensdoors.co.uk" });

    const d = await evaluateSuppression("client-1", "Adam@OpensDoors.co.uk");

    expect(d.suppressed).toBe(false);
    expect(d.internalSeedExempt).toBe(true);
    expect(d.normalizedEmail).toBe("adam@opensdoors.co.uk");
    // Short-circuits BEFORE the suppression-list lookups.
    expect(suppEmailFindUnique).not.toHaveBeenCalled();
    expect(suppDomainFindUnique).not.toHaveBeenCalled();
  });

  it("with the flag OFF, the exemption never applies and a suppressed seed address stays blocked (no behaviour change, no seed query)", async () => {
    delete process.env[FLAG];
    suppEmailFindUnique.mockResolvedValue({ email: "adam@opensdoors.co.uk" });

    const d = await evaluateSuppression("client-1", "adam@opensdoors.co.uk");

    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("email_list");
    expect(d.internalSeedExempt).toBeUndefined();
    // The seed table is never consulted when the feature is off.
    expect(seedFindFirst).not.toHaveBeenCalled();
  });

  it("with the flag ON, a NON-seed address is evaluated through the normal suppression path", async () => {
    process.env[FLAG] = "true";
    seedFindFirst.mockResolvedValue(null); // not a seed
    suppEmailFindUnique.mockResolvedValue(null);

    const d = await evaluateSuppression("client-1", "prospect@acme.com");

    expect(d.suppressed).toBe(false);
    expect(d.internalSeedExempt).toBeUndefined();
    expect(seedFindFirst).toHaveBeenCalledTimes(1);
    expect(suppEmailFindUnique).toHaveBeenCalledTimes(1);
  });
});
