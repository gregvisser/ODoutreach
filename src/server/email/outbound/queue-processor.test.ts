import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract test for the outbound send-queue claim (audit M1 + F2).
 *
 * The claim is a single `$queryRaw` that runs against Postgres, so there is no
 * DB in this unit suite — we assert against the source text, mirroring the
 * repo's policy/wiring test convention (see advance-due-followups.test.ts).
 * The point is to lock the safety predicates so a future refactor can't quietly
 * drain a workspace that should be stopped.
 */
const root = process.cwd();
const src = readFileSync(
  join(root, "src/server/email/outbound/queue-processor.ts"),
  "utf8",
);

describe("processOutboundSendQueue claim — workspace-state guards", () => {
  it("only claims QUEUED rows, and does so concurrency-safely (SKIP LOCKED)", () => {
    expect(src).toContain(`"status" = 'QUEUED'`);
    expect(src).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("F2 — never claims a send whose workspace is soft-deleted", () => {
    expect(src).toContain(`c."deletedAt" IS NULL`);
  });

  it("M1 — never claims a send whose workspace is PAUSED or ARCHIVED", () => {
    // The whole point of M1: pausing/archiving a client must halt its in-flight
    // backlog, not just stop new plans.
    expect(src).toContain(`'PAUSED'::"ClientLifecycleStatus"`);
    expect(src).toContain(`'ARCHIVED'::"ClientLifecycleStatus"`);
    expect(src).toMatch(/c\."status"\s+NOT IN/);
  });

  it("does NOT gate on a positive status, so live ONBOARDING/ACTIVE queues still drain", () => {
    // Using `NOT IN (paused, archived)` rather than `= 'ACTIVE'` is deliberate:
    // it must not stall an ONBOARDING workspace's legitimate (e.g. internal
    // proof) sends. Guard against a regression to an allow-list form.
    expect(src).not.toMatch(/c\."status"\s*=\s*'ACTIVE'/);
  });
});
