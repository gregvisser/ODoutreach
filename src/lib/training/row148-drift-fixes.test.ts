import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OPENSDOORS_TRAINING_EXAMPLE,
  STAFF_HANDOVER_CHECKLIST,
  STAFF_VIDEO_SCRIPTS,
  TRAINING_MODULES,
  getTrainingModule,
} from "@/lib/training/modules";
import { STAFF_HANDOVER_SECTIONS } from "@/lib/training/staff-handover-guide";

/**
 * Row 148 (cycle 207) — fixes the twelve drift defects row 134 (cycle 192)
 * confirmed against the live product, plus the two row 136 (cycle 197) found
 * in the same class. See docs/ops/ROW134-FOUR-QUESTIONS-2026-08-31-cycle192.md
 * and docs/ops/ROW136-SCREEN-WALK-PART2-2026-08-31-cycle197.md for the
 * evidence. One `it` per finding, numbered to match the queue row.
 */

const TRAINING_INDEX_SOURCE = readFileSync(
  join(process.cwd(), "src/app/(app)/training/page.tsx"),
  "utf8",
);

function allModuleCopy(): string {
  return TRAINING_MODULES.flatMap((m) => [
    m.title,
    m.tagline,
    m.purpose,
    ...(m.details ?? []),
    ...m.screenshots.flatMap((s) => [s.alt, s.caption ?? ""]),
    ...m.steps.flatMap((s) => [s.title, s.detail]),
    ...m.whatGoodLooksLike,
    ...m.commonMistakes,
    ...m.outcomes,
  ]).join("\n");
}

function allOperatorFacingCopy(): string {
  const scriptCopy = STAFF_VIDEO_SCRIPTS.flatMap((s) => [s.title, s.subtitle, ...s.script, ...s.checklist]);
  const checklistCopy = STAFF_HANDOVER_CHECKLIST.flatMap((c) => [c.step, c.detail]);
  const guideCopy = STAFF_HANDOVER_SECTIONS.flatMap((s) => [s.title, ...s.bullets]);
  return [allModuleCopy(), ...scriptCopy, ...checklistCopy, ...guideCopy].join("\n");
}

describe("Row 148 finding 1 — worked example no longer teaches the {{email_signature}} regression", () => {
  it("the OpensDoors worked-example template body does not contain {{email_signature}}", () => {
    expect(OPENSDOORS_TRAINING_EXAMPLE.template.body).not.toContain("{{email_signature}}");
  });
});

describe("Row 148 finding 2 — Sources module states email is required for persistence", () => {
  it("no longer claims a LinkedIn/phone-only row is imported", () => {
    const sources = getTrainingModule("sources");
    expect(sources).not.toBeNull();
    const copy = [...(sources!.details ?? []), ...sources!.steps.map((s) => s.detail)].join("\n");
    expect(copy).not.toContain(
      "They are ready-to-email only if they also have an email address — only ready-to-email contacts are included in sends.",
    );
    expect(copy.toLowerCase()).toContain("skipped");
  });
});

describe("Row 148 finding 3 — mailbox connect/reconnect/signature editing is not described as admin-only", () => {
  it("modules.ts no longer says an admin presses Connect or pastes the signature", () => {
    const mailboxes = getTrainingModule("mailboxes");
    expect(mailboxes).not.toBeNull();
    const copy = [...(mailboxes!.details ?? []), ...mailboxes!.steps.map((s) => s.detail), ...mailboxes!.commonMistakes].join(
      "\n",
    );
    expect(copy).not.toMatch(/an admin presses Connect/i);
    expect(copy).not.toMatch(/an admin pastes the approved signature/i);
  });

  it("staff-handover-guide.ts no longer says signatures/mailbox setup are administrator-only", () => {
    const copy = STAFF_HANDOVER_SECTIONS.flatMap((s) => s.bullets).join("\n");
    expect(copy).not.toContain("full signatures are configured by administrators");
    expect(copy).not.toContain(
      "Administrators configure connected mailboxes, full branded signatures/disclaimers, and proof sends from Mailboxes (advanced); operators review connection status and capacity.",
    );
  });
});

describe("Row 148 finding 4 — Activity module describes per-client Activity only", () => {
  it("does not tell staff to use a sidebar link to a cross-client Activity feed", () => {
    const activity = getTrainingModule("activity");
    expect(activity).not.toBeNull();
    const copy = [activity!.purpose, ...activity!.steps.map((s) => s.detail), ...activity!.whatGoodLooksLike].join("\n");
    expect(copy).not.toMatch(/cross-client feed with workspace filter pills/i);
    expect(copy).not.toMatch(/global activity view/i);
  });

  it("the module's own portal link does not point at the admin-only global /activity route", () => {
    const activity = getTrainingModule("activity");
    expect(activity).not.toBeNull();
    expect(activity!.portalLink.href).not.toBe("/activity");
  });
});

describe("Row 148 finding 5 — Setup help tab is documented everywhere the tab row is listed", () => {
  it("onboarding module's tab-row description includes Setup help", () => {
    const onboarding = getTrainingModule("onboarding");
    expect(onboarding).not.toBeNull();
    const step = onboarding!.steps.find((s) => s.title === "Click Create workspace");
    expect(step?.detail).toContain("Setup help");
    // The seven launch-readiness modules are a different, narrower list — must survive unchanged.
    expect(step?.detail).toContain("Brief, Mailboxes, Sources, Do-not-contact, Lists, Outreach, Activity");
  });

  it("settings module's per-client list includes Setup help", () => {
    const settings = getTrainingModule("settings");
    expect(settings).not.toBeNull();
    expect(settings!.purpose).toContain("Setup help");
  });

  it("staff-handover-guide.ts lists Setup help among normal-staff tabs", () => {
    const copy = STAFF_HANDOVER_SECTIONS.flatMap((s) => s.bullets).join("\n");
    expect(copy).toContain("Setup help");
  });
});

describe("Row 148 finding 6 — Outreach module no longer conflates template authoring with the Outreach tab", () => {
  it("says templates are created on the Templates tab, not Outreach", () => {
    const outreach = getTrainingModule("outreach");
    expect(outreach).not.toBeNull();
    const copy = [outreach!.purpose, ...outreach!.steps.map((s) => s.detail)].join("\n");
    expect(copy).toMatch(/Templates tab/);
  });
});

describe("Row 148 finding 7 — internal verification is taught on Mailboxes, not Outreach", () => {
  it("Outreach module no longer teaches internal verification as an Outreach step", () => {
    const outreach = getTrainingModule("outreach");
    expect(outreach).not.toBeNull();
    const copy = [...outreach!.steps.map((s) => s.detail), ...outreach!.whatGoodLooksLike].join("\n");
    expect(copy).not.toMatch(/internal verification to an allowlisted address/i);
    expect(copy).not.toMatch(/allowlisted inbox/i);
  });

  it("Mailboxes module teaches the verification-email card that actually renders there", () => {
    const mailboxes = getTrainingModule("mailboxes");
    expect(mailboxes).not.toBeNull();
    const copy = mailboxes!.steps.map((s) => s.detail).join("\n");
    expect(copy).toMatch(/verification email/i);
  });
});

describe("Row 148 finding 8 — sidebar screenshot lists the current sidebar", () => {
  it("includes Replies to answer, Google logins and Support; no longer lists Activity", () => {
    const settings = getTrainingModule("settings");
    expect(settings).not.toBeNull();
    const sidebarShot = settings!.screenshots.find((s) => s.alt.toLowerCase().includes("sidebar"));
    expect(sidebarShot).toBeDefined();
    for (const entry of ["Replies to answer", "Google logins", "Support"]) {
      expect(sidebarShot!.alt).toContain(entry);
    }
    expect(sidebarShot!.alt).not.toMatch(/,\s*Activity\b/);
  });
});

describe("Row 148 finding 9 — manual-signature button name matches the real button", () => {
  it("says 'Set signature' and documents the one-click 'Set branded signatures' generator", () => {
    const mailboxes = getTrainingModule("mailboxes");
    expect(mailboxes).not.toBeNull();
    const copy = [...mailboxes!.steps.map((s) => s.detail), ...mailboxes!.commonMistakes].join("\n");
    expect(copy).not.toContain("Edit manual signature");
    expect(copy).toContain("Set signature");
    expect(copy).toMatch(/Set branded signatures/);
  });
});

describe("Row 148 finding 10 — the 10-day cooldown and re-engage override are documented", () => {
  it("Outreach module documents the cooldown and the Re-engage override", () => {
    const outreach = getTrainingModule("outreach");
    expect(outreach).not.toBeNull();
    const copy = (outreach!.details ?? []).join("\n");
    expect(copy).toMatch(/10-day/);
    expect(copy).toMatch(/cooldown/i);
    expect(copy).toMatch(/Re-engage/);
  });
});

describe("Row 148 finding 11 — no PR numbers rendered to operators", () => {
  it("no operator-facing training copy names a PR number", () => {
    const offenders = allOperatorFacingCopy()
      .split("\n")
      .filter((line) => /\bPR\s*#\d+/i.test(line));
    expect(offenders).toEqual([]);
  });

  it("the Do-not-contact sync step no longer names the retiring PR or the raw enum pair", () => {
    const suppression = getTrainingModule("suppression");
    expect(suppression).not.toBeNull();
    const copy = suppression!.steps.map((s) => s.detail).join("\n");
    expect(copy).not.toMatch(/EMAIL\/SUCCESS/);
    expect(copy).not.toMatch(/retired in PR/i);
  });
});

describe("Row 148 finding 12 — Settings role language matches what the product enforces", () => {
  it("clarifies that role no longer gates day-to-day workspace actions", () => {
    const settings = getTrainingModule("settings");
    expect(settings).not.toBeNull();
    const step = settings!.steps.find((s) => s.title === "Read the Team access roster");
    expect(step).toBeDefined();
    expect(step!.detail).toMatch(/day-to-day/i);
  });
});

describe("Row 148 finding 13 — the staff-handover guide is reachable from the training index", () => {
  it("training/page.tsx links to /training/staff-handover", () => {
    expect(TRAINING_INDEX_SOURCE).toContain("/training/staff-handover");
  });
});

describe("Row 148 finding 14 — the printed checklist uses the real sidebar label", () => {
  it("Check Do-not-contact step says Blocked contacts, not the page's own H1 as if it were sidebar text", () => {
    const row = STAFF_HANDOVER_CHECKLIST.find((c) => c.step === "Check Do-not-contact");
    expect(row).toBeDefined();
    expect(row!.detail).not.toMatch(/sidebar,\s*titled\s*"People blocked from outreach"/);
    expect(row!.detail).toContain("Blocked contacts");
  });
});
