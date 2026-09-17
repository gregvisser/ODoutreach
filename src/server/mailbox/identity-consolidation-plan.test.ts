import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseIdentityPlanManifest } from "./identity-consolidation-plan";

const valid = () => ({ version: 1, cutoffBefore: "2026-09-16T00:00:00.000Z", groups: [{
  identity: { clientId: "client", mailboxIdentityId: "mailbox", internetMessageId: "<message@test>", fromEmail: "sender@test", receivedAt: "2026-09-15T00:00:00.000Z" }, rawIds: ["a", "b"],
}] });

describe("exact identity manifest", () => {
  it("accepts normalized exact scope", () => expect(parseIdentityPlanManifest(valid())).toEqual(valid()));
  it.each([
    { ...valid(), execute: true }, { ...valid(), groups: [] },
    { ...valid(), groups: [valid().groups[0], valid().groups[0]] },
    { ...valid(), groups: [{ ...valid().groups[0], rawIds: ["a", "a"] }] },
    { ...valid(), groups: [{ ...valid().groups[0], expectedFingerprints: { a: "a".repeat(64) } }] },
    { ...valid(), groups: [{ ...valid().groups[0], identity: { ...valid().groups[0].identity, fromEmail: "Sender@Test" } }] },
  ])("rejects execution flags, duplicate/incomplete scope, and unnormalized identities", input => {
    expect(() => parseIdentityPlanManifest(input)).toThrow("INVALID_IDENTITY_PLAN_MANIFEST");
  });
});
