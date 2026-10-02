/**
 * Which organisation a signed-in person is working in.
 * Pure: no database and no cookies. The server validates the cookie
 * against memberships before it calls this.
 */

import type { OrganisationMemberRoleName } from "./organisation";

export const ACTING_ORGANISATION_COOKIE = "od_acting_organisation";

export const PLATFORM_ADMIN_ENTERED_OP = "platform_admin_entered";

export type ActingMembership = {
  organisationId: string;
  role: OrganisationMemberRoleName;
  status: "ACTIVE" | "SUSPENDED";
  name: string;
  slug: string;
};

export type ActingOrganisation = ActingMembership & {
  /** membership: they belong to it. platform: a platform admin entered without a membership. */
  via: "membership" | "platform";
};

/**
 * Accept only an organisation id. Anything else is ignored, which is the
 * same as having no selection.
 */
export function parseActingOrganisationCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length < 2 || value.length > 80) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return value;
}

function withPlatformRole(
  membership: ActingMembership,
  platformAdmin: boolean,
  via: ActingOrganisation["via"],
): ActingOrganisation {
  return {
    ...membership,
    role: platformAdmin ? "OWNER" : membership.role,
    via,
  };
}

/**
 * Pick the organisation for this session.
 *
 * `memberships` must be oldest first. One membership is used even when
 * nobody has chosen. Several memberships and no valid choice return null
 * so the person picks at sign-in. A platform admin still defaults to the
 * oldest membership; they move between organisations from the platform
 * dashboard, not from a chooser.
 *
 * A requested id is honoured only when they belong to that organisation,
 * or they are a platform admin and the organisation exists. Any other
 * request is ignored. A platform admin working in an organisation has the
 * owner role for that session; their stored membership role is not changed.
 */
export function chooseActingOrganisation(input: {
  memberships: readonly ActingMembership[];
  requestedOrganisationId: string | null;
  requestedOrganisation: ActingMembership | null;
  platformAdmin: boolean;
}): ActingOrganisation | null {
  const requestedId = input.requestedOrganisationId;
  if (requestedId) {
    const member = input.memberships.find((item) => item.organisationId === requestedId);
    if (member) {
      return withPlatformRole(member, input.platformAdmin, "membership");
    }
    if (
      input.platformAdmin &&
      input.requestedOrganisation &&
      input.requestedOrganisation.organisationId === requestedId
    ) {
      return withPlatformRole(input.requestedOrganisation, true, "platform");
    }
  }

  if (!input.platformAdmin && input.memberships.length !== 1) return null;
  const home = input.memberships[0];
  if (!home) return null;
  return withPlatformRole(home, input.platformAdmin, "membership");
}
