import { describe, expect, it } from "vitest";

import {
  buildEnrollmentPreview,
  checkEnrollmentReadiness,
  classifyEnrollmentCandidate,
  type EnrollableContact,
} from "./enrollment-policy";

function c(
  id: string,
  overrides: Partial<EnrollableContact> = {},
): EnrollableContact {
  return {
    contactId: id,
    email: `${id}@example.com`,
    linkedIn: null,
    mobilePhone: null,
    officePhone: null,
    isSuppressed: false,
    ...overrides,
  };
}

describe("classifyEnrollmentCandidate", () => {
  it("marks suppressed contacts as suppressed", () => {
    expect(classifyEnrollmentCandidate(c("a", { isSuppressed: true }))).toEqual({
      contactId: "a",
      classification: "suppressed",
    });
  });

  it("marks contacts with email as enrollable", () => {
    expect(classifyEnrollmentCandidate(c("a"))).toEqual({
      contactId: "a",
      classification: "enrollable",
    });
  });

  it("marks contacts with no email but with LinkedIn as missing_email", () => {
    const cand = c("a", { email: null, linkedIn: "https://li/x" });
    expect(classifyEnrollmentCandidate(cand)).toEqual({
      contactId: "a",
      classification: "missing_email",
    });
  });

  it("marks contacts with no identifiers as missing_identifier", () => {
    const cand = c("a", {
      email: null,
      linkedIn: null,
      mobilePhone: null,
      officePhone: null,
    });
    expect(classifyEnrollmentCandidate(cand)).toEqual({
      contactId: "a",
      classification: "missing_identifier",
    });
  });

  it("suppressed dominates over missing fields", () => {
    const cand = c("a", {
      isSuppressed: true,
      email: null,
      linkedIn: null,
    });
    expect(
      classifyEnrollmentCandidate(cand).classification,
    ).toBe("suppressed");
  });
});

describe("buildEnrollmentPreview", () => {
  it("splits candidates into enrollable / skipped buckets with counts", () => {
    const preview = buildEnrollmentPreview({
      candidates: [
        c("ok1"),
        c("ok2"),
        c("supp", { isSuppressed: true }),
        c("noemail", { email: null, linkedIn: "x" }),
        c("noid", {
          email: null,
          linkedIn: null,
          mobilePhone: null,
          officePhone: null,
        }),
      ],
      alreadyEnrolledContactIds: [],
    });
    expect(preview.total).toBe(5);
    expect(preview.enrollable).toBe(2);
    expect(preview.enrollableContactIds).toEqual(["ok1", "ok2"]);
    expect(preview.alreadyEnrolled).toBe(0);
    expect(preview.suppressed).toBe(1);
    expect(preview.missingEmail).toBe(1);
    expect(preview.missingIdentifier).toBe(1);
    expect(preview.skipped.map((s) => s.contactId).sort()).toEqual([
      "noemail",
      "noid",
      "supp",
    ]);
  });

  it("excludes already-enrolled contacts from enrollable bucket (idempotent)", () => {
    const preview = buildEnrollmentPreview({
      candidates: [c("ok1"), c("ok2"), c("ok3")],
      alreadyEnrolledContactIds: ["ok1", "ok3"],
    });
    expect(preview.enrollable).toBe(1);
    expect(preview.enrollableContactIds).toEqual(["ok2"]);
    expect(preview.alreadyEnrolled).toBe(2);
    expect(preview.total).toBe(3);
  });

  it("ignores duplicate contact ids in the candidate feed", () => {
    const preview = buildEnrollmentPreview({
      candidates: [c("ok1"), c("ok1"), c("ok1")],
      alreadyEnrolledContactIds: [],
    });
    expect(preview.total).toBe(1);
    expect(preview.enrollable).toBe(1);
  });

  it("never promotes an already-enrolled contact just because they are enrollable", () => {
    const preview = buildEnrollmentPreview({
      candidates: [c("already")],
      alreadyEnrolledContactIds: new Set(["already"]),
    });
    expect(preview.enrollable).toBe(0);
    expect(preview.alreadyEnrolled).toBe(1);
  });
});

describe("checkEnrollmentReadiness", () => {
  const zero = {
    total: 0,
    enrollable: 0,
    alreadyEnrolled: 0,
    suppressed: 0,
    missingEmail: 0,
    missingIdentifier: 0,
  };
  it("blocks DRAFT sequences", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "DRAFT",
        preview: { ...zero, total: 5, enrollable: 5 },
      }).reason,
    ).toBe("sequence_not_approval_ready");
  });
  it("blocks ARCHIVED sequences", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "ARCHIVED",
        preview: { ...zero, total: 5, enrollable: 5 },
      }).reason,
    ).toBe("sequence_archived");
  });
  it("blocks when no candidates exist", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "APPROVED",
        preview: zero,
      }).reason,
    ).toBe("no_candidates");
  });
  it("blocks when no email-sendable candidates", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "APPROVED",
        preview: { ...zero, total: 3, suppressed: 3 },
      }).reason,
    ).toBe("no_email_sendable");
  });
  it("allows ready sequences with >=1 enrollable candidate", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "APPROVED",
        preview: { ...zero, total: 3, enrollable: 2 },
      }),
    ).toEqual({ ok: true, reason: "ready" });
  });
  it("READY_FOR_REVIEW is also allowed", () => {
    expect(
      checkEnrollmentReadiness({
        sequenceStatus: "READY_FOR_REVIEW",
        preview: { ...zero, total: 3, enrollable: 2 },
      }).ok,
    ).toBe(true);
  });
});
