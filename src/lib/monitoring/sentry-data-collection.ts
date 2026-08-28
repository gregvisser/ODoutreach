/**
 * What Sentry is allowed to collect from this application.
 *
 * READ THIS BEFORE CHANGING A FIELD. The obvious reading of this file is
 * backwards.
 *
 * The Sentry installer writes `dataCollection: {}` with every field commented
 * out, which reads like "we kept the safe defaults". It is the opposite. In
 * `@sentry/core` 10.67.0,
 * `utils/data-collection/resolveDataCollectionOptions.js` chooses its base with
 *
 *     const base = options.dataCollection != null ? DEFAULTS : legacyBridge(options.sendDefaultPii)
 *
 * An empty object is not null. So SUPPLYING the block is what selects
 * `DEFAULTS`, and `DEFAULTS` is permissive: user info on, cookies on, request
 * and response headers on, all four HTTP body types on, query params on,
 * database query values on, local variables in stack frames on. Every
 * commented-out line resolves to `undefined` and falls straight through to it.
 *
 * Two consequences follow, and both are load-bearing:
 *
 * 1. Because the base is `DEFAULTS`, ANY field left unset here is ON. There is
 *    no partial version of this object. Every field the SDK knows about must be
 *    named, and `sentry-data-collection.test.ts` fails if one is missing.
 * 2. Deleting the block would be safer than leaving it empty — with
 *    `dataCollection` absent the legacy `sendDefaultPii` bridge runs and
 *    defaults `userInfo` to false. We do not rely on that. The SDK source
 *    carries a TODO to remove that bridge in v11, at which point an absent
 *    block would silently flip to the permissive defaults. Explicit survives
 *    the upgrade; absent does not.
 *
 * Why this product and not in general: this system holds prospects' names,
 * email addresses, and the text of real cold outreach and real replies. HTTP
 * request and response bodies off this server ARE that data. So are database
 * query values, and so are the local variables in a frame inside the send
 * pipeline. A privacy policy is published describing how that data is handled;
 * shipping it to a third-party error tracker contradicts it.
 *
 * This removes the personal data from error monitoring without removing the
 * monitoring: stack traces, error messages, breadcrumbs, route names, span
 * timings and sanitised (parameterised) SQL statements are all still collected.
 */
import type { DataCollection } from "@sentry/core";

export const SENTRY_DATA_COLLECTION: Required<Omit<DataCollection, "queryParams">> = {
  /** Prospect and staff identities. Never. */
  userInfo: false,

  /** Session cookies. Nothing here diagnoses an error that the stack does not. */
  cookies: false,

  /**
   * Decided deliberately rather than copied. `false` on both, not a deny-list:
   * request headers carry the next-auth session cookie and outgoing ones carry
   * Microsoft Graph and Google bearer tokens, and a deny-list only redacts the
   * key names the SDK happens to ship — a list that can change under us on an
   * upgrade. `false` cannot regress. The cost is small: the route, the status
   * and the stack trace are all still collected and are what an error is
   * actually diagnosed from.
   */
  httpHeaders: { request: false, response: false },

  /**
   * The bodies of real outreach and real replies. An empty array disables body
   * collection entirely — an OMITTED value would collect all four.
   */
  httpBodies: [],

  /** Query strings on this app carry contact search terms, i.e. email addresses. */
  urlQueryParams: false,

  /** No GraphQL integration is enabled; off so enabling one is a decision, not an inheritance. */
  graphQL: { document: false, variables: false },

  /** No AI integration is enabled; same reasoning as GraphQL. */
  genAI: { inputs: false, outputs: false },

  /**
   * Query parameters, inline literals, mutation bodies and returned rows — on
   * this schema that is the prospect table. Sanitised `db.query.text` and
   * structural metadata (system, operation, table) are NOT controlled by this
   * flag and are still collected, which is what makes a slow query diagnosable.
   */
  databaseQueryData: false,

  /**
   * Local variables in stack frames. A frame inside the send pipeline holds the
   * recipient address and the rendered email body. Note this is stricter than
   * even the legacy `sendDefaultPii: false` path, which left it true.
   */
  stackFrameVariables: false,

  /**
   * Source lines around the frame — our own source, not user data. Kept at the
   * SDK default so traces stay readable.
   */
  frameContextLines: 5,
};
