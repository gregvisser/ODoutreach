import { describe, expect, it } from "vitest";

import type { LaunchReadinessPanelInput } from "./client-launch-state";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
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
        }),
      ),
    ).toBe("Ready to launch");
  });

  it("returns Brief not started when brief empty", () => {
    expect(deriveLaunchStageLabel(baseInput({}))).toBe("Brief not started");
  });
});

/**
 * The client workspace used to show the same seven destinations THREE times on
 * the Overview: the subnav tab row, a numbered "Workflow" strip in the command
 * centre, and the Launch readiness panel. Two of them disagreed on the names -
 * the tab row said "Do-not-contact" and "Lists" where the other two said
 * "Suppression" and "Contacts" - so the same page offered two different words
 * for the same place.
 *
 * The strip is removed: it was the weakest of the three (a status dot and a
 * label), it duplicated the tab row's links, and it computed a `metric` for
 * every step that it never rendered. Launch readiness shows the same seven with
 * a status pill AND that metric AND the same link, so no status information is
 * lost and no destination disappears.
 *
 * PR #138 had already decided the subnav names ("Contacts" -> "Lists", with the
 * href held stable); it simply never reached the readiness panel. This locks the
 * two together so they cannot drift apart again.
 */
describe("one name per destination", () => {
  const subnavSource = readFileSync(
    join(process.cwd(), "src/components/clients/client-workspace-subnav.tsx"),
    "utf8",
  );

  it("every Launch readiness label is a label the tab row also uses", () => {
    const rows = buildLaunchReadinessRows(basePanel({ clientId: "abc" }));
    const subnavLabels = new Set(
      [...subnavSource.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]),
    );

    expect(subnavLabels.size).toBeGreaterThan(0);
    for (const row of rows) {
      expect(subnavLabels).toContain(row.label);
    }
  });

  it("does not reintroduce the two names the tab row rejected", () => {
    const labels = buildLaunchReadinessRows(basePanel({ clientId: "abc" })).map(
      (r) => r.label,
    );
    expect(labels).not.toContain("Suppression");
    expect(labels).not.toContain("Contacts");
    expect(labels).toContain("Do-not-contact");
    expect(labels).toContain("Lists");
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
        approvedSequencesCount: 0,
        approvedIntroductionTemplatesCount: 0,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.pillStatus).toBe("ready");
    expect(row?.metric).toBe("Ready to launch · launchable production sequence");
  });

  it("hints that a sequence is pending approval when introduction templates exist but no approved sequence", () => {
    const row = buildLaunchReadinessRows(
      basePanel({
        outreachPilotRunnable: true,
        approvedSequencesCount: 0,
        approvedIntroductionTemplatesCount: 1,
        hasProductionLaunchableSequence: false,
      }),
    ).find((r) => r.id === "outreach");
    expect(row?.metric).toContain("sequence pending approval");
  });

  it("omits extra hint when no launchable sequence and no approved rollups", () => {
    const row = buildLaunchReadinessRows(
      basePanel({ outreachPilotRunnable: true, hasProductionLaunchableSequence: false }),
    ).find((r) => r.id === "outreach");
    expect(row?.metric).toBe("Ready to launch");
  });

  it("uses informational copy for Activity when there is no send history yet", () => {
    const row = buildLaunchReadinessRows(basePanel({ latestActivityLabel: null })).find(
      (r) => r.id === "activity",
    );
    expect(row?.metric).toContain("No outreach activity yet");
  });
});
