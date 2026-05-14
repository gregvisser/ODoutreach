import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #136 — UI policy test.
 *
 * Locks in the audit decision that `/reporting` is the single trustworthy
 * operational dashboard. It must:
 *   1. Read live counts only — never depend on ReportingDailySnapshot or
 *      the legacy `getLiveSendReplyStats` 30-day filter (which undercounted
 *      sends).
 *   2. Show no raw enum labels (e.g. "SENT (30d)", "DELIVERED (30d)").
 *   3. Render the "Not tracked" affordance for delivery and opens when the
 *      data does not back the metric.
 *   4. Keep the trustworthy outreach-metrics card path.
 *   5. Render the "What these metrics mean" contract panel so staff have
 *      a single source of truth in-product.
 *
 * Reading the source file as a string lets us assert the policy without
 * spinning up React, Prisma, or auth. No DB or send/sync path is touched
 * by this test.
 */
const reportingPageSource = readFileSync(
  join(process.cwd(), "src", "app", "(app)", "reporting", "page.tsx"),
  "utf8",
);

describe("/reporting UI policy (PR #136)", () => {
  it("does not import the snapshot rollup query that is never written", () => {
    expect(reportingPageSource).not.toContain("getReportingSnapshotsForStaff");
    expect(reportingPageSource).not.toContain(
      "@/server/queries/reporting",
    );
  });

  it("does not import the legacy live-stats helper that undercounted sends", () => {
    expect(reportingPageSource).not.toContain("getLiveSendReplyStats");
    expect(reportingPageSource).not.toContain(
      "@/server/queries/live-stats",
    );
  });

  it("does not import snapshot-driven dashboard charts", () => {
    expect(reportingPageSource).not.toContain("dashboard-charts");
    expect(reportingPageSource).not.toContain("VolumeTrendChart");
    expect(reportingPageSource).not.toContain("ClientPerformanceChart");
  });

  it("imports the live outreach-metrics queries as the single source of truth", () => {
    expect(reportingPageSource).toContain("loadGlobalOutreachMetrics");
    expect(reportingPageSource).toContain("loadClientOutreachMetrics");
    expect(reportingPageSource).toContain("@/server/queries/outreach-metrics");
  });

  it("removes the snapshot-driven header trio (Emails sent (window), Replies, Reply rate)", () => {
    expect(reportingPageSource).not.toContain("Emails sent (window)");
  });

  it("removes the legacy raw-enum '(30d)' live cards", () => {
    expect(reportingPageSource).not.toMatch(/Live —\s*SENT\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*DELIVERED\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*REPLIED\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*BOUNCED\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*FAILED\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*pipeline\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*blocked\s*\(30d\)/);
    expect(reportingPageSource).not.toMatch(/Live —\s*inbound replies\s*\(30d\)/);
  });

  it("does not display raw OutboundEmailStatus enum tokens to staff", () => {
    expect(reportingPageSource).not.toContain('">SENT<');
    expect(reportingPageSource).not.toContain('">DELIVERED<');
    expect(reportingPageSource).not.toContain('">QUEUED<');
    expect(reportingPageSource).not.toContain('">BOUNCED<');
    expect(reportingPageSource).not.toContain('">FAILED<');
    expect(reportingPageSource).not.toContain('">REPLIED<');
    expect(reportingPageSource).not.toContain('">BLOCKED_SUPPRESSION<');
    expect(reportingPageSource).not.toContain('">PROCESSING<');
    expect(reportingPageSource).not.toContain('">REQUESTED<');
    expect(reportingPageSource).not.toContain('">PREPARING<');
  });

  it("removes the snapshot-driven Trend and By-client charts that were always empty", () => {
    expect(reportingPageSource).not.toMatch(/<CardTitle>Trend<\/CardTitle>/);
    expect(reportingPageSource).not.toMatch(/<CardTitle>By client<\/CardTitle>/);
  });

  it("renders the trustworthy outreach-metrics surface", () => {
    expect(reportingPageSource).toContain("Outreach metrics");
    expect(reportingPageSource).toContain("Sent (with provider proof)");
    expect(reportingPageSource).toContain("Queued / preparing");
    expect(reportingPageSource).toContain("Send proof missing");
    expect(reportingPageSource).toContain("Not reached");
  });

  it("surfaces the 'Not tracked' state via formatTrackedMetric for delivery and opens", () => {
    expect(reportingPageSource).toContain("formatTrackedMetric(m.delivered, m.deliveryTracked)");
    expect(reportingPageSource).toContain("formatTrackedMetric(m.opens, m.opensTracked)");
  });

  it("renders the staff-facing metric contract panel", () => {
    expect(reportingPageSource).toContain("What these metrics mean");
    expect(reportingPageSource).toContain(
      "Open tracking is not implemented",
    );
  });

  it("labels the scope (All accessible clients or specific client) and the time window (All-time)", () => {
    expect(reportingPageSource).toContain("All accessible clients");
    expect(reportingPageSource).toContain("All-time");
  });

  it("keeps the per-client breakdown table with staff-friendly column labels", () => {
    expect(reportingPageSource).toContain("Per-client breakdown");
    expect(reportingPageSource).toContain(">Delivery rate<");
    expect(reportingPageSource).toContain(">Reply rate<");
    expect(reportingPageSource).toContain(">Not reached<");
    expect(reportingPageSource).toContain(">Proof missing<");
  });

  it("never imports send / reply / queue / sync action modules", () => {
    expect(reportingPageSource).not.toContain("send-actions");
    expect(reportingPageSource).not.toContain("queue/drain");
    expect(reportingPageSource).not.toContain("syncReplies");
    expect(reportingPageSource).not.toContain("processOutboundQueue");
    expect(reportingPageSource).not.toContain("rocketreach");
  });
});
