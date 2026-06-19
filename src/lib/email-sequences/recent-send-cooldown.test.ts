import { describe, expect, it } from "vitest";

import {
  OUTREACH_COOLDOWN_DAYS,
  dateWhenEmailEligibleAgain,
  formatCooldownReason,
  isEmailInCooldown,
} from "./recent-send-cooldown";

describe("recent-send-cooldown", () => {
  it("defaults the cooldown window to 10 days (workspace-wide)", () => {
    expect(OUTREACH_COOLDOWN_DAYS).toBe(10);
  });

  it("computes the eligible-again date by adding the cooldown to lastSentAt", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const eligible = dateWhenEmailEligibleAgain(lastSentAt);
    expect(eligible.toISOString()).toBe("2026-06-11T10:00:00.000Z");
  });

  it("does not mutate the input date when computing eligible-again", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const before = lastSentAt.getTime();
    dateWhenEmailEligibleAgain(lastSentAt);
    expect(lastSentAt.getTime()).toBe(before);
  });

  it("isEmailInCooldown returns false when lastSentAt is null/undefined", () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    expect(isEmailInCooldown(null, now)).toBe(false);
    expect(isEmailInCooldown(undefined, now)).toBe(false);
  });

  it("isEmailInCooldown returns true within the window", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-06-05T10:00:00.000Z"); // 4 days later
    expect(isEmailInCooldown(lastSentAt, now)).toBe(true);
  });

  it("isEmailInCooldown returns false on the exact boundary (cooldownDays later)", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-06-11T10:00:00.000Z"); // exactly 10 days
    expect(isEmailInCooldown(lastSentAt, now)).toBe(false);
  });

  it("isEmailInCooldown returns false past the window", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-07-15T10:00:00.000Z");
    expect(isEmailInCooldown(lastSentAt, now)).toBe(false);
  });

  it("formatCooldownReason embeds both the last-sent and eligible-again dates", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const reason = formatCooldownReason(lastSentAt);
    expect(reason).toContain("2026-06-01");
    expect(reason).toContain("2026-06-11");
    expect(reason).toContain("10-day cooldown");
  });

  it("formatCooldownReason does not reference a specific client (workspace-wide)", () => {
    const reason = formatCooldownReason(new Date("2026-06-01T10:00:00.000Z"));
    expect(reason.toLowerCase()).not.toContain("for this client");
    expect(reason.toLowerCase()).not.toContain("this client");
  });
});
