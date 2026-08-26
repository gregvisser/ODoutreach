import { describe, expect, it } from "vitest";

import {
  evaluateAutonomousActorGuard,
  type AutonomousActorGuardInput,
} from "./autonomous-actor-guard";

/**
 * THE RULE THIS ENFORCES, in Greg's words:
 *
 *   "if any emails or deleting gets done, it can only happen on the bidlow
 *    client in the ODoutreach system. all other clients can be worked on to
 *    prove the system, but sending and deleting can only happen on bidlow
 *    customer."
 *
 * It exists because a rule written only in a markdown file is a rule that gets
 * forgotten by cycle forty. This is that rule as code, and these tests are the
 * tripwire: it cannot be turned off by editing one line without going red.
 *
 * The distinction that makes it usable: it gates the AUTONOMOUS ACTOR, not the
 * action. Greg and his staff sending normally are never touched.
 */

/** Assert a refusal and narrow to it, so `.code` is reachable in a test. */
function refusal(d: ReturnType<typeof evaluateAutonomousActorGuard>) {
  expect(d.allowed).toBe(false);
  if (d.allowed) throw new Error("expected a refusal");
  return d;
}

const base = (over: Partial<AutonomousActorGuardInput> = {}): AutonomousActorGuardInput => ({
  action: "SEND",
  actor: "MACHINE",
  clientSlug: "train-hugger",
  relay: { active: true, allowlist: ["bidlow"] },
  ...over,
});

describe("when the relay is not running, nothing changes", () => {
  it("allows a machine send for any client", () => {
    // The cron drains a queue a human filled. Outside autonomous operation
    // this guard must be completely inert, or it becomes a second, invisible
    // reason production stopped sending.
    const d = evaluateAutonomousActorGuard(base({ relay: { active: false, allowlist: [] } }));
    expect(d.allowed).toBe(true);
  });

  it("allows a destructive action for any client", () => {
    const d = evaluateAutonomousActorGuard(
      base({ action: "DESTRUCTIVE", relay: { active: false, allowlist: [] } }),
    );
    expect(d.allowed).toBe(true);
  });
});

describe("while the relay IS running", () => {
  it("refuses a send for a client that is not allowlisted", () => {
    const d = refusal(evaluateAutonomousActorGuard(base({ clientSlug: "train-hugger" })));
    expect(d.code).toBe("autonomous_client_not_allowlisted");
    // The refusal has to say WHY in words a non-coder can act on.
    expect(d.reason).toMatch(/train-hugger/);
  });

  it("allows a send for the allowlisted client", () => {
    const d = evaluateAutonomousActorGuard(base({ clientSlug: "bidlow" }));
    expect(d.allowed).toBe(true);
  });

  it("refuses a destructive action for a client that is not allowlisted", () => {
    const d = evaluateAutonomousActorGuard(base({ action: "DESTRUCTIVE" }));
    expect(d.allowed).toBe(false);
  });

  it("allows a destructive action for the allowlisted client", () => {
    const d = evaluateAutonomousActorGuard(base({ action: "DESTRUCTIVE", clientSlug: "bidlow" }));
    expect(d.allowed).toBe(true);
  });

  it("does not block a human", () => {
    // "Human-operated use is unaffected." Greg or his staff sending normally
    // must not be stopped by a gate aimed at an agent.
    const d = evaluateAutonomousActorGuard(base({ actor: "HUMAN_STAFF" }));
    expect(d.allowed).toBe(true);
  });

  it("treats an unidentified actor as a machine", () => {
    // Anything that cannot prove it is a person is treated as one of ours.
    const d = evaluateAutonomousActorGuard(base({ actor: "UNKNOWN" }));
    expect(d.allowed).toBe(false);
  });
});

describe("it fails CLOSED — never default to allowing", () => {
  it("refuses everything when the allowlist is empty", () => {
    const d = refusal(evaluateAutonomousActorGuard(base({ relay: { active: true, allowlist: [] } })));
    expect(d.code).toBe("autonomous_allowlist_missing");
  });

  it("refuses even the allowlisted-looking client when the allowlist is empty", () => {
    const d = evaluateAutonomousActorGuard(
      base({ clientSlug: "bidlow", relay: { active: true, allowlist: [] } }),
    );
    expect(d.allowed).toBe(false);
  });

  it("refuses when the client cannot be identified", () => {
    for (const slug of [null, undefined, "", "   "]) {
      const d = refusal(evaluateAutonomousActorGuard(base({ clientSlug: slug })));
      expect(d.code).toBe("autonomous_client_unidentified");
    }
  });

  it("refuses an allowlist made only of blanks", () => {
    // A misconfigured "AUTONOMOUS_SEND_ALLOWLIST=," must not read as
    // "everything is allowed", and must not read as one empty-named client
    // that a missing slug could then match.
    const d = evaluateAutonomousActorGuard(
      base({ clientSlug: "bidlow", relay: { active: true, allowlist: ["", "  "] } }),
    );
    expect(d.allowed).toBe(false);
  });

  it("never matches a client by accident", () => {
    // Substring and case traps: 'bidlow-old' is NOT 'bidlow'.
    for (const slug of ["bidlow-old", "not-bidlow", "bidlowx", "bid"]) {
      expect(evaluateAutonomousActorGuard(base({ clientSlug: slug })).allowed).toBe(false);
    }
    // ...but the same name in a different case IS the same client, because a
    // slug is case-insensitive and refusing here would be a false alarm.
    expect(evaluateAutonomousActorGuard(base({ clientSlug: "BidLow" })).allowed).toBe(true);
    expect(evaluateAutonomousActorGuard(base({ clientSlug: " bidlow " })).allowed).toBe(true);
  });
});

describe("the refusal is legible to a person", () => {
  it("names the action, the client and what to do", () => {
    const d = refusal(evaluateAutonomousActorGuard(base({ clientSlug: "green-the-uk" })));
    expect(d.reason.length).toBeGreaterThan(30);
    expect(d.reason).not.toMatch(/undefined|null|\[object/);
  });
});
