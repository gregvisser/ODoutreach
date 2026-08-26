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
