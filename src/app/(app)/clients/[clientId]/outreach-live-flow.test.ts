import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { staffLaunchBlockerLines } from "@/lib/clients/outreach-launch-blockers";
import type { SequenceLaunchCheckResult } from "@/lib/email-sequences/launch-readiness";

const root = process.cwd();
const outreachPage = join(root, "src/app/(app)/clients/[clientId]/outreach/page.tsx");
const sequencesPanel = join(
  root,
  "src/components/clients/email-sequences/client-email-sequences-panel.tsx",
);
const sendPrepPanel = join(
  root,
  "src/components/clients/email-sequences/sequence-send-preparation-panel.tsx",
);

describe("Outreach live sequence flow (PR #119–#121)", () => {
  it("does not embed the templates panel on the Outreach page", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).not.toContain("ClientEmailTemplatesPanel");
  });

  it("does not surface pilot/test/proof-send panels on the Outreach page", () => {
    // Operators don't run pilots or proof sends before live launches —
    // sequence launches go through `evaluateSendGovernance` directly.
    const page = readFileSync(outreachPage, "utf8");
    expect(page).not.toMatch(/<AdminOutreachDiagnosticsPanel/);
    expect(page).not.toMatch(/<GovernedTestSendPanel/);
    expect(page).not.toMatch(/<ControlledPilotSendPanel/);
    expect(page).not.toMatch(/<InternalProofSendCard/);
  });

  it("uses dashboard-oriented wording on the Outreach page", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).toContain("OUTREACH_PAGE_TITLE");
    expect(src).toContain("OUTREACH_PAGE_SUBTITLE");
    expect(src).toContain("selectedSequenceId");
    expect(src).not.toContain("OUTREACH_WORKFLOW_STEPS");
  });

  it("does not render a separate full-width send-prep card on the Outreach page", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).not.toContain("SequenceSendPreparationPanel");
  });

  it("embeds send preparation inside the sequences panel for the selected sequence", () => {
    const src = readFileSync(sequencesPanel, "utf8");
    expect(src).toContain("SequenceSendPreparationPanel");
    expect(src).toContain('variant="embedded"');
    expect(src).toContain("onlySequenceId={selected.id}");
  });

  it("does not expose internal tools copy to all staff in the Outreach page source", () => {
    const src = readFileSync(outreachPage, "utf8");
    expect(src).not.toContain("OUTREACH_INTERNAL_TOOLS_COPY");
    expect(src).not.toContain("queue limited batch");
    expect(src).not.toContain("Queue limited batch");
  });

  it("keeps staff-facing sequence panel copy oriented to live launch", () => {
    const src = readFileSync(sequencesPanel, "utf8");
    expect(src).toContain("Ready to launch");
    expect(src).toContain("Not ready to launch yet");
    expect(src).toContain("Review and launch");
    expect(src).not.toContain("Mark ready");
    expect(src).not.toContain("Go live");
    expect(src).not.toContain("Launch readiness:");
    expect(src).not.toContain("Schedule send preparation");
  });

  it("collapses the create-sequence form in a details element by default", () => {
    const src = readFileSync(sequencesPanel, "utf8");
    expect(src).toContain("<details");
    expect(src).toContain("New sequence");
    expect(src).toContain("hideSequencePicker");
  });

  it("lists sequences in a compact table, not one expanded card per sequence", () => {
    const src = readFileSync(sequencesPanel, "utf8");
    expect(src).toContain("<table");
    expect(src).not.toContain("SequenceCard");
  });

  it("does not repeat send-prep blocks for every sequence in the panel source", () => {
    const src = readFileSync(sendPrepPanel, "utf8");
    expect(src).toContain("onlySequenceId");
    expect(src).toContain("visibleSnapshots");
    expect(src).not.toContain("snapshots.map((s)");
  });

  it("uses modal-based launch confirmation in send prep (no visible phrase field)", () => {
    const src = readFileSync(sendPrepPanel, "utf8");
    expect(src).toContain("SequencePhraseConfirmLaunch");
    expect(src).not.toContain('name="confirmationPhrase"');
    expect(src).not.toContain("Type <code");
    expect(src).toContain("Launch sequence");
  });

  it("removes legacy technical staff strings from visible sequence and prep UI", () => {
    const combined =
      readFileSync(sequencesPanel, "utf8") + readFileSync(sendPrepPanel, "utf8");
    expect(combined).not.toMatch(/prepare eligible recipients/i);
    expect(combined).not.toMatch(/create enrollment records/i);
    expect(combined).not.toMatch(/step sends/i);
    expect(combined).not.toMatch(/Prepare eligible recipients/);
    expect(combined).not.toMatch(/launch preparation/i);
    expect(combined).not.toMatch(/no send materials currently built/i);
    expect(combined).not.toMatch(/\bSend section\b/i);
    expect(combined).not.toMatch(/\bLaunch section\b/i);
    expect(combined).not.toMatch(/\bBatch cap\b/i);
  });

  it("the pilot/test/diagnostic send components are deleted (not just hidden)", () => {
    // Final production audit: these were dead, orphaned components with
    // no runtime importers. Deleting them guarantees no pilot/test send
    // surface can ever reappear in the staff UI.
    for (const rel of [
      "src/components/clients/controlled-pilot-send-panel.tsx",
      "src/components/clients/governed-test-send-panel.tsx",
      "src/components/clients/admin-outreach-diagnostics-panel.tsx",
    ]) {
      expect(existsSync(join(root, rel))).toBe(false);
    }
  });
});

describe("staffLaunchBlockerLines", () => {
  it("maps contact list failure to a plain staff bullet", () => {
    const checks: SequenceLaunchCheckResult[] = [
      {
        id: "contact_list_attached",
        label: "Target contact list attached",
        severity: "blocker",
        status: "fail",
        detail: "Sequence has no contact list attached.",
      },
    ];
    expect(staffLaunchBlockerLines(checks)).toEqual(["Select a contact list."]);
  });
});
