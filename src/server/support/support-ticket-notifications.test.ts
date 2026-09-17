import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
import { buildSupportResolutionBody, formatSupportResolutionDate } from "./support-ticket-notifications";

describe("support ticket resolution notifications", () => {
  it("formats the recorded time in UK time", () => {
    expect(formatSupportResolutionDate(new Date("2026-07-01T12:30:00.000Z"))).toBe("1 July 2026 at 13:30 UK");
  });

  it("states the fix, timestamp, and provider acceptance boundary", () => {
    const body = buildSupportResolutionBody({
      title: "Unable to send sequence",
      resolutionNote: "Added the missing unsubscribe footer fallback.",
      resolvedAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    expect(body).toContain("Unable to send sequence");
    expect(body).toContain("Added the missing unsubscribe footer fallback.");
    expect(body).toContain("Resolved:");
    expect(body).not.toContain("provider acceptance");
  });
});
