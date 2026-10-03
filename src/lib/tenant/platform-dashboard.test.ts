import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  aiCapReached,
  assemblePlatformOrganisationOverviews,
  formatAiSpend,
  formatRocketReachCredits,
  organisationHealth,
} from "./platform-dashboard";

const opensDoors = {
  id: "org_opensdoors",
  name: "OpensDoors",
  slug: "opensdoors",
  status: "ACTIVE" as const,
  memberCount: 4,
  rocketReachCreditsUsed: 12,
  rocketReachCreditAllowance: 100,
  aiSpendCapMicroUsd: 2_000_000,
};

const northwind = {
  id: "org_north",
  name: "Northwind",
  slug: "northwind",
  status: "SUSPENDED" as const,
  memberCount: 1,
  rocketReachCreditsUsed: 0,
  rocketReachCreditAllowance: null,
  aiSpendCapMicroUsd: null,
};

describe("organisation health", () => {
  it("treats a suspended organisation as suspended even when sending looks quiet", () => {
    expect(
      organisationHealth({ status: "SUSPENDED", mailboxesNeedingAttention: 0, failedSendsToday: 0 }),
    ).toEqual({ health: "suspended", label: "Suspended" });
  });

  it("asks for attention when a mailbox is disconnected or a send failed today", () => {
    expect(
      organisationHealth({ status: "ACTIVE", mailboxesNeedingAttention: 1, failedSendsToday: 0 }).label,
    ).toBe("1 mailbox needs reconnecting");
    expect(
      organisationHealth({ status: "ACTIVE", mailboxesNeedingAttention: 2, failedSendsToday: 3 }).label,
    ).toBe("2 mailboxes need reconnecting. 3 sends failed today");
  });

  it("is healthy when the organisation is active and nothing failed", () => {
    expect(
      organisationHealth({ status: "ACTIVE", mailboxesNeedingAttention: 0, failedSendsToday: 0 }),
    ).toEqual({ health: "healthy", label: "Healthy" });
  });
});

describe("platform overview", () => {
  it("rolls mailboxes, sends, and spend up to the organisation and ignores other clients", () => {
    const rows = assemblePlatformOrganisationOverviews({
      organisations: [opensDoors, northwind],
      clients: [
        { id: "client-a", organisationId: "org_opensdoors" },
        { id: "client-b", organisationId: "org_opensdoors" },
        { id: "client-c", organisationId: "org_north" },
        { id: "client-other", organisationId: "org_missing" },
      ],
      mailboxes: [
        { clientId: "client-a", connectionStatus: "CONNECTED", count: 2 },
        { clientId: "client-b", connectionStatus: "DISCONNECTED", count: 1 },
        { clientId: "client-b", connectionStatus: "DRAFT", count: 1 },
        { clientId: "client-c", connectionStatus: "CONNECTION_ERROR", count: 4 },
        { clientId: "client-other", connectionStatus: "DISCONNECTED", count: 9 },
      ],
      sendsToday: [
        { clientId: "client-a", count: 5 },
        { clientId: "client-b", count: 2 },
        { clientId: "client-other", count: 80 },
      ],
      failedSendsToday: [{ clientId: "client-a", count: 1 }],
      aiSpendMicroUsd: [
        { organisationId: "org_opensdoors", costMicroUsd: 1_500_000 },
        { organisationId: "org_missing", costMicroUsd: 9 },
      ],
    });

    expect(rows[0]).toMatchObject({
      id: "org_opensdoors",
      memberCount: 4,
      mailboxCount: 4,
      mailboxesNeedingAttention: 1,
      sendsToday: 7,
      failedSendsToday: 1,
      aiSpendMicroUsd: 1_500_000,
      health: "attention",
    });
    expect(rows[1]).toMatchObject({
      id: "org_north",
      mailboxCount: 4,
      sendsToday: 0,
      aiSpendMicroUsd: 0,
      health: "suspended",
      healthLabel: "Suspended",
    });
  });

  it("formats credit and AI spend with an empty cap called out", () => {
    expect(formatRocketReachCredits(12, 100)).toBe("12 of 100");
    expect(formatRocketReachCredits(3, null)).toBe("3 used, no cap");
    expect(formatAiSpend(1_500_000, 2_000_000)).toBe("$1.50 of $2.00 this month");
    expect(formatAiSpend(0, null)).toBe("$0.00 this month, no cap");
    expect(formatAiSpend(50_000_000, 50_000_000)).toBe("$50.00 of $50.00 this month (paused)");
  });

  it("shows Greg an organisation whose AI is paused at its monthly cap, and only that one", () => {
    expect(aiCapReached(49_999_999, 50_000_000)).toBe(false);
    expect(aiCapReached(50_000_000, 50_000_000)).toBe(true);
    expect(aiCapReached(90_000_000, null)).toBe(false);
    const rows = assemblePlatformOrganisationOverviews({
      organisations: [
        { id: "a", name: "A", slug: "a", status: "ACTIVE", memberCount: 1, rocketReachCreditsUsed: 0, rocketReachCreditAllowance: null, aiSpendCapMicroUsd: 50_000_000 },
        { id: "b", name: "B", slug: "b", status: "ACTIVE", memberCount: 1, rocketReachCreditsUsed: 0, rocketReachCreditAllowance: null, aiSpendCapMicroUsd: 50_000_000 },
      ],
      clients: [],
      mailboxes: [],
      sendsToday: [],
      failedSendsToday: [],
      aiSpendMicroUsd: [{ organisationId: "a", costMicroUsd: 50_000_000 }, { organisationId: "b", costMicroUsd: 1_000_000 }],
    });
    expect(rows[0]).toMatchObject({ health: "attention", healthLabel: "AI paused: monthly AI spend cap reached" });
    expect(rows[1]).toMatchObject({ health: "healthy" });
  });
});

describe("platform dashboard is not a workspace nav item", () => {
  const sidebar = readFileSync(
    join(process.cwd(), "src/components/app-shell/app-sidebar.tsx"),
    "utf8",
  );
  const workspaceLayout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
  const platformLayout = readFileSync(join(process.cwd(), "src/app/(platform)/layout.tsx"), "utf8");

  it("replaces the Platform side-panel item with a way back to the dashboard", () => {
    expect(sidebar).not.toMatch(/>\s*Platform\s*</);
    expect(sidebar).toContain("Back to platform dashboard");
    expect(sidebar).toContain("platformAdmin");
    expect(sidebar).not.toContain("OrganisationSwitcher");
    expect(workspaceLayout).toContain("OrganisationChooser");
    expect(workspaceLayout).toContain("Back to platform dashboard");
    expect(workspaceLayout).not.toContain("showPlatformNav");
    expect(workspaceLayout).toContain("<AppSidebar");
    expect(workspaceLayout).toContain("staffBlockedBySuspendedOrganisation");
  });

  it("guards the platform layout on the server", () => {
    expect(platformLayout).toContain("assertPlatformDashboardAccess");
    expect(platformLayout).not.toContain("AppSidebar");
    expect(platformLayout).not.toContain("OrganisationSwitcher");
  });
});
