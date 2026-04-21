import { describe, expect, it } from "vitest";

import { summarizePilotContacts } from "./pilot-contact-types";

describe("summarizePilotContacts", () => {
  it("counts all contacts as total, suppressed contacts separately", () => {
    const out = summarizePilotContacts([
      { email: "a@x.com", isSuppressed: false },
      { email: "b@x.com", isSuppressed: true },
      { email: "c@x.com", isSuppressed: false },
    ]);
    expect(out.totalContacts).toBe(3);
    expect(out.suppressedCount).toBe(1);
  });

  it("only counts contacts with a non-empty email as eligible", () => {
    const out = summarizePilotContacts([
      { email: "a@x.com", isSuppressed: false },
      { email: null, isSuppressed: false },
      { email: "", isSuppressed: false },
    ]);
    expect(out.eligibleCount).toBe(1);
    expect(out.eligibleEmailsSample).toEqual(["a@x.com"]);
  });

  it("excludes suppressed contacts from eligibility even when they have an email", () => {
    const out = summarizePilotContacts([
      { email: "a@x.com", isSuppressed: true },
      { email: "b@x.com", isSuppressed: false },
    ]);
    expect(out.eligibleCount).toBe(1);
    expect(out.eligibleEmailsSample).toEqual(["b@x.com"]);
  });

  it("excludes a null-email contact from the recipient sample (F1)", () => {
    // Regression guard for PR F1: the pilot panel pre-populates its
    // recipient textarea from this sample. A contact without an email
    // address must never leak into that sample — the send path would
    // otherwise be handed an empty recipient string.
    const out = summarizePilotContacts([
      { email: null, isSuppressed: false },
      { email: "only@x.com", isSuppressed: false },
    ]);
    expect(out.eligibleEmailsSample).toEqual(["only@x.com"]);
    expect(out.eligibleEmailsSample).not.toContain(null);
    expect(out.eligibleEmailsSample.every((e) => typeof e === "string")).toBe(
      true,
    );
  });

  it("caps the sample at the configured size (default 10)", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      email: `c${String(i)}@x.com`,
      isSuppressed: false,
    }));
    const out = summarizePilotContacts(many);
    expect(out.eligibleCount).toBe(25);
    expect(out.eligibleEmailsSample.length).toBe(10);
  });

  it("honours an explicit sampleSize override", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      email: `c${String(i)}@x.com`,
      isSuppressed: false,
    }));
    const out = summarizePilotContacts(many, 2);
    expect(out.eligibleEmailsSample.length).toBe(2);
  });

  it("handles an empty contact list", () => {
    const out = summarizePilotContacts([]);
    expect(out).toEqual({
      totalContacts: 0,
      suppressedCount: 0,
      eligibleCount: 0,
      eligibleEmailsSample: [],
    });
  });
});
