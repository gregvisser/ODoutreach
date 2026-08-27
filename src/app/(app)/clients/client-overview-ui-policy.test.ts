import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const overviewPageSource = readFileSync(
  join(__dirname, "[clientId]", "page.tsx"),
  "utf8",
);
const repoRoot = join(__dirname, "..", "..", "..", "..");
const commandCentreSource = readFileSync(
  join(repoRoot, "src/components/clients/client-workspace-command-center.tsx"),
  "utf8",
);
const launchStateSource = readFileSync(
  join(repoRoot, "src/lib/client-launch-state.ts"),
  "utf8",
);
const trainingModulesSource = readFileSync(
  join(repoRoot, "src/lib/training/modules.ts"),
  "utf8",
);

describe("client Overview UI policy (source)", () => {
  it("does not mount internal team or launch-approval panels", () => {
    expect(overviewPageSource).not.toContain("ClientTeamAccessPanel");
    expect(overviewPageSource).not.toContain("ClientLaunchApprovalCard");
    expect(overviewPageSource).not.toContain("<CardTitle>Team access</CardTitle>");
    expect(overviewPageSource).not.toContain("Launch approval");
    expect(overviewPageSource).not.toContain("CONTROLLED_INTERNAL");
    expect(overviewPageSource).not.toContain("Approval checklist snapshot");
    expect(overviewPageSource).not.toContain("approved by");
    expect(overviewPageSource).not.toContain("Approved by");
    expect(overviewPageSource).not.toContain("launchApprovedAt");
    expect(overviewPageSource).not.toContain("launchApprovalMode");
  });

  it("still includes staff-facing operational sections", () => {
    // PR #135 (system handover audit) removed the duplicated "Workspace
    // status" card — the ClientWorkspaceCommandCenter already shows status
    // + workflow above it. See docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md
    // section B.1.
    expect(overviewPageSource).toContain("ClientWorkspaceCommandCenter");
    expect(overviewPageSource).toContain("ClientGettingStartedCard");
    expect(overviewPageSource).toContain("Launch readiness");
    expect(overviewPageSource).toContain("ClientOperationalSnapshot");
  });

  it("does not re-introduce duplicated Workspace status copy", () => {
    // Lock the audit decision: the standalone "Workspace status" Card
    // duplicated the status badge + tab list and confused staff.
    expect(overviewPageSource).not.toContain("<CardTitle>Workspace status</CardTitle>");
    expect(overviewPageSource).not.toContain("workspaceStatusBody");
    expect(overviewPageSource).not.toContain(
      "Day-to-day outreach work happens in Brief",
    );
  });
});

/**
 * ONE LIST OF DESTINATIONS, NOT THREE.
 *
 * The Overview offered the same seven destinations three times on one screen:
 * the subnav tab row, a numbered "Workflow" pill strip, and the Launch
 * readiness rows. `client-launch-state.test.ts` already documents the mess this
 * created — two of the three disagreed on the words for the same place.
 *
 * Greg's instruction, verbatim: "this needs to be consolidated into one tab
 * list? i need the UI clean".
 *
 * The pills are the ones that go. They carried no information the readiness
 * rows do not already carry — the readiness rows show the same seven
 * destinations WITH a status pill and a reason, where a pill showed a coloured
 * dot whose meaning was only in a screen-reader string. The tab row stays
 * (it is the navigation) and the readiness rows stay (they are the status).
 */
describe("the client Overview lists its destinations once", () => {
  it("no longer renders the numbered Workflow pill strip", () => {
    expect(commandCentreSource).not.toContain("ClientWorkflowStrip");
    expect(commandCentreSource).not.toContain("Client setup workflow");
  });

  it("does not pass workflow steps into the workspace header", () => {
    expect(overviewPageSource).not.toContain("buildClientWorkflowSteps");
    expect(overviewPageSource).not.toContain("steps={steps}");
  });

  it("leaves no orphaned builder behind for the strip", () => {
    // Dead exported code is how a "removed" feature quietly comes back.
    expect(launchStateSource).not.toContain("buildClientWorkflowSteps");
    expect(launchStateSource).not.toContain("ClientWorkflowStep");
  });

  it("keeps the two lists that earn their place", () => {
    expect(overviewPageSource).toContain("buildLaunchReadinessRows");
    expect(overviewPageSource).toContain("LaunchReadinessPanel");
  });
});

/**
 * THE TRAINING MUST DESCRIBE THE SCREEN THAT IS ACTUALLY THERE.
 *
 * Removing the strip (above) was only half the job. The staff training taught
 * it BY NAME — "the 7-step workflow strip" — in Module 1's captions, steps and
 * "what good looks like", and again in the Client overview video script. That
 * copy shipped unchanged when the strip was deleted, so for a period the
 * product told new staff to look for a thing that is not on the page.
 *
 * That is the failure this repository keeps repeating in other forms: a change
 * lands, reports success, and the surface that is supposed to reflect it never
 * moves. Training is a surface. It drifts silently because nothing renders it
 * next to the UI it describes.
 *
 * So the removal and its documentation are locked together here, in one file.
 * If someone re-adds the strip, the tests above fail. If someone removes
 * another Overview element without updating what staff are told, this fails.
 */
describe("staff training matches the Overview that ships", () => {
  it("does not teach the workflow strip that was removed", () => {
    expect(trainingModulesSource).not.toMatch(/workflow strip/i);
    expect(trainingModulesSource).not.toMatch(/7-step/i);
  });

  it("teaches the two Overview surfaces that do exist", () => {
    // Named in the copy AND mounted by the page — checked on both sides so
    // this cannot pass by agreeing with itself.
    expect(trainingModulesSource).toContain("Launch readiness");
    expect(overviewPageSource).toContain("Launch readiness");
    expect(trainingModulesSource).toContain("Getting started");
    expect(overviewPageSource).toContain("ClientGettingStartedCard");
  });
});
