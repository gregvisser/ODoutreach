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

/** Where a platform administrator works across organisations. */
export const PLATFORM_DASHBOARD_PATH = "/platform";

/** Where organisation staff land. Reports is the workspace home. */
export const STAFF_WORKSPACE_HOME_PATH = "/reporting";

/**
 * Paths that mean "open the app", not "return to a page I was on".
 * A platform administrator who signs in from one of these lands on the
 * platform dashboard. A deep link is left alone.
 */
const GENERIC_POST_SIGN_IN_PATHS = new Set([
  "/",
  "/reporting",
  "/dashboard",
  "/sign-in",
  PLATFORM_DASHBOARD_PATH,
]);

export type PlatformDashboardDecision = "allow" | "deny";

/**
 * Server pages call this before rendering the platform dashboard.
 * Deny is notFound — the route must not exist for anyone else.
 */
export function platformDashboardDecision(staff: {
  isPlatformAdmin: boolean;
  email: string;
}): PlatformDashboardDecision {
  return hasPlatformAdminAccess(staff) ? "allow" : "deny";
}

/** First screen after a person is signed in and no deep link is waiting. */
export function staffLandingPath(staff: {
  isPlatformAdmin: boolean;
  email: string;
}): string {
  return platformDashboardDecision(staff) === "allow"
    ? PLATFORM_DASHBOARD_PATH
    : STAFF_WORKSPACE_HOME_PATH;
}

function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

function pathWithoutQuery(value: string): string {
  const query = value.indexOf("?");
  const hash = value.indexOf("#");
  const end = [query, hash].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return end === undefined ? value : value.slice(0, end);
}

function isPlatformRoute(path: string): boolean {
  return path === PLATFORM_DASHBOARD_PATH || path.startsWith(`${PLATFORM_DASHBOARD_PATH}/`);
}

/**
 * Where to send someone who is already signed in, or who just finished
 * Microsoft sign-in. Generic homes follow {@link staffLandingPath}.
 * A workspace deep link is kept. The platform dashboard is never the
 * destination for someone who cannot open it.
 */
export function postSignInPath(
  staff: { isPlatformAdmin: boolean; email: string },
  callbackPath: string | null | undefined,
): string {
  const landing = staffLandingPath(staff);
  const callback = safeInternalPath(callbackPath);
  if (!callback) return landing;
  const path = pathWithoutQuery(callback);
  if (GENERIC_POST_SIGN_IN_PATHS.has(path)) return landing;
  if (isPlatformRoute(path)) {
    return platformDashboardDecision(staff) === "allow" ? callback : landing;
  }
  return callback;
}

/**
 * Callback stored on the Microsoft button before we know who is signing in.
 * Generic homes go to `/`, which then chooses the dashboard or Reports.
 * A deep link is preserved so a session that expired on a workspace returns there.
 */
export function signInCallbackUrl(requested: string | null | undefined): string {
  const callback = safeInternalPath(requested);
  if (!callback) return "/";
  const path = pathWithoutQuery(callback);
  if (GENERIC_POST_SIGN_IN_PATHS.has(path)) return "/";
  return callback;
}

export { ORGANISATION_FEATURE_KEYS };
