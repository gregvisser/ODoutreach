import { describe, expect, it } from "vitest";

import {
  WORKSPACE_RECOVERY_WINDOW_DAYS,
  isWithinRecoveryWindow,
  recoveryDaysRemaining,
  recoveryDeadline,
  workspaceDeletionConfirmationMatches,
} from "./workspace-deletion-confirm";

describe("workspaceDeletionConfirmationMatches", () => {
  it("matches an exact name (after trimming the typed input)", () => {
    expect(workspaceDeletionConfirmationMatches("Acme Ltd", "Acme Ltd")).toBe(true);
    expect(workspaceDeletionConfirmationMatches("  Acme Ltd  ", "Acme Ltd")).toBe(true);
  });

  it("is case- and spacing-sensitive (no accidental near-misses)", () => {
    expect(workspaceDeletionConfirmationMatches("acme ltd", "Acme Ltd")).toBe(false);
    expect(workspaceDeletionConfirmationMatches("Acme  Ltd", "Acme Ltd")).toBe(false);
    expect(workspaceDeletionConfirmationMatches("Acme", "Acme Ltd")).toBe(false);
  });

  it("never matches empty input", () => {
    expect(workspaceDeletionConfirmationMatches("", "Acme Ltd")).toBe(false);
    expect(workspaceDeletionConfirmationMatches("   ", "Acme Ltd")).toBe(false);
    expect(workspaceDeletionConfirmationMatches("Acme Ltd", "")).toBe(false);
  });
});

describe("recovery window", () => {
  const deletedAt = new Date("2026-06-01T00:00:00.000Z");

  it("deadline is exactly the window length after deletion", () => {
    const expected = new Date(
      deletedAt.getTime() + WORKSPACE_RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(recoveryDeadline(deletedAt).toISOString()).toBe(expected.toISOString());
  });

  it("is within the window on the day of deletion and out after the deadline", () => {
    expect(isWithinRecoveryWindow(deletedAt, new Date("2026-06-10T00:00:00.000Z"))).toBe(true);
    expect(isWithinRecoveryWindow(deletedAt, new Date("2026-07-10T00:00:00.000Z"))).toBe(false);
  });

  it("reports whole days remaining, clamped at zero", () => {
    expect(recoveryDaysRemaining(deletedAt, new Date("2026-06-01T00:00:00.000Z"))).toBe(
      WORKSPACE_RECOVERY_WINDOW_DAYS,
    );
    expect(recoveryDaysRemaining(deletedAt, new Date("2026-06-21T00:00:00.000Z"))).toBe(10);
    expect(recoveryDaysRemaining(deletedAt, new Date("2026-08-01T00:00:00.000Z"))).toBe(0);
  });
});
