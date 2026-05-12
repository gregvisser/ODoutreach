/**
 * RocketReach integration scope (code inspection only — no live API calls).
 *
 * `person-import.ts` posts to People Search (`/api/v2/person/search`) and
 * hydrates rows via `/api/v2/person/lookup`. No saved-list or list-members
 * endpoint is implemented in this codebase yet.
 */
export const ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED = false as const;

export const ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK =
  "Export your list from RocketReach as a CSV file, then use Upload CSV on this page." as const;
