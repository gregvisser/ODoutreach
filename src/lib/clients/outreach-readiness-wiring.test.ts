/**
 * PROVE IT FIRES — the Outreach readiness signal is actually wired.
 *
 * QUEUE.md records six separate instances this week of something that was
 * built, wired, reported success and never fired. This file exists so the
 * readiness fix is not the seventh.
 *
 * `isOutreachModuleReady` is only honest if the two signals it depends on
 * actually reach it at runtime. Both were already being LOADED by both call
 * sites before this fix — `hasProductionLaunchableSequence` and a
 * `clientEmailSequenceEnrollment.count()` — and then the enrolment count was
 * simply dropped on the floor before the snapshot was built. A query whose
 * result is discarded is indistinguishable from a query that was never
 * written, and that is exactly how the rail came to report "Ready to launch"
 * for a workspace with no sequences.
 *
 * There are two layers of proof here, and the first one matters more:
 *
 *  1. THE COMPILER. `hasProductionLaunchableSequence` and
 *     `enrolledContactsCount` are REQUIRED fields on
 *     `ClientLaunchSnapshotInput`. Any call site that forgets either one
 *     fails `npm run typecheck`, which is a merge-blocking CI gate. That is
 *     a stronger guarantee than any assertion in this file.
 *
 *  2. THESE TESTS. They pin the two known call sites by name, so that
 *     deleting one, or quietly re-adding a `?? 0` default that lets a caller
 *     skip the wiring, is a visible red test rather than a silent regression.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isOutreachModuleReady } from "@/lib/client-launch-state";

const root = process.cwd();

/** Every place that builds a client launch snapshot for the readiness rail. */
const SNAPSHOT_CALL_SITES = [
  {
    what: "the client overview page (the screen the bug was found on)",
    path: "src/app/(app)/clients/[clientId]/page.tsx",
  },
  {
    what: "the launch-approval snapshot (what gates ONBOARDING → ACTIVE)",
    path: "src/server/clients/launch-approval.ts",
  },
] as const;

describe("the Outreach readiness signal reaches the rail", () => {
  for (const site of SNAPSHOT_CALL_SITES) {
    describe(site.what, () => {
      const src = readFileSync(join(root, site.path), "utf8");

      it("counts sequence enrolments", () => {
        expect(src).toContain("clientEmailSequenceEnrollment.count");
      });

      it("asks whether a launchable production sequence exists", () => {
        expect(src).toContain("getClientHasProductionLaunchableSequence");
      });

      it("puts BOTH answers into the snapshot the rail is built from", () => {
        // The regression this catches: loading a value and never passing it on.
        expect(src).toContain("enrolledContactsCount,");
        expect(src).toContain("hasProductionLaunchableSequence,");
      });
    });
  }

  it("builds the readiness rows from that same snapshot", () => {
    for (const site of SNAPSHOT_CALL_SITES) {
      const src = readFileSync(join(root, site.path), "utf8");
      expect(src).toContain("buildLaunchReadinessRows");
    }
  });
});

/**
 * The predicate itself, exercised directly rather than through a builder, so
 * a future refactor of the row copy cannot accidentally weaken the rule.
 */
describe("isOutreachModuleReady requires all three, not any one", () => {
  const ready = {
    outreachPilotRunnable: true,
    hasProductionLaunchableSequence: true,
    enrolledContactsCount: 1,
  };

  it("is true only when a mailbox can send, a sequence is launchable, and someone is enrolled", () => {
    expect(isOutreachModuleReady(ready)).toBe(true);
  });

  it("is false without a sending mailbox", () => {
    expect(isOutreachModuleReady({ ...ready, outreachPilotRunnable: false })).toBe(false);
  });

  it("is false without a launchable sequence — the bidlowai case", () => {
    expect(
      isOutreachModuleReady({ ...ready, hasProductionLaunchableSequence: false }),
    ).toBe(false);
  });

  it("is false when nobody is enrolled", () => {
    expect(isOutreachModuleReady({ ...ready, enrolledContactsCount: 0 })).toBe(false);
  });

  it("treats a negative or absurd enrolment count as not ready", () => {
    expect(isOutreachModuleReady({ ...ready, enrolledContactsCount: -5 })).toBe(false);
  });

  it("a mailbox signal alone is never enough — the exact defect that shipped", () => {
    expect(
      isOutreachModuleReady({
        outreachPilotRunnable: true,
        hasProductionLaunchableSequence: false,
        enrolledContactsCount: 0,
      }),
    ).toBe(false);
  });
});
