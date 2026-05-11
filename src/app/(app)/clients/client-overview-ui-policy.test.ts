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
    expect(overviewPageSource).toContain("Workspace status");
    expect(overviewPageSource).toContain("ClientWorkspaceCommandCenter");
    expect(overviewPageSource).toContain("ClientGettingStartedCard");
    expect(overviewPageSource).toContain("Launch readiness");
    expect(overviewPageSource).toContain("ClientOperationalSnapshot");
  });
});
