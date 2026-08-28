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
  // A client whose autonomous-send switch someone has deliberately turned on.
  // Held constant in the allowlist tests below so they keep testing the
  // allowlist; the toggle gets its own block.
  clientAutonomousSend: true,
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

/**
 * THE PER-CLIENT AUTONOMOUS-SEND SWITCH.
 *
 * Greg, 2026-08-28: "yes the machine can send for all customers from now on.
 * there must be a switch or toggle set to make it machine sending or human
 * sending."
 *
 * So the guard stopped asking only "is this the one client we hard-coded" and
 * started asking "has a named person switched machine sending ON for this
 * client". The switch is the thing that makes autonomous sending defensible: a
 * machine may cold-email a stranger from a client's own domain only because
 * somebody, by name, decided it may.
 */
describe("the per-client autonomous-send switch", () => {
  it("refuses when the switch has never been set — absence is not permission", () => {
    // The single most important case on this page. A client nobody has made a
    // decision about is a client the machine may not send for. Both spellings
    // of "no value" behave identically, because a null from Prisma and an
    // undefined from a partial select are the same fact.
    for (const unset of [null, undefined]) {
      const d = refusal(
        evaluateAutonomousActorGuard(base({ clientSlug: "bidlow", clientAutonomousSend: unset })),
      );
      expect(d.code).toBe("autonomous_client_send_unset");
    }
  });

  it("refuses when the switch is explicitly turned OFF", () => {
    const d = refusal(
      evaluateAutonomousActorGuard(base({ clientSlug: "bidlow", clientAutonomousSend: false })),
    );
    expect(d.code).toBe("autonomous_client_send_disabled");
  });

  it("refuses a DESTRUCTIVE action on the same switch", () => {
    // Greg's rule has always had two halves. A switch that governed sending but
    // waved deletion through would be half a gate.
    for (const value of [null, false] as const) {
      const d = evaluateAutonomousActorGuard(
        base({ action: "DESTRUCTIVE", clientSlug: "bidlow", clientAutonomousSend: value }),
      );
      expect(d.allowed).toBe(false);
    }
  });

  it("allows only once the switch is ON and the client is allowlisted", () => {
    const d = evaluateAutonomousActorGuard(
      base({ clientSlug: "bidlow", clientAutonomousSend: true }),
    );
    expect(d.allowed).toBe(true);
  });

  it("leaves a HUMAN_STAFF send untouched whatever the switch says", () => {
    // The switch decides whether a MACHINE may send. A signed-in person sending
    // for a client is the ordinary business working, and this gate has never
    // been allowed to stop it.
    for (const value of [null, undefined, false, true] as const) {
      const d = evaluateAutonomousActorGuard(
        base({ actor: "HUMAN_STAFF", clientSlug: "train-hugger", clientAutonomousSend: value }),
      );
      expect(d.allowed).toBe(true);
    }
  });

  it("still treats an UNKNOWN actor as a machine and applies the switch to it", () => {
    const d = refusal(
      evaluateAutonomousActorGuard(
        base({ actor: "UNKNOWN", clientSlug: "bidlow", clientAutonomousSend: false }),
      ),
    );
    expect(d.code).toBe("autonomous_client_send_disabled");
  });

  it("switching client A on does not switch client B on", () => {
    // The isolation requirement, stated as a test. The guard reaches its answer
    // from THIS client's value and nothing else, so there is no shared state
    // for one client's decision to leak through.
    const relay = { active: true, allowlist: ["client-a", "client-b"] };
    const a = evaluateAutonomousActorGuard(
      base({ clientSlug: "client-a", clientAutonomousSend: true, relay }),
    );
    const b = evaluateAutonomousActorGuard(
      base({ clientSlug: "client-b", clientAutonomousSend: null, relay }),
    );
    expect(a.allowed).toBe(true);
    expect(refusal(b).code).toBe("autonomous_client_send_unset");
  });

  it("the switch cannot open a door the allowlist keeps shut", () => {
    // The two checks are an AND, never an OR. Turning the switch on for a
    // client the relay may not act for changes nothing — the gate can only ever
    // become MORE closed by adding a second question to it.
    const d = refusal(
      evaluateAutonomousActorGuard(base({ clientSlug: "train-hugger", clientAutonomousSend: true })),
    );
    expect(d.code).toBe("autonomous_client_not_allowlisted");
  });

  it("says in words a non-coder can act on that the switch is the reason", () => {
    const d = refusal(
      evaluateAutonomousActorGuard(base({ clientSlug: "bidlow", clientAutonomousSend: null })),
    );
    expect(d.reason).toMatch(/switch|Autonomous sending/i);
    expect(d.reason).not.toMatch(/undefined|null|\[object/);
  });
});

describe("the refusal is legible to a person", () => {
  it("names the action, the client and what to do", () => {
    const d = refusal(evaluateAutonomousActorGuard(base({ clientSlug: "green-the-uk" })));
    expect(d.reason.length).toBeGreaterThan(30);
    expect(d.reason).not.toMatch(/undefined|null|\[object/);
  });
});
