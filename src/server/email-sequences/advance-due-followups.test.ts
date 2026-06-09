import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract test for the automatic follow-up advancer.
 *
 * The actual send safety (prior-step-sent + delay guard, suppression,
 * caps, governance) lives in the dispatcher and is covered by
 * `sequence-send-execution-policy-followup.test.ts` and
 * `send-introduction.test.ts`. This test locks the *wiring* so a future
 * refactor cannot accidentally make automated follow-ups bypass that
 * dispatcher or fire early / for the wrong clients. We assert against the
 * source text (no DB), mirroring the repo's UI/policy test convention.
 */
const root = process.cwd();
const advancer = readFileSync(
  join(root, "src/server/email-sequences/advance-due-followups.ts"),
  "utf8",
);
const route = readFileSync(
  join(root, "src/app/api/internal/sequences/advance/route.ts"),
  "utf8",
);

describe("advance-due-followups wiring", () => {
  it("dispatches through the delay-guarded sender, never a raw OutboundEmail insert", () => {
    // Must reuse the same dispatcher the manual launch uses — it enforces
    // the prior-step + delay guard, so nothing fires early.
    expect(advancer).toContain("sendSequenceStepBatch");
    // Must stage rows first (the missing piece) via the idempotent planner.
    expect(advancer).toContain("planSequenceStepSends");
    // Must NOT hand-roll sending / OutboundEmail creation (that would skip
    // the delay + suppression + cap guards).
    expect(advancer).not.toMatch(/outboundEmail\.create/i);
    expect(advancer).not.toContain("provider.send");
  });

  it("uses the real per-category confirmation phrase helper, not a hardcoded string", () => {
    expect(advancer).toContain("getSequenceStepSendConfirmationPhrase");
    expect(advancer).not.toMatch(/["']SEND FOLLOW UP/);
  });

  it("only advances ACTIVE clients and APPROVED sequences", () => {
    expect(advancer).toContain('status: "ACTIVE"');
    expect(advancer).toContain('status: "APPROVED"');
  });

  it("targets follow-up steps only and requires the prior step to have sent", () => {
    expect(advancer).toContain('category: { not: "INTRODUCTION" }');
    expect(advancer).toContain("previousCategoryFor");
    expect(advancer).toContain('status: "SENT"');
  });

  it("isolates per-step failures so one bad step cannot abort the run", () => {
    expect(advancer).toContain("try {");
    expect(advancer).toContain("result.errors.push");
  });

  it("has an env kill-switch to pause automatic sending without a deploy", () => {
    expect(advancer).toContain("SEQUENCE_FOLLOWUP_AUTOSEND");
    expect(advancer).toContain("paused: true");
  });

  it("passes a freshness window so resuming automation can't blast a backlog", () => {
    expect(advancer).toContain("autoSendMaxOverdueMs");
    expect(advancer).toContain("resolveAutoFollowUpFreshnessDays");
  });

  it("the internal route is gated behind the PROCESS_QUEUE_SECRET bearer", () => {
    expect(route).toContain("PROCESS_QUEUE_SECRET");
    expect(route).toContain("Bearer ${secret}");
    expect(route).toContain("Unauthorized");
    expect(route).toContain("status: 401");
  });
});
