import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 158 — the internal-seed allowlist (`upsertInternalSeedAddress`) had no
 * domain or client scoping: any string containing "@" was accepted, and the
 * allowlist it writes is consumed globally (suppression, bounce handling,
 * dispatch re-check, metrics, step-sends) once
 * `INTERNAL_SEED_ALLOWLIST_ENABLED` is turned on. On-screen copy calls the
 * entries "OpensDoors-internal test inboxes" — this test proves the write
 * path actually enforces that scope, not just describes it.
 *
 * See `docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md` finding 5.
 */

const { upsert } = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    internalSeedAddress: {
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));

import { upsertInternalSeedAddress } from "./seed-allowlist";

describe("upsertInternalSeedAddress — domain scoping", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({
      id: "seed_1",
      email: "adam@opensdoors.co.uk",
      label: null,
      note: null,
      isActive: true,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("rejects an out-of-scope domain and never touches the database", async () => {
    const result = await upsertInternalSeedAddress({
      email: "prospect@acme.com",
    });
    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a look-alike domain that merely contains the allowed one", async () => {
    const result = await upsertInternalSeedAddress({
      email: "attacker@opensdoors.co.uk.evil.com",
    });
    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("accepts an in-scope opensdoors.co.uk address and writes it", async () => {
    const result = await upsertInternalSeedAddress({
      email: "Adam@OpensDoors.co.uk",
      label: "Adam (internal test)",
    });
    expect(result).not.toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { email: "adam@opensdoors.co.uk" },
    });
  });

  it("still rejects a blank/invalid string as before", async () => {
    const result = await upsertInternalSeedAddress({ email: "not-an-email" });
    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
