import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DAILY_OUTREACH_WORKFLOW,
  STAFF_HANDOVER_CHECKLIST,
  STAFF_VIDEO_SCRIPTS,
  TRAINING_MODULES,
  getTrainingModule,
} from "@/lib/training/modules";

/**
 * PR #139 — Training must reflect the post-PR-135 + post-PR-138 reality.
 *
 *   - Sidebar no longer advertises Dashboard or Admin Operations (PR #135).
 *   - Sidebar no longer advertises a global "Contacts" entry (PR #138 G10).
 *   - The client subnav is "Lists", not "Contacts" (PR #138 G10a).
 *   - The client subnav says "Do-not-contact", not "Suppression" (PR #138 G10b).
 *
 * No claims that aren't true: no fake embedded videos, no missing module ids,
 * no broken portal hrefs. We also lock in the 11-step staff handover checklist
 * the audit programme commits to.
 */

const TRAINING_INDEX_PATH = join(process.cwd(), "src/app/(app)/training/page.tsx");
const TRAINING_INDEX_SOURCE = readFileSync(TRAINING_INDEX_PATH, "utf8");

const SIDEBAR_SCREENSHOT_FORBIDDEN_TERMS = [
  "Dashboard",
  "Operations,",
  // PR #138: the sidebar no longer advertises a global Contacts entry.
] as const;

describe("Training content alignment (PR #139)", () => {
  it("does not claim embedded videos exist", () => {
    const m = TRAINING_MODULES.flatMap((mod) => [mod.purpose, ...mod.steps.map((s) => s.detail)]).join(
      "\n",
    );
    expect(m).not.toMatch(/watch the video/i);
    expect(m).not.toMatch(/embedded video/i);
    expect(m).not.toMatch(/youtu\.?be/i);
    expect(m).not.toMatch(/vimeo\.com/i);
  });

  it("Settings module sidebar caption reflects the PR #135 + PR #138 sidebar", () => {
    const settings = getTrainingModule("settings");
    expect(settings).not.toBeNull();
    const sidebarShot = settings!.screenshots.find((s) =>
      s.alt.toLowerCase().includes("sidebar"),
    );
    expect(sidebarShot).toBeDefined();
    // Must include the current sidebar entries.
    for (const entry of ["Reports", "Universe", "Blocked contacts", "Training"]) {
      expect(sidebarShot!.alt).toContain(entry);
    }
    // Must not mention removed sidebar entries.
    for (const removed of SIDEBAR_SCREENSHOT_FORBIDDEN_TERMS) {
      expect(sidebarShot!.alt).not.toContain(removed);
    }
  });

  it("Lists module replaced the old Contacts-tab module (PR #138 G10a)", () => {
    const m = getTrainingModule("contacts");
    expect(m).not.toBeNull();
    expect(m!.title).toContain("Lists");
    expect(m!.steps.some((s) => s.title.includes("Open Lists"))).toBe(true);
    expect(m!.portalLink.label).toContain("Lists");
  });

  it("Do-not-contact module replaced the old Suppression module title (PR #138 G10b)", () => {
    const m = getTrainingModule("suppression");
    expect(m).not.toBeNull();
    expect(m!.title).toContain("Do-not-contact");
    expect(m!.portalLink.label).toContain("Do-not-contact");
    // Connection-status copy must use the staff-friendly label, not the raw enum.
    const detail = m!.steps.map((s) => s.detail).join("\n");
    expect(detail).toContain("Last sync succeeded");
    expect(detail).not.toMatch(/\bEMAIL · SUCCESS\b/);
  });

  // Was "Onboarding module workflow strip uses the post-PR-138 sub-nav names".
  // The names were right; the thing they were attached to was deleted by PR
  // #247. The seven destinations and their order survive on the Launch
  // readiness panel, so the sequence assertion still earns its place — it is
  // now anchored to the panel that actually renders it.
  it("Onboarding module lists the seven readiness modules in panel order", () => {
    const m = getTrainingModule("onboarding");
    expect(m).not.toBeNull();
    const workflowStep = m!.steps.find((s) => s.title === "Click Create workspace");
    expect(workflowStep?.detail).toContain("Brief, Mailboxes, Sources, Do-not-contact, Lists, Outreach, Activity");
    expect(workflowStep?.detail).toContain("Launch readiness");
  });

  it("Mailboxes module no longer carries 'authorised operator' dev jargon (PR #117 superseded)", () => {
    const m = getTrainingModule("mailboxes");
    expect(m).not.toBeNull();
    const everything = [
      m!.purpose,
      ...(m!.details ?? []),
      ...m!.steps.map((s) => s.detail),
    ].join("\n");
    expect(everything).not.toContain("authorised operator");
    expect(everything).not.toContain("shared sending pool");
    expect(everything).not.toContain("Tokens are stored");
  });

  it("Daily outreach workflow includes the post-PR-137 stop-follow-ups step", () => {
    expect(DAILY_OUTREACH_WORKFLOW.join("\n")).toMatch(/Stop follow-ups/i);
  });

  it("STAFF_HANDOVER_CHECKLIST has at least the 11 audit-committed items", () => {
    expect(STAFF_HANDOVER_CHECKLIST.length).toBeGreaterThanOrEqual(11);
    const steps = STAFF_HANDOVER_CHECKLIST.map((c) => c.step);
    for (const required of [
      "Understand Reports",
      "Add / import contacts through Sources",
      "Use Universe",
      "Create / open lists",
      "Create a sequence",
      "Review recipients",
      "Launch sequence",
      "Read replies",
      "Stop follow-ups after replies",
      "Check Do-not-contact",
      "Check mailbox status",
    ]) {
      expect(steps).toContain(required);
    }
  });

  it("Training index page renders the handover checklist", () => {
    expect(TRAINING_INDEX_SOURCE).toContain("STAFF_HANDOVER_CHECKLIST");
    expect(TRAINING_INDEX_SOURCE).toContain("Staff handover checklist");
  });
});

/**
 * PR #247 deleted the numbered "Workflow" pill strip from the client Overview
 * (`client-overview-ui-policy.test.ts` holds that line). It did NOT touch the
 * training, so for three months the staff training taught a screen element that
 * no longer renders — including a "what good looks like" bullet instructing an
 * operator to confirm the strip is VISIBLE, a check that cannot pass.
 *
 * This is the drift the product is worst at: the UI moved, the thing describing
 * the UI reported success, and nothing connected the two. The guard below is
 * anchored to the command-centre SOURCE, not to a hardcoded verdict — if the
 * strip ever legitimately comes back, the anchor fails first and tells you to
 * re-teach it, rather than silently permitting stale copy again.
 */
const COMMAND_CENTRE_SOURCE = readFileSync(
  join(process.cwd(), "src/components/clients/client-workspace-command-center.tsx"),
  "utf8",
);

/** Every operator-visible string the training ships, from all three surfaces. */
function allTrainingCopy(): string {
  const moduleCopy = TRAINING_MODULES.flatMap((m) => [
    m.title,
    m.tagline,
    m.purpose,
    ...(m.details ?? []),
    ...m.screenshots.flatMap((s) => [s.alt, s.caption ?? ""]),
    ...m.steps.flatMap((s) => [s.title, s.detail]),
    ...m.whatGoodLooksLike,
    ...m.commonMistakes,
    ...m.outcomes,
  ]);
  const scriptCopy = STAFF_VIDEO_SCRIPTS.flatMap((s) => [
    s.title,
    s.subtitle,
    ...s.script,
    ...s.checklist,
  ]);
  return [...moduleCopy, ...scriptCopy].join("\n");
}

describe("training does not teach UI that was deleted (PR #247 drift)", () => {
  it("the numbered Workflow pill strip really is gone from the Overview", () => {
    // The anchor. If this fails, the premise of the test below changed.
    expect(COMMAND_CENTRE_SOURCE).not.toContain("ClientWorkflowStrip");
  });

  it("no training copy tells staff to look for a workflow strip", () => {
    const offenders = allTrainingCopy()
      .split("\n")
      .filter((line) => /workflow strip|7-step/i.test(line));
    expect(offenders, "training copy names a UI element deleted in PR #247").toEqual([]);
  });

  it("no training screenshot is captioned as showing the strip", () => {
    const captions = TRAINING_MODULES.flatMap((m) =>
      m.screenshots.flatMap((s) => [s.alt, s.caption ?? ""]),
    );
    for (const caption of captions) {
      expect(caption).not.toMatch(/workflow strip|7-step/i);
    }
  });

  it("training calls the workspace identifier what the form calls it", () => {
    // The form label is "Workspace ID *"; the training said "slug" in six
    // places. Found because the regenerated screenshot renders "Workspace ID"
    // next to prose telling the operator to check the "slug".
    const newClientForm = readFileSync(
      join(process.cwd(), "src/app/(app)/clients/new/onboarding-form.tsx"),
      "utf8",
    );
    expect(newClientForm).toContain("Workspace ID");

    const offenders = allTrainingCopy()
      .split("\n")
      .filter((line) => /\bslugs?\b/i.test(line));
    expect(offenders, "training says 'slug'; the form says 'Workspace ID'").toEqual([]);
  });

  it("the Overview module teaches the two lists that actually render", () => {
    const onboarding = getTrainingModule("onboarding");
    expect(onboarding).not.toBeNull();
    const copy = [
      ...onboarding!.steps.map((s) => s.detail),
      ...onboarding!.whatGoodLooksLike,
    ].join("\n");
    // The tab row is the navigation; Launch readiness is the status.
    expect(copy).toMatch(/Launch readiness/);
    expect(copy).toMatch(/tab row|tabs along the top/i);
  });
});
