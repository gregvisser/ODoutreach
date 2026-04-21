import { describe, it, expect } from "vitest";

import type { ContactReadinessStatusLabel } from "@/lib/client-contacts-readiness";

import {
  getContactStatusDisplay,
  MISSING_EMAIL_KPI_DISPLAY,
  MISSING_IDENTIFIER_KPI_DISPLAY,
} from "./contact-status-display";

describe("getContactStatusDisplay", () => {
  it("maps email_sendable to the primary badge", () => {
    const display = getContactStatusDisplay("email_sendable");
    expect(display.label).toBe("Email-sendable");
    expect(display.badgeVariant).toBe("default");
    expect(display.tooltip).toMatch(/email/i);
  });

  it("maps valid_no_email to the secondary badge with a no-email tooltip", () => {
    const display = getContactStatusDisplay("valid_no_email");
    expect(display.label).toBe("Valid, no email");
    expect(display.badgeVariant).toBe("secondary");
    expect(display.tooltip).toMatch(/LinkedIn|phone/i);
    expect(display.tooltip).toMatch(/no email/i);
  });

  it("maps suppressed to the destructive badge", () => {
    const display = getContactStatusDisplay("suppressed");
    expect(display.label).toBe("Suppressed");
    expect(display.badgeVariant).toBe("destructive");
    expect(display.tooltip).toMatch(/suppression/i);
  });

  it("maps missing_identifier to the outline badge", () => {
    const display = getContactStatusDisplay("missing_identifier");
    expect(display.label).toBe("Missing identifier");
    expect(display.badgeVariant).toBe("outline");
    expect(display.tooltip).toMatch(/email.*LinkedIn|LinkedIn.*email/i);
  });

  it("returns a display entry for every canonical readiness status label", () => {
    const all: ContactReadinessStatusLabel[] = [
      "email_sendable",
      "valid_no_email",
      "suppressed",
      "missing_identifier",
    ];
    for (const status of all) {
      const display = getContactStatusDisplay(status);
      expect(display.label.length).toBeGreaterThan(0);
      expect(display.tooltip.length).toBeGreaterThan(0);
      expect([
        "default",
        "secondary",
        "destructive",
        "outline",
      ]).toContain(display.badgeVariant);
    }
  });

  it("keeps KPI copy consistent with per-contact badges", () => {
    expect(MISSING_EMAIL_KPI_DISPLAY.label).toBe("Missing email");
    expect(MISSING_EMAIL_KPI_DISPLAY.tooltip).toMatch(/no email on file/i);
    expect(MISSING_IDENTIFIER_KPI_DISPLAY.label).toBe("Missing identifier");
    expect(MISSING_IDENTIFIER_KPI_DISPLAY.tooltip).toMatch(/no email/i);
  });
});
