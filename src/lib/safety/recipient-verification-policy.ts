import { extractDomainFromEmail, isValidEmailFormat, normalizeEmail } from "@/lib/normalize";

/**
 * Recipient address verification — the decision half.
 *
 * WHAT WAS MISSING. Until this module, the only thing resembling address
 * verification in ODoutreach was a format regex applied at CSV import
 * (`import-csv.ts`) and at RocketReach import (`person-import.ts`). Two
 * consequences followed:
 *
 *   1. Contacts materialised from the Universe (`universe-to-client-list.ts`)
 *      skip both of those paths — that code checks only that the address is
 *      non-empty — so an address of any shape could become sendable.
 *   2. Nothing anywhere asked the only question that actually predicts a
 *      bounce: *can this domain receive mail at all?* A regex is happy with
 *      `someone@gmial.com`. The recipient's nameservers are not.
 *
 * A domain with no mail destination cannot accept a message. Every send to one
 * is a guaranteed hard bounce, and hard bounces are what damage a sending
 * reputation — the scar this project already carries.
 *
 * WHAT THIS IS NOT. This is not the paid list-verification service the cold
 * outreach industry sells (ZeroBounce, NeverBounce and friends), which probes
 * individual MAILBOXES over SMTP. That is a per-address cost and therefore
 * Greg's decision, not an agent's — see docs/LIST-VERIFICATION.md. This is the
 * free domain-level half, which is where the large, cheap wins are: typos,
 * dead companies, parked domains, web-only domains.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO HOLD. "Proven undeliverable" and
 * "could not find out" are different answers and must not share a branch. A
 * resolver timeout says nothing about the recipient; treating it as a block
 * would convert a DNS blip into a silent send outage for a live client. So an
 * unknown answer DEFERS — the row goes back on the queue and is tried again —
 * which neither sends nor destroys it.
 */

/** What the recipient's domain says about where mail for it should go. */
export type RecipientMailRoute =
  /** An MX record, or (RFC 5321 §5.1) an address record acting as implicit MX. */
  | { status: "has_route"; via: "mx" | "address_record" }
  /** The domain resolves but publishes nowhere for mail to land. Proven bad. */
  | { status: "no_route" }
  /** The nameservers say this domain does not exist. Proven bad. */
  | { status: "domain_missing" }
  /** The lookup failed. This is evidence about the resolver, not the recipient. */
  | { status: "unknown"; error: string };

export type RecipientVerificationVerdict = "send" | "block" | "defer";

export type RecipientVerificationDecision = {
  verdict: RecipientVerificationVerdict;
  /** Stamped onto `OutboundEmail.lastErrorCode` so the row explains itself. */
  code: string;
  /** Written for the operator who asks "why did this one not go out?". */
  reason: string;
};

const SEND: RecipientVerificationDecision = {
  verdict: "send",
  code: "RECIPIENT_VERIFIED",
  reason: "Recipient domain can receive mail.",
};

/**
 * Decide what to do with one recipient, given the shape of the address and
 * what DNS said about its domain.
 *
 * Pure: no I/O, no clock, no database. The lookup lives in
 * `src/server/outreach/recipient-mail-route.ts`; keeping the two apart is what
 * makes every branch here testable without a network.
 *
 * `route` may be null when the caller has not looked the domain up — which is
 * correct and expected for a malformed address, since there is no point asking
 * DNS about a string that is not an address.
 */
export function classifyRecipientAddress(input: {
  email: string;
  route: RecipientMailRoute | null;
  /** Defaults true. The kill switch resolves here so one place decides. */
  enabled?: boolean;
}): RecipientVerificationDecision {
  if (input.enabled === false) return SEND;

  const email = normalizeEmail(input.email ?? "");
  if (!isValidEmailFormat(email)) {
    return {
      verdict: "block",
      code: "RECIPIENT_ADDRESS_MALFORMED",
      reason:
        `"${email}" is not a valid email address, so it was not sent. ` +
        `Correct or remove this contact.`,
    };
  }

  const domain = extractDomainFromEmail(email);

  if (!input.route) return SEND;

  switch (input.route.status) {
    case "has_route":
      return SEND;

    case "domain_missing":
      return {
        verdict: "block",
        code: "RECIPIENT_DOMAIN_DOES_NOT_EXIST",
        reason:
          `The domain "${domain}" does not exist, so nothing was sent. ` +
          `This is usually a typo in the address.`,
      };

    case "no_route":
      return {
        verdict: "block",
        code: "RECIPIENT_DOMAIN_CANNOT_RECEIVE_MAIL",
        reason:
          `The domain "${domain}" exists but does not accept email, so nothing ` +
          `was sent. Sending would have bounced.`,
      };

    case "unknown":
      return {
        verdict: "defer",
        code: "RECIPIENT_VERIFICATION_UNAVAILABLE",
        reason:
          `Could not check whether "${domain}" accepts email ` +
          `(${input.route.error}). Will try again shortly.`,
      };
  }
}
