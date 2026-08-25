import { describe, expect, it } from "vitest";

import { readPartialAnnotations } from "./partial-annotations";

/**
 * These are the ACTUAL annotations from run 32896356094, in the ACTUAL order
 * the GitHub REST API returned them — reasons first, the counting line last.
 * That ordering is why this module exists.
 */
const LIVE_ANNOTATIONS = [
  { title: "PARTIAL", message: "reply sync: alex@trainhugger.com: Google token refresh failed: invalid_grant — Bad Request" },
  { title: "PARTIAL", message: "reply sync: taylor@trainhugger.com: Google token refresh failed: invalid_grant — Bad Request" },
  { title: "PARTIAL", message: "reply sync: sam.p@trainhugger.com: Google token refresh failed: invalid_grant — Bad Request" },
  { title: "PARTIAL", message: "reply sync: joe@trainhugger.com: Google token refresh failed: invalid_grant — Bad Request" },
  { title: "PARTIAL", message: "reply sync: cam@trainhugger.com: Google token refresh failed: invalid_grant — Bad Request" },
  { title: "PARTIAL", message: "reply sync partial: 8 of 35 mailboxes failed" },
];

describe("the count does not depend on the order the API returned", () => {
  it("finds the counting line last, where it actually was", () => {
    const detail = readPartialAnnotations(LIVE_ANNOTATIONS);
    expect(detail.failedCount).toBe(8);
    expect(detail.totalCount).toBe(35);
  });

  it("finds it first too", () => {
    const detail = readPartialAnnotations([...LIVE_ANNOTATIONS].reverse());
    expect(detail.failedCount).toBe(8);
    expect(detail.totalCount).toBe(35);
  });
});

describe("a reason cannot be mistaken for the count", () => {
  it("ignores a number pair inside a provider error string", () => {
    // The near miss. The old parser took the first "N of M" it saw anywhere.
    const detail = readPartialAnnotations([
      { title: "PARTIAL", message: "reply sync: jo@x.co.uk: gave up after 2 of 3 attempts" },
      { title: "PARTIAL", message: "reply sync partial: 8 of 35 mailboxes failed" },
    ]);
    expect(detail.failedCount).toBe(8);
    expect(detail.totalCount).toBe(35);
  });

  it("ignores a number pair inside an address", () => {
    const detail = readPartialAnnotations([
      { title: "PARTIAL", message: "reply sync: 3of5@example.com: token expired" },
      { title: "PARTIAL", message: "reply sync partial: 8 of 35 mailboxes failed" },
    ]);
    expect(detail.failedCount).toBe(8);
  });
});

describe("it never under-reports", () => {
  it("takes the highest count when two jobs both reported one", () => {
    // Picking the smaller number would tell Greg a smaller problem than the
    // one he has. Under-reporting a failure is the mistake that started this.
    const detail = readPartialAnnotations([
      { title: "PARTIAL", message: "sending partial: 2 of 40 items failed" },
      { title: "PARTIAL", message: "reply sync partial: 8 of 35 mailboxes failed" },
    ]);
    expect(detail.failedCount).toBe(8);
    expect(detail.totalCount).toBe(35);
  });

  it("reads a count with no total", () => {
    const detail = readPartialAnnotations([
      { title: "PARTIAL", message: "sending partial: 3 items failed" },
    ]);
    expect(detail.failedCount).toBe(3);
    expect(detail.totalCount).toBeUndefined();
  });
});

describe("the reasons are the reasons", () => {
  it("does not repeat the counting line as a reason", () => {
    // It is already in the subject and on the job's own line. A third copy
    // pushes an actual reason out of the email.
    const detail = readPartialAnnotations(LIVE_ANNOTATIONS);
    expect(detail.reasons).toHaveLength(5);
    expect(detail.reasons.join("\n")).not.toContain("8 of 35");
    expect(detail.reasons[0]).toContain("alex@trainhugger.com");
  });

  it("caps them, so one bad run cannot flood the email", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      title: "PARTIAL",
      message: `reply sync: user${i}@example.com: token expired`,
    }));
    expect(readPartialAnnotations(many).reasons.length).toBeLessThanOrEqual(10);
  });

  it("ignores annotations that are not ours, and empty ones", () => {
    const detail = readPartialAnnotations([
      { title: "warning", message: "reply sync partial: 99 of 99 mailboxes failed" },
      { title: "PARTIAL", message: "   " },
      { title: "PARTIAL" },
      { title: "PARTIAL", message: "reply sync partial: 8 of 35 mailboxes failed" },
    ]);
    expect(detail.failedCount).toBe(8);
    expect(detail.reasons).toEqual([]);
  });

  it("returns nothing rather than throwing on an empty list", () => {
    const detail = readPartialAnnotations([]);
    expect(detail.failedCount).toBeUndefined();
    expect(detail.reasons).toEqual([]);
  });
});
