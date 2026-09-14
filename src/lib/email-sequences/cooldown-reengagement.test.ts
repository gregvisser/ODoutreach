import { describe, expect, it } from "vitest";
import { hasCurrentCooldownReengagement, type CooldownReengagement } from "./cooldown-reengagement";

const approval: CooldownReengagement = {
  version: 1, clientId: "client", sequenceId: "sequence", stepId: "step", contactId: "contact",
  email: "person@example.test", recentOutboundId: "previous", recentSentAt: "2026-09-13T08:00:00.000Z",
  approvedByStaffUserId: "staff", approvedAt: "2026-09-14T07:00:00.000Z",
};
const input = {
  approval, clientId: "client", sequenceId: "sequence", stepId: "step", contactId: "contact",
  email: " Person@Example.Test ", recentOutboundId: "previous",
  recentSentAt: new Date(approval.recentSentAt), now: new Date("2026-09-14T09:00:00.000Z"),
};
describe("recipient-specific re-engagement consent", () => {
  it("remains valid at a later scheduled dispatch with unchanged history", () => {
    expect(hasCurrentCooldownReengagement(input)).toBe(true);
  });
  it.each([
    { clientId: "other" }, { sequenceId: "other" }, { stepId: "other" },
    { contactId: "other" }, { email: "other@example.test" }, { recentOutboundId: "new-send" },
    { recentSentAt: new Date("2026-09-14T08:00:00.000Z") },
    { now: new Date("2026-09-14T06:00:00.000Z") }, { recentOutboundId: undefined },
  ])("rejects changed scope/history or a future-dated decision: %j", (change) => {
    expect(hasCurrentCooldownReengagement({ ...input, ...change })).toBe(false);
  });
  it.each([null, {}, true, [], { ...approval, version: 2 }, { ...approval, approvedByStaffUserId: "" },
    { ...approval, approvedAt: "invalid" }, { ...approval, approvedAt: "2026-09-12T00:00:00.000Z" }])(
    "fails closed for missing, malformed or pre-history consent: %j", (invalid) => {
      expect(hasCurrentCooldownReengagement({ ...input, approval: invalid })).toBe(false);
    },
  );
});
