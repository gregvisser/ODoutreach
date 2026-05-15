import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #137 — Activity UI policy test.
 *
 * Locks in the audit decisions for `/clients/[clientId]/activity`:
 *   1. The Replies panel is rendered above the sequence timeline (staff
 *      can see reply groups without scrolling past raw events).
 *   2. The sequence timeline is wrapped in `<details>` so it is
 *      collapsed by default (not the page's headline content).
 *   3. The deprecated "Reply from ODoutreach — coming next" placeholder
 *      is gone — replies are now openable.
 *   4. No random-inbox panel is rendered on the staff page.
 *   5. The replies panel exposes an "Open reply" link to the new linked
 *      reply detail route.
 *
 * Reading source as a string keeps this test fast and DB-free.
 */
const activityPageSource = readFileSync(
  join(
    process.cwd(),
    "src",
    "app",
    "(app)",
    "clients",
    "[clientId]",
    "activity",
    "page.tsx",
  ),
  "utf8",
);

const repliesPanelSource = readFileSync(
  join(
    process.cwd(),
    "src",
    "components",
    "activity",
    "client-outreach-replies-panel.tsx",
  ),
  "utf8",
);

const replyDetailComponentSource = readFileSync(
  join(
    process.cwd(),
    "src",
    "components",
    "activity",
    "client-linked-reply-detail.tsx",
  ),
  "utf8",
);

const replyDetailPageSource = readFileSync(
  join(
    process.cwd(),
    "src",
    "app",
    "(app)",
    "clients",
    "[clientId]",
    "activity",
    "replies",
    "[replyId]",
    "page.tsx",
  ),
  "utf8",
);

describe("Client Activity UI policy (PR #137)", () => {
  it("renders the replies panel above the sequence timeline", () => {
    const repliesIdx = activityPageSource.indexOf(
      "<ClientOutreachRepliesPanel",
    );
    const timelineIdx = activityPageSource.indexOf(
      "<ClientActivityTimelinePanel",
    );
    expect(repliesIdx).toBeGreaterThan(-1);
    expect(timelineIdx).toBeGreaterThan(-1);
    expect(repliesIdx).toBeLessThan(timelineIdx);
  });

  it("wraps the timeline in a collapsible <details> block", () => {
    // The timeline must appear inside a <details> element so it is no
    // longer the headline content on the page.
    const detailsIdx = activityPageSource.indexOf("<details");
    const timelineIdx = activityPageSource.indexOf(
      "<ClientActivityTimelinePanel",
    );
    expect(detailsIdx).toBeGreaterThan(-1);
    expect(timelineIdx).toBeGreaterThan(detailsIdx);
  });

  it("does not render the deprecated 'coming next' reply placeholder", () => {
    expect(repliesPanelSource).not.toContain("Reply from ODoutreach — coming next");
    expect(repliesPanelSource).not.toContain("coming next");
  });

  it("does not render a 'Check replies' raw-inbox affordance for staff", () => {
    expect(activityPageSource).not.toContain("Check replies");
    expect(activityPageSource).not.toContain("Raw inbox");
  });

  it("passes the clientId to the replies panel for deep-linking", () => {
    expect(activityPageSource).toContain("clientId={bundle.client.id}");
    expect(repliesPanelSource).toContain("clientId:");
  });

  it("exposes an 'Open reply' link from the replies panel", () => {
    expect(repliesPanelSource).toContain("Open reply");
    expect(repliesPanelSource).toContain(
      "/clients/${clientId}/activity/replies/${r.id}",
    );
  });

  it("reply detail page is wired to the staff query + access helpers", () => {
    expect(replyDetailPageSource).toContain("requireOpensDoorsStaff");
    expect(replyDetailPageSource).toContain("getAccessibleClientIds");
    expect(replyDetailPageSource).toContain("loadClientLinkedReplyDetail");
    // Must call notFound (not throw) so cross-client access never leaks
    // existence of the row.
    expect(replyDetailPageSource).toContain("notFound()");
  });

  it("reply detail UI maps enum statuses through a staff-friendly label helper", () => {
    // The status label helper provides staff-friendly copy. Raw enum
    // values such as PENDING/COMPLETED/PAUSED are switch-mapped to
    // human-readable labels — they must not be rendered directly.
    expect(replyDetailComponentSource).toContain("enrolmentStatusLabel");
    expect(replyDetailComponentSource).toContain("Active follow-ups");
    expect(replyDetailComponentSource).toContain("Stopped (completed)");
    // Direct render of raw status in JSX would look like:
    //   {detail.enrollment.status}
    // The component must transform first via the label helper.
    expect(replyDetailComponentSource).not.toContain(
      "{detail.enrollment.status}",
    );
    expect(replyDetailComponentSource).not.toContain(
      "{detail.reply.matchMethod}",
    );
  });

  it("reply detail surfaces a 'Stop follow-ups' staff action (no email send)", () => {
    expect(replyDetailComponentSource).toContain("Stop follow-ups");
    expect(replyDetailComponentSource).toContain(
      "markEnrollmentCompletedAction",
    );
    expect(replyDetailComponentSource).toContain("pauseEnrollmentAction");
    // Reply-send is delegated to the existing inbox message page, NEVER
    // implemented here as a fresh provider call.
    expect(replyDetailComponentSource).not.toContain(
      "replyToInboundMailboxMessage",
    );
    // No "Resume" action in PR #137 — deferred.
    expect(replyDetailComponentSource).not.toContain("resumeEnrollmentAction");
  });
});
