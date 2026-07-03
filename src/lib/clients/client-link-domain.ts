/**
 * Per-client sender-aligned outreach link domain (`go.<customer-domain>`).
 *
 * Outreach is sent FROM the client's own domain, so its unsubscribe + open-
 * tracking links must live on a domain that ALIGNS with the sender — a `go.`
 * subdomain of the client's domain. Cross-domain links (e.g. links on a shared
 * opensdoors.bidlow.co.uk while sending from paratus365.com) read as phishing
 * and get quarantined/junked, harming the customer's own domain reputation.
 *
 * Hard rule: real-prospect outreach is only allowed once a client's aligned link
 * domain is set + verified. Enforced in `evaluateSendGovernance` via the
 * `linkDomainAligned` input, gated by `OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN` so
 * it can be staged on safely (off ⇒ behaviour is unchanged).
 */

export type ClientLinkDomainFields = {
  outreachLinkDomain: string | null;
  outreachLinkDomainVerifiedAt: Date | null;
};

/** The `go.<domain>` subdomain for a sending domain or email address (null if unparseable). */
export function deriveGoLinkDomain(sendingDomainOrEmail: string): string | null {
  const raw = sendingDomainOrEmail?.trim().toLowerCase() ?? "";
  const afterAt = raw.includes("@") ? (raw.split("@").pop() ?? "") : raw;
  const host = afterAt.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  if (!host || !host.includes(".")) return null;
  return host.startsWith("go.") ? host : `go.${host}`;
}

/** True when the client's aligned link domain is configured AND verified. */
export function isClientLinkDomainReady(client: ClientLinkDomainFields): boolean {
  return (
    typeof client.outreachLinkDomain === "string" &&
    client.outreachLinkDomain.trim().length > 0 &&
    client.outreachLinkDomainVerifiedAt != null
  );
}

/** `https://<link-domain>` base URL for this client's outreach links, or null when not ready. */
export function resolveClientLinkBaseUrl(
  client: ClientLinkDomainFields,
): string | null {
  if (!isClientLinkDomainReady(client)) return null;
  const host = (client.outreachLinkDomain ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return host ? `https://${host}` : null;
}

/** Whether the aligned-link-domain hard rule is enforced system-wide. Off unless enabled. */
export function isAlignedLinkDomainRequired(): boolean {
  return process.env.OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN === "on";
}

/**
 * Value for `evaluateSendGovernance`'s `linkDomainAligned`. When the rule isn't
 * enforced this is always `true` (no behaviour change); when enforced, the client
 * must have a ready aligned link domain or real-prospect sends are blocked.
 */
export function clientLinkDomainAligned(client: ClientLinkDomainFields): boolean {
  if (!isAlignedLinkDomainRequired()) return true;
  return isClientLinkDomainReady(client);
}
