import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, findMany, isSeed } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  isSeed: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    outboundEmail: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

vi.mock("@/server/internal-seed/seed-allowlist", () => ({
  isInternalSeedAddress: (...a: unknown[]) => isSeed(...a),
}));

import {
  decideDispatchRecheck,
  isDispatchRecheckEnabled,
  loadDispatchRecentSend,
} from "./dispatch-recheck";

const NOW = new Date("2026-06-21T12:00:00.000Z");

describe("decideDispatchRecheck (pure)", () => {
  it("does not block when there is no recent send", () => {
    expect(decideDispatchRecheck({ now: NOW, recentSend: null })).toEqual({
      block: false,
    });
  });

  it("blocks a hard bounce — and bounce wins even past the cooldown window", () => {
    const d = decideDispatchRecheck({
      now: NOW,
      recentSend: {
        lastSentAt: new Date("2026-06-01T00:00:00.000Z"), // 20d ago, past cooldown
        eligibleAt: new Date("2026-06-11T00:00:00.000Z"),
        bounced: true,
      },
    });
    expect(d).toMatchObject({ block: true, kind: "recent_bounce" });
  });

  it("blocks a non-bounced send still inside the 10-day cooldown", () => {
    const d = decideDispatchRecheck({
      now: NOW,
      recentSend: {
        lastSentAt: new Date("2026-06-15T00:00:00.000Z"), // 6d ago
        eligibleAt: new Date("2026-06-25T00:00:00.000Z"),
        bounced: false,
      },
    });
    expect(d).toMatchObject({ block: true, kind: "cooldown" });
  });

  it("does not block a non-bounced send once the cooldown has elapsed", () => {
    const d = decideDispatchRecheck({
      now: NOW,
      recentSend: {
        lastSentAt: new Date("2026-06-01T00:00:00.000Z"), // 20d ago
        eligibleAt: new Date("2026-06-11T00:00:00.000Z"),
        bounced: false,
      },
    });
    expect(d).toEqual({ block: false });
  });
});

describe("isDispatchRecheckEnabled (flag, default OFF)", () => {
  const prev = process.env.SEND_DISPATCH_RECHECK_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.SEND_DISPATCH_RECHECK_ENABLED;
    else process.env.SEND_DISPATCH_RECHECK_ENABLED = prev;
  });

  it("is off when unset", () => {
    delete process.env.SEND_DISPATCH_RECHECK_ENABLED;
    expect(isDispatchRecheckEnabled()).toBe(false);
  });

  it("is on only for the literal 'true'", () => {
    process.env.SEND_DISPATCH_RECHECK_ENABLED = "true";
    expect(isDispatchRecheckEnabled()).toBe(true);
    process.env.SEND_DISPATCH_RECHECK_ENABLED = "1";
    expect(isDispatchRecheckEnabled()).toBe(false);
  });
});

describe("loadDispatchRecentSend (DB) — mirrors the planner", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
    isSeed.mockReset();
    isSeed.mockResolvedValue(false);
    // This row belongs to sequence "seq-own".
    findUnique.mockResolvedValue({
      sequenceStepSends: [{ sequenceId: "seq-own" }],
    });
  });

  it("Feature A — returns null for a seed/allowlist address WITHOUT querying recent sends", async () => {
    isSeed.mockResolvedValue(true);
    const r = await loadDispatchRecentSend({
      outboundEmailId: "out-1",
      toEmail: "Adam@OpensDoors.co.uk",
      now: NOW,
    });
    expect(r).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("no-ops on an empty recipient without querying", async () => {
    const r = await loadDispatchRecentSend({
      outboundEmailId: "out-1",
      toEmail: "   ",
      now: NOW,
    });
    expect(r).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("ignores recent sends that belong to this row's OWN sequence (follow-up safe)", async () => {
    findMany.mockResolvedValue([
      {
        sentAt: new Date("2026-06-18T00:00:00.000Z"),
        status: "SENT",
        sequenceStepSends: [{ sequenceId: "seq-own" }],
      },
    ]);
    const r = await loadDispatchRecentSend({
      outboundEmailId: "out-1",
      toEmail: "Prospect@Example.com",
      now: NOW,
    });
    expect(r).toBeNull();
  });

  it("picks the newest cross-sequence send and aggregates any in-window bounce", async () => {
    findMany.mockResolvedValue([
      {
        sentAt: new Date("2026-06-19T00:00:00.000Z"),
        status: "SENT",
        sequenceStepSends: [{ sequenceId: "seq-other" }],
      },
      {
        sentAt: new Date("2026-06-14T00:00:00.000Z"),
        status: "BOUNCED",
        sequenceStepSends: [{ sequenceId: "seq-other" }],
      },
    ]);
    const r = await loadDispatchRecentSend({
      outboundEmailId: "out-1",
      toEmail: "prospect@example.com",
      now: NOW,
    });
    expect(r).not.toBeNull();
    // Newest send is the lastSentAt; the older BOUNCED row flips bounced=true.
    expect(r?.lastSentAt).toEqual(new Date("2026-06-19T00:00:00.000Z"));
    expect(r?.bounced).toBe(true);
  });
});

describe("execute-one wiring (contract)", () => {
  const exec = readFileSync(
    join(process.cwd(), "src/server/email/outbound/execute-one.ts"),
    "utf8",
  );

  it("runs the dispatch re-check only behind the flag, after the suppression check", () => {
    expect(exec).toContain("isDispatchRecheckEnabled()");
    expect(exec).toContain("evaluateOutboundDispatchRecheck");
    // Re-uses the existing terminal — no new enum value / migration.
    expect(exec).toContain('status: "BLOCKED_SUPPRESSION"');
    expect(exec).toContain('lastErrorCode:');
    expect(exec).toContain("RECENT_BOUNCE");
    expect(exec).toContain("OUTREACH_COOLDOWN");
  });
});
