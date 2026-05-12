/**
 * RocketReach list-import scope (documentation + code inspection only — no live API calls).
 *
 * ## ODoutreach today (`person-import.ts`)
 *
 * - `POST https://api.rocketreach.co/api/v2/person/search` — People Search; returns match ids without full contact info.
 * - `GET https://api.rocketreach.co/api/v2/person/lookup?id=…` — Person Lookup; hydrates each profile.
 * - No BulkLookup, no RocketReach webhooks, no saved-list read in this repo.
 *
 * ## Public RocketReach API docs (docs.rocketreach.co — reviewed for product planning)
 *
 * - **People Search** — criteria search; contact detail requires separate lookup calls.
 * - **Person Lookup** — single profile; webhooks optional for async delivery.
 * - **Bulk People Lookup** (`POST …/bulkLookup`) — 10–100 `queries` per batch; **consumes export credits**;
 *   requires at least one webhook URL or `webhook_id`. Optional `profile_list` is the **name of a RocketReach
 *   profile list to add looked-up profiles to after completion** — enrichment output routing inside
 *   RocketReach, **not** a documented “give me all members of my saved list id” import API.
 * - **Webhooks** — deliver lookup/bulk lookup **results** to your URL (payload includes `profile_list` metadata);
 *   not a substitute for listing saved-list members for ODoutreach import.
 *
 * A **saved-list → ODoutreach direct REST import** path is **not confirmed** in the public reference material
 * reviewed here. Product-specific or plan-gated endpoints may exist — **confirm with RocketReach**
 * (`api@rocketreach.co`) before designing production calls.
 */
export const ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED = false as const;

/** What we could find in public API reference pages (not a legal guarantee about all plans). */
export const ROCKETREACH_SAVED_LIST_PUBLIC_API_STATUS = "not_documented" as const;

export const ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK =
  "Export your list from RocketReach as a CSV file, then use Upload CSV on this page." as const;

/**
 * Shown to operators when saved-list API is not wired — Greg should validate with RocketReach before we
 * commit engineering to a direct list API.
 */
export const ROCKETREACH_SAVED_LIST_GREG_NOTE =
  "Direct saved-list import requires RocketReach confirmation or support (e.g. whether your plan exposes list export or list-members access we can call server-side)." as const;
