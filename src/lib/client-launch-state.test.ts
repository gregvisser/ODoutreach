import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LaunchReadinessPanelInput } from "./client-launch-state";
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

describe("buildLaunchReadinessRows does not embed env key names", () => {
  // Was asserted against the numbered Workflow pill strip too, until the strip
  // was removed as a third copy of the same seven destinations. The rule it
  // protects — never put an env var name on a client-facing screen — still
  // applies to the rows that remain.
  it("keeps ROCKETREACH_API / GOOGLE_SERVICE_ACCOUNT out of the rendered rows", () => {
    const rows = buildLaunchReadinessRows(
      basePanel({ rocketReachEnvReady: true, clientId: "x" }),
    );
    expect(JSON.stringify(rows)).not.toMatch(
      /ROCKETREACH_API|GOOGLE_SERVICE_ACCOUNT/i,
    );
  });
});

/**
 * ONE NAME PER DESTINATION.
 *
 * The Overview USED TO show the same seven destinations three times: the subnav
 * tab row, the numbered Workflow strip, and the Launch readiness panel. Two of
 * them disagreed on the words - the tab row said "Do-not-contact" and "Lists"
 * where the other two said "Suppression" and "Contacts" - so one page offered
 * two different names for the same place.
 *
 * The Workflow strip is now GONE (queue item 27, defect 4), so there are two
 * lists, not three. The naming rule still binds the two that remain.
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

  it("the readiness rows do not reintroduce the two names the tab row rejected", () => {
    const all = buildLaunchReadinessRows(basePanel({ clientId: "abc" })).map(
      (r) => r.label,
    );
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
