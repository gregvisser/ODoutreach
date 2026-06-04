import { describe, expect, it } from "vitest";

import {
  CLIENT_OUTREACH_COOLDOWN_DAYS,
  dateWhenContactEligibleAgain,
  formatCooldownReason,
  isContactInCooldown,
} from "./recent-send-cooldown";

describe("recent-send-cooldown", () => {
  it("defaults the cooldown window to 28 days", () => {
    expect(CLIENT_OUTREACH_COOLDOWN_DAYS).toBe(28);
  });

  it("computes the eligible-again date by adding the cooldown to lastSentAt", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const eligible = dateWhenContactEligibleAgain(lastSentAt);
    expect(eligible.toISOString()).toBe("2026-06-29T10:00:00.000Z");
  });

  it("does not mutate the input date when computing eligible-again", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const before = lastSentAt.getTime();
    dateWhenContactEligibleAgain(lastSentAt);
    expect(lastSentAt.getTime()).toBe(before);
  });

  it("isContactInCooldown returns false when lastSentAt is null/undefined", () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    expect(isContactInCooldown(null, now)).toBe(false);
    expect(isContactInCooldown(undefined, now)).toBe(false);
  });

  it("isContactInCooldown returns true within the window", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-06-15T10:00:00.000Z"); // 14 days later
    expect(isContactInCooldown(lastSentAt, now)).toBe(true);
  });

  it("isContactInCooldown returns false on the exact boundary (cooldownDays later)", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-06-29T10:00:00.000Z"); // exactly 28 days
    expect(isContactInCooldown(lastSentAt, now)).toBe(false);
  });

  it("isContactInCooldown returns false past the window", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-07-15T10:00:00.000Z");
    expect(isContactInCooldown(lastSentAt, now)).toBe(false);
  });

  it("formatCooldownReason embeds both the last-sent and eligible-again dates", () => {
    const lastSentAt = new Date("2026-06-01T10:00:00.000Z");
    const reason = formatCooldownReason(lastSentAt);
    expect(reason).toContain("2026-06-01");
    expect(reason).toContain("2026-06-29");
    expect(reason).toContain("28-day cooldown");
  });
});
