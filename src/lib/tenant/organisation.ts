/**
 * Organisation identity and the rules that attach existing OpensDoors data
 * to it. Pure: no database, no session. Enforcement of access and feature
 * flags comes in later stages; this module only decides the values those
 * stages will store and read.
 */

export const OPENSDOORS_ORGANISATION_ID = "org_opensdoors";
export const OPENSDOORS_ORGANISATION_SLUG = "opensdoors";
export const OPENSDOORS_ORGANISATION_NAME = "OpensDoors";

/** The only email domain that may open the Bidlow platform admin. */
export const PLATFORM_ADMIN_EMAIL_DOMAIN = "@bidlow.co.uk";

export const ORGANISATION_FEATURE_KEYS = [
  "aiCampaigns",
  "aiDraftingReview",
  "rocketReachBuying",
  "universe",
  "supportDesk",
  "machineSending",
  "humanSending",
  "followUps",
] as const;

export type OrganisationFeatureKey = (typeof ORGANISATION_FEATURE_KEYS)[number];
export type OrganisationFeatureFlags = Record<OrganisationFeatureKey, boolean>;

/**
 * OpensDoors today. Every switch is on; environment variables stay the
 * emergency brake once a later stage consults the flags. A missing key
 * resolves to the same value, so an empty stored object does not turn
 * anything off.
 */
export const OPENSDOORS_FEATURE_FLAG_DEFAULTS: OrganisationFeatureFlags = {
  aiCampaigns: true,
  aiDraftingReview: true,
  rocketReachBuying: true,
  universe: true,
  supportDesk: true,
  machineSending: true,
  humanSending: true,
  followUps: true,
};

export type OrganisationMemberRoleName = "OWNER" | "ADMIN" | "USER";

export type StaffRoleName = "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";

export function isBidlowPlatformEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(PLATFORM_ADMIN_EMAIL_DOMAIN);
}

/**
 * Platform access needs both the explicit flag and a Bidlow email.
 * Either one alone is not enough, including an @opensdoors.co.uk address
 * that somehow holds the flag.
 */
export function hasPlatformAdminAccess(staff: {
  isPlatformAdmin: boolean;
  email: string;
}): boolean {
  return staff.isPlatformAdmin === true && isBidlowPlatformEmail(staff.email);
}

/**
 * Who receives the flag when the organisation migration backfills existing
 * rows. Super-admin at Bidlow only. Other staff stay false.
 */
export function shouldBackfillPlatformAdmin(staff: {
  email: string;
  isSuperAdmin: boolean;
}): boolean {
  return staff.isSuperAdmin === true && isBidlowPlatformEmail(staff.email);
}

/**
 * Existing in-account roles become organisation roles without hiding any
 * workspace. Super-admins own OpensDoors. Admins stay admins. Everyone
 * else is a user and can still open every live client of the organisation.
 */
export function membershipRoleForStaff(staff: {
  isSuperAdmin: boolean;
  role: StaffRoleName;
}): OrganisationMemberRoleName {
  if (staff.isSuperAdmin) return "OWNER";
  if (staff.role === "ADMIN") return "ADMIN";
  return "USER";
}

/**
 * Resolve stored JSON into a complete flag set. Non-booleans and unknown
 * keys are ignored. Missing keys stay at the OpensDoors default (on).
 */
export function resolveOrganisationFeatureFlags(stored: unknown): OrganisationFeatureFlags {
  const source =
    stored !== null && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const resolved: OrganisationFeatureFlags = { ...OPENSDOORS_FEATURE_FLAG_DEFAULTS };
  for (const key of ORGANISATION_FEATURE_KEYS) {
    const value = source[key];
    if (typeof value === "boolean") {
      resolved[key] = value;
    }
  }
  return resolved;
}
