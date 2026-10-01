/**
 * Pure rules for the Bidlow platform console and organisation administration.
 * No database and no session. Access still requires a Bidlow email and the
 * platform flag; this module only decides slugs, suspension, and invite shape.
 */

import type { OrganisationFeatureKey, OrganisationMemberRoleName, StaffRoleName } from "./organisation";
import { hasPlatformAdminAccess, ORGANISATION_FEATURE_KEYS } from "./organisation";

export const ORGANISATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ORGANISATION_FEATURE_LABELS: Record<OrganisationFeatureKey, string> = {
  aiCampaigns: "AI campaigns",
  aiDraftingReview: "AI drafting and review",
  rocketReachBuying: "RocketReach buying",
  universe: "Universe",
  supportDesk: "Support desk",
  machineSending: "Machine sending",
  humanSending: "Human sending",
  followUps: "Follow-ups",
};

/**
 * The first person a platform admin invites into a new organisation.
 * Explicit on purpose: membershipRoleForStaff only returns OWNER for a
 * super-admin, and an organisation owner must not become one.
 */
export const FIRST_ORGANISATION_ADMIN = {
  staffRole: "ADMIN",
  membershipRole: "OWNER",
  isPlatformAdmin: false,
  isSuperAdmin: false,
} as const satisfies {
  staffRole: StaffRoleName;
  membershipRole: OrganisationMemberRoleName;
  isPlatformAdmin: false;
  isSuperAdmin: false;
};

export function parseOrganisationSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 2 || slug.length > 40) return null;
  if (!ORGANISATION_SLUG_PATTERN.test(slug)) return null;
  return slug;
}

export function isOrganisationAdminRole(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * A suspended organisation locks its own staff out of the app. A platform
 * admin stays in, including when their home organisation is suspended, so
 * they can turn it back on. An @opensdoors.co.uk address never counts as
 * platform access, even with the flag set.
 */
export function staffBlockedBySuspendedOrganisation(staff: {
  isPlatformAdmin: boolean;
  email: string;
  organisationStatus: "ACTIVE" | "SUSPENDED" | null;
}): boolean {
  if (staff.organisationStatus !== "SUSPENDED") return false;
  return !hasPlatformAdminAccess(staff);
}

export { ORGANISATION_FEATURE_KEYS };
