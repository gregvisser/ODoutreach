import { describe, expect, it } from "vitest";

import { resolveAutonomousRelayState, autonomousRelayIsActive } from "./autonomous-mode";

/**
 * The environment half of the gate. The decision is tested next door in
 * `autonomous-actor-guard.test.ts`; this covers only what the env can do to it.
 *
 * The case that matters most is the misconfiguration: an allowlist variable
 * that is SET but empty must resolve to "nothing is allowed", never to "no
 * restriction". That is the difference between a gate and a decoration.
 */

describe("the relay is off unless it is explicitly on", () => {
  it("is off when the variable is absent", () => {
    expect(resolveAutonomousRelayState({}).active).toBe(false);
    expect(autonomousRelayIsActive({})).toBe(false);
  });

  it("is off for values that are not an affirmative", () => {
    for (const v of ["0", "false", "no", "off", "", "  ", "maybe", "yes-please-not"]) {
      expect(autonomousRelayIsActive({ AUTONOMOUS_RELAY_ACTIVE: v })).toBe(false);
    }
  });

  it("is on for the affirmatives, in any case", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On", " true "]) {
      expect(autonomousRelayIsActive({ AUTONOMOUS_RELAY_ACTIVE: v })).toBe(true);
    }
  });
});

describe("the allowlist", () => {
  it("defaults to bidlowai when not set at all", () => {
    const s = resolveAutonomousRelayState({ AUTONOMOUS_RELAY_ACTIVE: "1" });
    expect(s.allowlist).toEqual(["bidlowai"]);
  });

  it("is EMPTY when set to an empty value — a misconfiguration is not permission", () => {
    // The whole point. An operator who clears this variable must lock the gate
    // shut, not open it.
    for (const raw of ["", "   ", ",", " , , "]) {
      const s = resolveAutonomousRelayState({
        AUTONOMOUS_RELAY_ACTIVE: "1",
        AUTONOMOUS_SEND_ALLOWLIST: raw,
      });
      expect(s.active).toBe(true);
      expect(s.allowlist).toEqual([]);
    }
  });

  it("parses several slugs and normalises them", () => {
    const s = resolveAutonomousRelayState({
      AUTONOMOUS_RELAY_ACTIVE: "1",
      AUTONOMOUS_SEND_ALLOWLIST: " BidlowAI , second-client ,, ",
    });
    expect(s.allowlist).toEqual(["bidlowai", "second-client"]);
  });

  it("carries no allowlist at all while the relay is off", () => {
    const s = resolveAutonomousRelayState({ AUTONOMOUS_SEND_ALLOWLIST: "bidlowai" });
    expect(s).toEqual({ active: false, allowlist: [] });
  });
});
