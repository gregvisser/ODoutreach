import { describe, expect, it } from "vitest";

import {
  classifyContactReadiness,
  readinessStatusLabel,
  summarizeContactReadiness,
} from "./client-contacts-readiness";

describe("classifyContactReadiness", () => {
  it("treats a contact with email and no suppression as valid and email-sendable", () => {
    const r = classifyContactReadiness({
      email: "op@example.com",
      isSuppressed: false,
    });
    expect(r.hasEmail).toBe(true);
    expect(r.hasAnyOutreachIdentifier).toBe(true);
    expect(r.isValid).toBe(true);
    expect(r.isEmailSendable).toBe(true);
    expect(readinessStatusLabel(r)).toBe("email_sendable");
  });

  it("treats a contact with only LinkedIn as valid but not email-sendable", () => {
    const r = classifyContactReadiness({
      email: null,
      linkedIn: "https://linkedin.com/in/op",
      isSuppressed: false,
    });
    expect(r.hasEmail).toBe(false);
    expect(r.hasLinkedIn).toBe(true);
    expect(r.isValid).toBe(true);
    expect(r.isEmailSendable).toBe(false);
    expect(readinessStatusLabel(r)).toBe("valid_no_email");
  });

  it("treats a contact with only a mobile phone as valid but not email-sendable", () => {
    const r = classifyContactReadiness({
      email: "",
      mobilePhone: "+44 7000 000000",
      isSuppressed: false,
    });
    expect(r.isValid).toBe(true);
    expect(r.isEmailSendable).toBe(false);
    expect(readinessStatusLabel(r)).toBe("valid_no_email");
  });

  it("treats a contact with only an office phone as valid but not email-sendable", () => {
    const r = classifyContactReadiness({
      officePhone: "+44 20 0000 0000",
      isSuppressed: false,
    });
    expect(r.isValid).toBe(true);
    expect(r.isEmailSendable).toBe(false);
    expect(r.hasOfficePhone).toBe(true);
    expect(readinessStatusLabel(r)).toBe("valid_no_email");
  });

  it("treats a suppressed contact as neither valid nor email-sendable even with email", () => {
    const r = classifyContactReadiness({
      email: "op@example.com",
      isSuppressed: true,
    });
    expect(r.isSuppressed).toBe(true);
    expect(r.isValid).toBe(false);
    expect(r.isEmailSendable).toBe(false);
    expect(readinessStatusLabel(r)).toBe("suppressed");
  });

  it("treats a contact with no identifiers at all as missing-identifier", () => {
    const r = classifyContactReadiness({
      email: "",
      linkedIn: null,
      mobilePhone: "   ",
      officePhone: undefined,
      isSuppressed: false,
    });
    expect(r.hasAnyOutreachIdentifier).toBe(false);
    expect(r.isValid).toBe(false);
    expect(r.isEmailSendable).toBe(false);
    expect(readinessStatusLabel(r)).toBe("missing_identifier");
  });

  it("ignores whitespace-only values when checking identifiers", () => {
    const r = classifyContactReadiness({
      email: "   ",
      linkedIn: "",
      isSuppressed: false,
    });
    expect(r.hasEmail).toBe(false);
    expect(r.hasAnyOutreachIdentifier).toBe(false);
    expect(r.isValid).toBe(false);
  });
});

describe("summarizeContactReadiness", () => {
  it("aggregates readiness counts across a mixed set", () => {
    const summary = summarizeContactReadiness([
      { email: "a@example.com", isSuppressed: false },
      { email: "b@example.com", isSuppressed: true },
      { email: null, linkedIn: "https://linkedin.com/in/c", isSuppressed: false },
      { email: "", mobilePhone: "+44 7000 000000", isSuppressed: false },
      { email: "", linkedIn: "", mobilePhone: "", isSuppressed: false },
      { email: "e@example.com", isSuppressed: false },
    ]);

    expect(summary.total).toBe(6);
    expect(summary.valid).toBe(4);
    expect(summary.emailSendable).toBe(2);
    expect(summary.suppressed).toBe(1);
    expect(summary.missingEmail).toBe(3);
    expect(summary.missingOutreachIdentifier).toBe(1);
  });

  it("returns all-zero counts for an empty set", () => {
    const summary = summarizeContactReadiness([]);
    expect(summary).toEqual({
      total: 0,
      valid: 0,
      emailSendable: 0,
      suppressed: 0,
      missingEmail: 0,
      missingOutreachIdentifier: 0,
    });
  });

  it("never double-counts a suppressed contact as missing-email or missing-identifier", () => {
    const summary = summarizeContactReadiness([
      { email: "", isSuppressed: true },
      { email: "x@example.com", isSuppressed: true },
    ]);
    expect(summary.suppressed).toBe(2);
    expect(summary.missingEmail).toBe(0);
    expect(summary.missingOutreachIdentifier).toBe(0);
    expect(summary.valid).toBe(0);
    expect(summary.emailSendable).toBe(0);
  });
});
