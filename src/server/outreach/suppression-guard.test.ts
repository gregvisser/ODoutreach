import { describe, expect, it, vi } from "vitest";

// suppression-guard imports `@/lib/db` (Prisma). We only test the pure
// classifier here, so stub Prisma out — the classifier never touches it,
// but the import chain must still resolve.
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

import {
  classifySuppressionRefresh,
  type SuppressionDecision,
} from "./suppression-guard";

describe("classifySuppressionRefresh (PR F2)", () => {
  it("returns `skipped_missing_email` when email is null", () => {
    expect(classifySuppressionRefresh(null, null)).toBe(
      "skipped_missing_email",
    );
  });

  it("returns `skipped_missing_email` when email is empty string", () => {
    expect(classifySuppressionRefresh("", null)).toBe("skipped_missing_email");
  });

  it("returns `skipped_missing_email` when email is undefined", () => {
    expect(classifySuppressionRefresh(undefined, null)).toBe(
      "skipped_missing_email",
    );
  });

  it("returns `marked_suppressed` when decision is suppressed", () => {
    const decision: SuppressionDecision = {
      suppressed: true,
      reason: "email_list",
      normalizedEmail: "a@example.com",
      normalizedDomain: "example.com",
      matchedEmail: "a@example.com",
    };
    expect(classifySuppressionRefresh("a@example.com", decision)).toBe(
      "marked_suppressed",
    );
  });

  it("returns `marked_clear` when decision is not suppressed", () => {
    const decision: SuppressionDecision = {
      suppressed: false,
      reason: "none",
      normalizedEmail: "a@example.com",
      normalizedDomain: "example.com",
    };
    expect(classifySuppressionRefresh("a@example.com", decision)).toBe(
      "marked_clear",
    );
  });

  it("null-email path never attempts to look at the decision (belt-and-braces)", () => {
    // Simulate a caller that accidentally passed a stale decision alongside
    // a null email: the classifier must still refuse to call the contact
    // suppressed. This guards against future refactors that might forget
    // to keep the null branch first.
    const staleDecision: SuppressionDecision = {
      suppressed: true,
      reason: "email_list",
      normalizedEmail: "",
      normalizedDomain: "",
    };
    expect(classifySuppressionRefresh(null, staleDecision)).toBe(
      "skipped_missing_email",
    );
  });
});
