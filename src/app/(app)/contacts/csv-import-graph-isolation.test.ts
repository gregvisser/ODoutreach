import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CONTACTS_ACTIONS_PATH = join(process.cwd(), "src/app/(app)/contacts/actions.ts");
const CONTACTS_PREVIEW_PATH = join(process.cwd(), "src/app/(app)/contacts/preview-actions.ts");
const SOURCES_PAGE_PATH = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/sources/page.tsx",
);
const STAFF_ACCESS_ACTIONS_PATH = join(
  process.cwd(),
  "src/app/(app)/settings/staff-access/actions.ts",
);
const STAFF_AUTH_PATH = join(process.cwd(), "src/server/auth/staff.ts");

const contactsActions = readFileSync(CONTACTS_ACTIONS_PATH, "utf8");
const contactsPreview = readFileSync(CONTACTS_PREVIEW_PATH, "utf8");
const sourcesPage = readFileSync(SOURCES_PAGE_PATH, "utf8");
const staffAccessActions = readFileSync(STAFF_ACCESS_ACTIONS_PATH, "utf8");
const staffAuth = readFileSync(STAFF_AUTH_PATH, "utf8");

describe("CSV import is isolated from Staff access Graph invite-status reads", () => {
  it("does not import or call guest invitation status sync from CSV import paths", () => {
    const importSources = [contactsActions, contactsPreview, sourcesPage].join("\n");

    expect(importSources).not.toContain("getGuestUserExternalState");
    expect(importSources).not.toContain("syncStaffInvitationStatus");
    expect(importSources).not.toContain("graphInvitedUserObjectId");
    expect(importSources).not.toContain("@/server/microsoft-graph/guest-invitations");
  });

  it("keeps Graph invited-user status reads scoped to Staff access actions", () => {
    expect(staffAccessActions).toContain("getGuestUserExternalState");
    expect(staffAccessActions).toContain("syncStaffInvitationStatus");
    expect(sourcesPage).not.toContain("StaffAccessPanel");
  });

  it("gates CSV import through StaffUser and client access, not Microsoft Graph user reads", () => {
    expect(contactsActions).toContain("requireOpensDoorsStaff");
    expect(contactsActions).toContain("requireClientAccess");
    expect(contactsPreview).toContain("requireOpensDoorsStaff");
    expect(contactsPreview).toContain("requireClientAccess");
    expect(staffAuth).toContain("graphInvitedUserObjectId");
    expect(staffAuth).not.toContain("getGuestUserExternalState");
  });

  it("keeps global Contacts admin-only while client Sources uses client access", () => {
    const contactsPage = readFileSync(
      join(process.cwd(), "src/app/(app)/contacts/page.tsx"),
      "utf8",
    );

    expect(contactsPage).toContain('staff.role !== "ADMIN"');
    expect(sourcesPage).toContain("getAccessibleClientIds");
    expect(sourcesPage).toContain("loadClientWorkspaceBundle");
  });
});
