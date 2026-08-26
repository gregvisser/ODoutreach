import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LaunchReadinessPanelInput } from "./client-launch-state";
import {
  buildClientWorkflowSteps,
  buildLaunchReadinessRows,
  deriveLaunchStageLabel,
} from "./client-launch-state";
import { computeOnboardingBriefCompletion } from "./opensdoors-brief";

const emptyBrief = computeOnboardingBriefCompletion({});
const readyBrief = computeOnboardingBriefCompletion(
  Object.fromEntries(
    [
      "businessAddress",
      "targetGeography",
      "targetCustomerProfile",
      "usps",
      "offer",
      "exclusions",
      "campaignObjective",
      "senderIdentityNotes",
      "emailSignature",
      "mailboxSetupNotes",
      "sequenceNotes",
    ].map((k) => [k, "x"]),
  ),
);

function baseInput(overrides: Partial<Parameters<typeof deriveLaunchStageLabel>[0]>) {
  return {
    clientId: "c1",
    brief: emptyBrief,
    connectedSendingCount: 0,
    recommendedMailboxCount: 5,
    suppressionSheetCount: 0,
    googleSheetsEnvReady: true,
    contactsTotal: 0,
    contactsEligible: 0,
    contactsSuppressedCount: 0,
    rocketReachEnvReady: false,
    outreachPilotRunnable: false,
    latestActivityLabel: null,
    hasProductionLaunchableSequence: false,
    enrolledContactsCount: 0,
    ...overrides,
  };
}

function basePanel(overrides: Partial<LaunchReadinessPanelInput> = {}): LaunchReadinessPanelInput {
  return {
    ...baseInput({}),
    suppressionLatestSyncAt: null,
    ...overrides,
  };
}

describe("deriveLaunchStageLabel", () => {
  it("returns Ready to launch when brief ready and outreach can run", () => {
    expect(
      deriveLaunchStageLabel(
        baseInput({
          brief: readyBrief,
          outreachPilotRunnable: true,
          // "Outreach can run" now means a sequence and recipients too, not a
          // mailbox on its own — see isOutreachModuleReady.
          hasProductionLaunchableSequence: true,
          enrolledContactsCount: 2,
        }),
      ),
    ).toBe("Ready to launch");
  });

  it("returns Brief not started when brief empty", () => {
    expect(deriveLaunchStageLabel(baseInput({}))).toBe("Brief not started");
  });
});

describe("buildClientWorkflowSteps", () => {
  it("returns seven steps with client-scoped hrefs", () => {
    const steps = buildClientWorkflowSteps(baseInput({ clientId: "abc" }));
    expect(steps).toHaveLength(7);
    expect(steps[0]?.href).toBe("/clients/abc/brief");
    expect(steps.map((s) => s.label).join("|")).toContain("Sources");
  });

  it("does not embed env key names in steps", () => {
    const steps = buildClientWorkflowSteps(
      baseInput({ rocketReachEnvReady: true, clientId: "x" }),
    );
    const blob = JSON.stringify(steps);
    expect(blob).not.toMatch(/ROCKETREACH_API|GOOGLE_SERVICE_ACCOUNT/i);
  });
});

/**
 * ONE NAME PER DESTINATION.
 *
 * The Overview shows the same seven destinations three times: the subnav tab
 * row, the numbered Workflow strip, and the Launch readiness panel. Two of them
 * disagreed on the words - the tab row said "Do-not-contact" and "Lists" where
 * the other two said "Suppression" and "Contacts" - so one page offered two
 * different names for the same place.
 *
 * PR #138 already decided this, renaming Contacts -> Lists in the subnav while
 * holding the href stable. The decision simply never reached these two
 * builders. The staff training modules were written against the DECISION, not
 * the code - modules.ts:227 has taught "Brief -> Mailboxes -> Sources ->
 * Do-not-contact -> Lists -> Outreach -> Activity" all along - so the product
 * has been contradicting its own training. This aligns the code with both.
 *
 * Labels only. No href, no route, no destination changes.
 */
describe("one name per destination", () => {
  const subnavSource = readFileSync(
    join(process.cwd(), "src/components/clients/client-workspace-subnav.tsx"),
    "utf8",
  );
  const subnavLabels = new Set(
    [...subnavSource.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]),
  );

  it("every Launch readiness label is a name the tab row also uses", () => {
    expect(subnavLabels.size).toBeGreaterThan(0);
    for (const row of buildLaunchReadinessRows(basePanel({ clientId: "abc" }))) {
      expect(subnavLabels).toContain(row.label);
    }
  });

  it("every workflow step label is a name the tab row also uses", () => {
    for (const step of buildClientWorkflowSteps(baseInput({ clientId: "abc" }))) {
      expect(subnavLabels).toContain(step.label);
    }
  });

  it("neither builder reintroduces the two names the tab row rejected", () => {
    const all = [
      ...buildLaunchReadinessRows(basePanel({ clientId: "abc" })).map((r) => r.label),
      ...buildClientWorkflowSteps(baseInput({ clientId: "abc" })).map((s) => s.label),
    ];
    expect(all).not.toContain("Suppression");
    expect(all).not.toContain("Contacts");
    expect(all).toContain("Do-not-contact");
    expect(all).toContain("Lists");
  });

  it("the hrefs are untouched - this is a copy change only", () => {
    const rows = buildLaunchReadinessRows(basePanel({ clientId: "abc" }));
    expect(rows.map((r) => r.href)).toContain("/clients/abc/suppression");
    expect(rows.map((r) => r.href)).toContain("/clients/abc/contacts");
  });
});

describe("buildLaunchReadinessRows", () => {
  it("returns seven module rows with stable hrefs", () => {
    const rows = buildLaunchReadinessRows(basePanel({ clientId: "abc" }));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id).join("|")).toBe(
      "brief|mailboxes|sources|suppression|contacts|outreach|activity",
    );
    expect(rows[0]?.href).toBe("/clients/abc/brief");
    expect(rows[6]?.href).toBe("/clients/abc/activity");
  });

  it("marks suppression as Not configured when no sheet sources", () => {
    const row = buildLaunchReadinessRows(basePanel({ suppressionSheetCount: 0 })).find(
      (r) => r.id === "suppression",
    );
    expect(row?.pillStatus).toBe("not_started");
    expect(row?.metric).toBe("Not configured");
  });

  it("marks suppression as Needs sync when sources exist but never synced", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        suppressionSheetCount: 1,
        googleSheetsEnvReady: true,
        suppressionLatestSyncAt: null,
      }),
    ).find((r) => r.id === "suppression");
    expect(row?.pillStatus).toBe("needs_attention");
    expect(row?.metric).toBe("Needs sync");
  });

  it("marks mailboxes as Reduced capacity when connected but below recommended pool", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ connectedSendingCount: 3, recommendedMailboxCount: 5 }),
    ).find((r) => r.id === "mailboxes");
    expect(row?.pillStatus).toBe("reduced_capacity");
    expect(row?.metric).toContain("3 connected");
    expect(row?.metric).toContain("/day capacity");
  });

  it("uses Monitoring for activity when governed sends exist", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ latestActivityLabel: "2026-01-01 12:00" }),
    ).find((r) => r.id === "activity");
    expect(row?.pillStatus).toBe("monitoring");
    expect(row?.metric).toBe("Recent sends available");
  });

  it("does not embed env key names in row metrics", () => {
    const rows = buildLaunchReadinessRows(basePanel({ rocketReachEnvReady: true }));
    const blob = JSON.stringify(rows);
    expect(blob).not.toMatch(/ROCKETREACH_API|GOOGLE_SERVICE_ACCOUNT/i);
  });

  it("prioritises launchable production sequence over approved counts when ready to launch", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        hasProductionLaunchableSequence: true,
        enrolledContactsCount: 3,
        approvedSequencesCount: 0,
        approvedIntroductionTemplatesCount: 0,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("ready");
    expect(row?.metric).toBe("Ready to launch · launchable production sequence");
  });

  // CORRECTED 2026-08-26. Both of the two tests below previously asserted the
  // defect: that a workspace with `hasProductionLaunchableSequence: false` was
  // still described as "Ready to launch". They now assert that the row names
  // the missing sequence while KEEPING the pending-approval hint, which is
  // genuinely useful information about how far along the operator is.
  it("hints that a sequence is pending approval when introduction templates exist but no approved sequence", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        contactsEligible: 2,
        approvedSequencesCount: 0,
        approvedIntroductionTemplatesCount: 1,
        hasProductionLaunchableSequence: false,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("needs_attention");
    expect(row?.metric).toContain("sequence pending approval");
  });

  it("omits extra hint when no launchable sequence and no approved rollups", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        contactsEligible: 2,
        hasProductionLaunchableSequence: false,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("needs_attention");
    expect(row?.metric).toBe("Needs a launchable sequence");
  });
});

/**
 * A READINESS RAIL THAT SAYS "READY" WITH ZERO SEQUENCES IS NOT A COSMETIC BUG.
 *
 * Found live on 2026-08-26: the `bidlowai` workspace showed a green "Ready to
 * launch" badge, a "6 Outreach - complete" workflow pill and a Launch readiness
 * row reading "Outreach - Ready - Ready to launch", while its Outreach tab said
 * "No sequences yet." and the Getting started checklist on the SAME page said
 * "5 / 8 complete" with "Build a launchable sequence" undone.
 *
 * Root cause: all four of those surfaces keyed off `outreachPilotRunnable`,
 * which is a MAILBOX fact - `hasGovernedMailbox && oauthReadyForGovernedTest &&
 * poolCanSendPilot`. It answers "could a governed mailbox send something
 * today?" and never once looks at sequences, steps or enrolments.
 *
 * The launch-approval gate (`evaluateClientLaunchApproval`) has always required
 * `hasProductionLaunchableSequence` and at least one enrolment. So the rail and
 * the gate were giving different answers about the same client. These tests
 * pin the rail to the gate's predicate.
 */
describe("a workspace with no sequence is never reported ready", () => {
  /** Everything a mailbox-only signal can prove, and nothing more. */
  const mailboxesFine = {
    brief: readyBrief,
    outreachPilotRunnable: true,
    connectedSendingCount: 5,
    contactsTotal: 3,
    contactsEligible: 2,
    suppressionSheetCount: 1,
    suppressionLatestSyncAt: new Date("2026-08-26T09:00:00Z"),
    rocketReachEnvReady: true,
  };

  describe("no launchable sequence at all (the bidlowai case)", () => {
    const noSequence = {
      ...mailboxesFine,
      hasProductionLaunchableSequence: false,
      enrolledContactsCount: 0,
    };

    it("does not show the Outreach row as Ready", () => {
      const row = buildLaunchReadinessRows(basePanel(noSequence)).find(
        (r) => r.id === "outreach",
      );
      expect(row?.pillStatus).toBe("needs_attention");
      expect(row?.metric).not.toContain("Ready to launch");
    });

    it("names the missing thing instead of hiding it", () => {
      const row = buildLaunchReadinessRows(basePanel(noSequence)).find(
        (r) => r.id === "outreach",
      );
      expect(row?.metric).toMatch(/sequence/i);
    });

    it("does not mark the Outreach workflow pill complete", () => {
      const step = buildClientWorkflowSteps(baseInput(noSequence)).find(
        (s) => s.id === "outreach",
      );
      expect(step?.status).not.toBe("complete");
      expect(step?.metric).not.toBe("Ready to launch");
    });

    it("does not put 'Ready to launch' in the header badge", () => {
      expect(deriveLaunchStageLabel(baseInput(noSequence))).not.toBe("Ready to launch");
    });
  });

  describe("a launchable sequence with nobody enrolled in it", () => {
    const nobodyEnrolled = {
      ...mailboxesFine,
      hasProductionLaunchableSequence: true,
      enrolledContactsCount: 0,
    };

    it("is still not Ready - a sequence with no recipients sends nothing", () => {
      const row = buildLaunchReadinessRows(basePanel(nobodyEnrolled)).find(
        (r) => r.id === "outreach",
      );
      expect(row?.pillStatus).toBe("needs_attention");
      expect(row?.metric).toMatch(/enrol/i);
    });

    it("does not mark the Outreach workflow pill complete", () => {
      const step = buildClientWorkflowSteps(baseInput(nobodyEnrolled)).find(
        (s) => s.id === "outreach",
      );
      expect(step?.status).not.toBe("complete");
    });

    it("does not put 'Ready to launch' in the header badge", () => {
      expect(deriveLaunchStageLabel(baseInput(nobodyEnrolled))).not.toBe("Ready to launch");
    });
  });

  describe("the opensdoors case - a real sequence with real recipients", () => {
    const genuinelyReady = {
      ...mailboxesFine,
      hasProductionLaunchableSequence: true,
      enrolledContactsCount: 12,
    };

    it("still reports Ready, so this fix does not break a working workspace", () => {
      const row = buildLaunchReadinessRows(basePanel(genuinelyReady)).find(
        (r) => r.id === "outreach",
      );
      expect(row?.pillStatus).toBe("ready");
      expect(row?.metric).toBe("Ready to launch · launchable production sequence");
      expect(
        buildClientWorkflowSteps(baseInput(genuinelyReady)).find((s) => s.id === "outreach")
          ?.status,
      ).toBe("complete");
      expect(deriveLaunchStageLabel(baseInput(genuinelyReady))).toBe("Ready to launch");
    });
  });

  it("a mailbox that cannot send is not covered up by a good sequence", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        ...mailboxesFine,
        outreachPilotRunnable: false,
        hasProductionLaunchableSequence: true,
        enrolledContactsCount: 4,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("needs_attention");
  });
});

describe("buildLaunchReadinessRows — activity", () => {
  it("uses informational copy for Activity when there is no send history yet", () => {
    const row = buildLaunchReadinessRows(basePanel({ latestActivityLabel: null })).find(
      (r) => r.id === "activity",
    );
    expect(row?.metric).toContain("No outreach activity yet");
  });
});
