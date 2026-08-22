import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Acceptance: once a hard bounce has written a `SuppressedEmail` row, the
 * authoritative send-time gate (`evaluateSuppression`) must report the
 * address as suppressed — this is what blocks every future send, in normal
 * mode AND under an F3 cooldown re-engage override (the suppression gate is
 * read independently of the cooldown timer, both in the planner classifier
 * and in the live dispatch-time re-check).
 *
 * We mock Prisma so `suppressedEmail.findUnique` returns the row the bounce
 * writer would have created.
 */
const { suppressedEmailFindUnique, suppressedDomainFindMany } = vi.hoisted(
  () => ({
    suppressedEmailFindUnique: vi.fn(),
    suppressedDomainFindMany: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    suppressedEmail: { findUnique: (...a: unknown[]) => suppressedEmailFindUnique(...a) },
    suppressedDomain: { findMany: (...a: unknown[]) => suppressedDomainFindMany(...a) },
  },
}));

import { evaluateSuppression, isAddressSuppressed } from "./suppression-guard";

beforeEach(() => {
  suppressedEmailFindUnique.mockReset().mockResolvedValue(null);
  // The guard matches the recipient domain OR any parent, so this is findMany.
  suppressedDomainFindMany.mockReset().mockResolvedValue([]);
});

describe("evaluateSuppression blocks a hard-bounced address", () => {
  it("returns suppressed=true (email_list) when the SuppressedEmail row exists", async () => {
    // Row as written by suppressRecipientForHardBounce (normalized, lowercase).
    suppressedEmailFindUnique.mockResolvedValue({
      id: "supp-1",
      clientId: "client-1",
      email: "dead@example.com",
      sourceId: null,
    });

    const decision = await evaluateSuppression("client-1", "Dead@Example.com");

    expect(decision).toMatchObject({
      suppressed: true,
      reason: "email_list",
      normalizedEmail: "dead@example.com",
      matchedEmail: "dead@example.com",
    });
    // The lookup uses the normalized email — the same key the writer stores.
    expect(suppressedEmailFindUnique.mock.calls[0][0]).toMatchObject({
      where: { clientId_email: { clientId: "client-1", email: "dead@example.com" } },
    });

    expect(await isAddressSuppressed("client-1", "dead@example.com")).toBe(true);
  });

  it("returns suppressed=false when the address has no suppression row", async () => {
    const decision = await evaluateSuppression("client-1", "live@example.com");
    expect(decision.suppressed).toBe(false);
    expect(decision.reason).toBe("none");
  });
});
