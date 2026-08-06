/**
 * PR M — One-click unsubscribe readiness helper.
 *
 * Centralises the policy check used by send governance call sites to
 * decide whether one-click unsubscribe is wired end-to-end.
 *
 * Returns `true` only when:
 *   * a public base URL is configured (AUTH_URL or INTERNAL_APP_URL),
 *     so the link we plant in outbound emails resolves to something
 *     the recipient's browser can open; AND
 *   * the public base URL is an absolute `http(s)` origin — localhost
 *     is accepted so local dev flows still mark the feature as ready.
 *
 * Real prospect sends still require LIVE_PROSPECT launch approval,
 * operator confirmation, and suppression/capacity checks — this
 * helper only reports whether the unsubscribe rail is wired.
 */

import { normaliseUnsubscribeMailtoAddress } from "@/lib/unsubscribe/list-unsubscribe-headers";

/** Trim + fallback resolution for the public base URL. */
export function resolvePublicBaseUrl(): string | null {
  const envs = [
    process.env.AUTH_URL,
    process.env.INTERNAL_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];
  for (const raw of envs) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return trimmed.replace(/\/+$/, "");
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Pure predicate used by send governance call sites. See
 * `src/lib/clients/client-send-governance.ts` for how the result maps
 * to the real-prospect gate.
 */
export function isOneClickUnsubscribeReady(): boolean {
  return resolvePublicBaseUrl() !== null;
}

/**
 * Which opt-out rail a send will use.
 *
 *   * `hosted` — RFC 8058 one-click over HTTPS, on a base URL the caller has
 *     already decided is safe to put in front of this recipient.
 *   * `mailto` — opt-out by replying to the sending mailbox. Carries no domain
 *     other than the sender's. Replies are ingested by the normal reply sync
 *     and suppressed by `classifyOptOutReply`.
 *   * `none` — no working opt-out. Governance must block a real-prospect send.
 */
export type UnsubscribeRail =
  | { kind: "hosted"; baseUrl: string }
  | { kind: "mailto"; address: string }
  | { kind: "none" };

/**
 * Resolve the opt-out rail for a send.
 *
 * `alignedBaseUrl` is passed by the caller, NOT read from the environment, and
 * that is deliberate. A real-prospect send must only ever pass a base URL that
 * is sender-aligned (`go.<client-domain>`); passing the OpensDoors app domain
 * is exactly the link misalignment that caused the 2026 quarantine incident.
 * Internal proof and governed-test sends may pass the app base URL, because
 * those recipients are allowlisted and no third-party domain reputation is at
 * stake.
 *
 * With no aligned base URL the rail falls to `mailto` — which is the normal
 * case today, since no client has a verified link domain configured.
 */
export function resolveUnsubscribeRail(input: {
  /** A base URL the caller has confirmed is safe for THIS recipient, or null. */
  alignedBaseUrl?: string | null;
  /** Address the email is sent from — the mailto opt-out target. */
  sendingMailboxAddress?: string | null;
}): UnsubscribeRail {
  const hosted = input.alignedBaseUrl?.trim().replace(/\/+$/, "") || null;
  if (hosted) return { kind: "hosted", baseUrl: hosted };

  const address = normaliseUnsubscribeMailtoAddress(input.sendingMailboxAddress);
  if (address) return { kind: "mailto", address };

  return { kind: "none" };
}

/**
 * Whether a send has any working opt-out at all.
 *
 * This is the predicate the real-prospect governance gate uses. It is a
 * WIDENING of the previous "is a public base URL configured?" check, not a
 * loosening: a monitored mailto is a genuinely usable opt-out, while `none`
 * still blocks exactly as before.
 */
export function isUnsubscribeRailUsable(rail: UnsubscribeRail): boolean {
  return rail.kind !== "none";
}
