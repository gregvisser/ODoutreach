import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformAdminForAction,
  inviteStaffIntoOrganisation,
  updateOrganisationFlags,
  updateOrganisationHostname,
} = vi.hoisted(() => ({
  requirePlatformAdminForAction: vi.fn(),
  inviteStaffIntoOrganisation: vi.fn(),
  updateOrganisationFlags: vi.fn(),
  updateOrganisationHostname: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/tenant/platform-admin", () => ({
  requirePlatformAdminForAction,
}));

vi.mock("@/server/tenant/invite-organisation-staff", () => ({
  inviteStaffIntoOrganisation,
}));

vi.mock("@/server/tenant/platform-orgs", () => ({
  createOrganisationRecord: vi.fn(),
  setOrganisationStatus: vi.fn(),
  updateOrganisationFlags,
  updateOrganisationHostname,
}));

import {
  inviteOrganisationOwnerAction,
  updateOrganisationFlagsAction,
  updateOrganisationHostnameAction,
} from "./actions";

const idle = { error: null, message: null };

describe("platform organisation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminForAction.mockResolvedValue({ id: "platform-1", email: "greg@bidlow.co.uk" });
    inviteStaffIntoOrganisation.mockResolvedValue({ ok: true, message: "Invitation sent." });
    updateOrganisationFlags.mockResolvedValue({ ok: true, organisationId: "org_north" });
    updateOrganisationHostname.mockResolvedValue({ ok: true, organisationId: "org_north" });
  });

  it("invites an organisation owner without platform or super-admin", async () => {
    const formData = new FormData();
    formData.set("organisationId", "org_north");
    formData.set("email", "ada@northwind.example");

    await expect(inviteOrganisationOwnerAction(idle, formData)).resolves.toMatchObject({
      error: null,
    });
    expect(inviteStaffIntoOrganisation).toHaveBeenCalledWith({
      actorStaffUserId: "platform-1",
      organisationId: "org_north",
      email: "ada@northwind.example",
      staffRole: "ADMIN",
      membershipRole: "OWNER",
      isActive: true,
    });
  });

  it("does not invite when the caller is not a platform admin", async () => {
    requirePlatformAdminForAction.mockRejectedValue(
      new Error("You do not have permission to manage organisations."),
    );
    const formData = new FormData();
    formData.set("organisationId", "org_north");
    formData.set("email", "ada@northwind.example");

    await expect(inviteOrganisationOwnerAction(idle, formData)).resolves.toEqual({
      error: "You do not have permission to manage organisations.",
      message: null,
    });
    expect(inviteStaffIntoOrganisation).not.toHaveBeenCalled();
  });

  it("saves a complete flag set and ignores unchecked switches", async () => {
    const formData = new FormData();
    formData.set("organisationId", "org_north");
    formData.set("flag_aiCampaigns", "on");

    await updateOrganisationFlagsAction(idle, formData);
    expect(updateOrganisationFlags).toHaveBeenCalledWith(
      "org_north",
      expect.objectContaining({
        aiCampaigns: true,
        universe: false,
        machineSending: false,
      }),
    );
  });

  it("saves a hostname and refuses the reserved OpensDoors host on another organisation", async () => {
    const saved = new FormData();
    saved.set("organisationId", "org_north");
    saved.set("hostname", "Northwind.bidlow.co.uk.");
    await expect(updateOrganisationHostnameAction(idle, saved)).resolves.toEqual({
      error: null,
      message: "Hostname saved.",
    });
    expect(updateOrganisationHostname).toHaveBeenCalledWith("org_north", "northwind.bidlow.co.uk");

    const reserved = new FormData();
    reserved.set("organisationId", "org_north");
    reserved.set("hostname", "opensdoors.bidlow.co.uk");
    await expect(updateOrganisationHostnameAction(idle, reserved)).resolves.toEqual({
      error: "opensdoors.bidlow.co.uk stays OpensDoors.",
      message: null,
    });
    expect(updateOrganisationHostname).toHaveBeenCalledTimes(1);
  });

  it("clears a hostname when the field is empty", async () => {
    const formData = new FormData();
    formData.set("organisationId", "org_north");
    formData.set("hostname", "  ");
    await expect(updateOrganisationHostnameAction(idle, formData)).resolves.toEqual({
      error: null,
      message: "Hostname cleared.",
    });
    expect(updateOrganisationHostname).toHaveBeenCalledWith("org_north", null);
  });
});
