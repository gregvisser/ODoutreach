import { describe, expect, it } from "vitest";
import { validateFollowUpScope } from "./followup-scope";

describe("finite follow-up scope", () => {
  it("retains legacy unscoped and client-scoped calls", () => {
    expect(() => validateFollowUpScope()).not.toThrow();
    expect(() => validateFollowUpScope({ clientId: "client-a" })).not.toThrow();
    expect(() => validateFollowUpScope({ clientId: "client-a", sequenceIds: ["sequence-a"] })).not.toThrow();
  });
  it.each([
    { clientId: "" }, { clientId: " client-a" },
    { sequenceIds: ["sequence-a"] },
    { clientId: "client-a", sequenceIds: [] },
    { clientId: "client-a", sequenceIds: ["sequence-a", "sequence-a"] },
    { clientId: "client-a", sequenceIds: [" "] },
    { clientId: "client-a", sequenceIds: Array.from({ length: 51 }, (_, i) => `seq-${i}`) },
  ])("rejects invalid scope instead of widening it: %j", scope => {
    expect(() => validateFollowUpScope(scope)).toThrow();
  });
});
