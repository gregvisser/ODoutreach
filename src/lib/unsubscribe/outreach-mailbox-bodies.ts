/**
 * Single assembly point for governed mailbox sends: message → branded
 * signature/disclaimer → unsubscribe. Ensures HTML carries
 * `senderSignatureHtml` before the unsubscribe anchor.
 */

import {
  appDomainsFromEnv,
  registrableDomainOf,
} from "@/lib/clients/signature-link-alignment";
import {
  chooseSignatureForSend,
  normaliseSignatureHtml,
  type SenderSignatureMailbox,
} from "@/lib/mailboxes/sender-signature";

import {
  buildCleanUnsubscribeHtmlBody,
  escapeHtmlAttr,
  extractUnsubscribeUrlFromPlainTextBody,
  plainTextToHtmlParagraphs,
  stripPlainTextUnsubscribeFooter,
  type EmailBodyParts,
} from "@/lib/unsubscribe/email-body-parts";
import { ensureUnsubscribeLinkInPlainTextBody } from "@/lib/unsubscribe/ensure-unsubscribe-in-body";
import { normaliseUnsubscribeMailtoAddress } from "@/lib/unsubscribe/list-unsubscribe-headers";

export function stripTrailingPlainSignature(
  messageBody: string,
  signatureText: string | null,
): string {
  if (!signatureText?.trim()) return messageBody.replace(/\s+$/u, "");
  const sig = signatureText.trim();
  const b = messageBody.replace(/\s+$/u, "");
  if (b.endsWith(sig)) return b.slice(0, -sig.length).trimEnd();
  const withSep = `\n\n${sig}`;
  if (b.endsWith(withSep)) return b.slice(0, -withSep.length).trimEnd();
  return messageBody.replace(/\s+$/u, "");
}

/**
 * Visible opt-out line used on the mailto rail.
 *
 * Deliberately carries NO link. On this rail the whole point is that the email
 * contains no URL on any domain other than the sender's, so the opt-out is an
 * instruction rather than an anchor. Replies are ingested by the normal reply
 * sync and suppressed by `classifyOptOutReply`.
 *
 * Exported so tests and preview surfaces assert the exact same wording the
 * recipient sees.
 */
export const MAILTO_OPT_OUT_LINE =
  "To opt out, reply STOP to this email and we'll remove you.";

/**
 * Rebuilds plain + HTML bodies from the persisted snapshot and mailbox row.
 *
 * Two opt-out rails, mutually exclusive:
 *
 *   * `hostedUnsubscribeUrl` — renders the usual "Unsubscribe" anchor. Only
 *     pass a URL that is safe to show THIS recipient; for a real prospect that
 *     means a sender-aligned domain, never the OpensDoors app domain.
 *   * `mailtoUnsubscribeAddress` — used only when there is no hosted URL.
 *     Renders {@link MAILTO_OPT_OUT_LINE}, adding a visible opt-out with no
 *     link. Without this the no-URL branch produces a body with no opt-out at
 *     all, which is not acceptable for outreach.
 *
 * Passing neither preserves the previous no-footer behaviour exactly, so
 * existing callers are unaffected.
 */
/**
 * A snapshot URL is reusable only when it is on the sending mailbox's own
 * registrable domain. Anything else — most of all the OpensDoors app domain —
 * is discarded, and the caller's chosen rail stands.
 *
 * Exported for tests: the interesting cases are all about what it REFUSES.
 */
export function resolveAlignedSnapshotUrl(
  bodySnapshotPlain: string,
  sendingMailboxEmail: string,
): string | null {
  const extracted = extractUnsubscribeUrlFromPlainTextBody(bodySnapshotPlain);
  if (!extracted) return null;

  // A mailto: opt-out carries no host at all, so there is nothing to misalign.
  if (/^mailto:/i.test(extracted)) return extracted;

  const senderDomain = registrableDomainOf(sendingMailboxEmail.split("@").pop());
  const linkDomain = registrableDomainOf(extracted);
  // Unresolvable either side: refuse. A guess here becomes a false clean.
  if (!senderDomain || !linkDomain) return null;
  if (linkDomain !== senderDomain) return null;
  // Belt and braces: never reuse our own platform domain even if a client
  // somehow shares a registrable domain with it. Suffix match, because
  // `azurewebsites.net` is itself a public suffix.
  const host = (() => {
    try {
      return new URL(extracted).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  for (const app of appDomainsFromEnv()) {
    if (host === app || host.endsWith(`.${app}`)) return null;
  }
  return extracted;
}

export function buildMailboxGovernedEmailBodies(input: {
  bodySnapshotPlain: string;
  /** Prisma `ClientMailboxIdentity` rows satisfy this shape. */
  mailbox: SenderSignatureMailbox;
  hostedUnsubscribeUrl?: string | null;
  /** Opt-out address for the mailto rail. Ignored when a hosted URL is given. */
  mailtoUnsubscribeAddress?: string | null;
}): EmailBodyParts {
  const hosted = input.hostedUnsubscribeUrl?.trim() || null;
  // A URL scavenged from the stored snapshot may only be reused if it is
  // ALIGNED with the sending mailbox's own domain.
  //
  // `hostedUnsubscribeUrl === null` is not missing information — it is how a
  // caller SAYS "this recipient gets the mailto rail, because there is no
  // sender-aligned domain to host a link on". Taking `extracted` unconditionally
  // overrode that decision with whatever URL happened to be in the snapshot, and
  // the mailto opt-out below was then suppressed because `url` had become
  // truthy. The deliberate safe choice was silently converted into the unsafe
  // one.
  //
  // Not theoretical: measured on production 2026-08-24, 1358 of 1358 sent emails
  // carry an unsubscribe URL on the OpensDoors app domain inside `bodySnapshot`
  // and ZERO use the mailto rail. Those snapshots predate the 2026-08-06 rail
  // fix, so they are exactly the poisoned input this line reads.
  const extracted = resolveAlignedSnapshotUrl(
    input.bodySnapshotPlain,
    input.mailbox.email,
  );
  const url = hosted ?? extracted ?? null;

  // Mailto rail applies only when no usable URL is available.
  const mailtoOptOut = url
    ? null
    : normaliseUnsubscribeMailtoAddress(input.mailtoUnsubscribeAddress);

  // Strip the snapshot's existing opt-out footer whenever we are going to
  // append a replacement — on EITHER rail.
  //
  // Previously this only stripped when `url` was truthy. So a snapshot footer
  // we had just REFUSED to reuse (misaligned host) was left sitting in the
  // message body as visible text, and the foreign URL went out anyway — merely
  // as text rather than as an anchor. Refusing to link it while still printing
  // it is not a fix.
  let bodyNoFooter = input.bodySnapshotPlain;
  if (url || mailtoOptOut) {
    bodyNoFooter = stripPlainTextUnsubscribeFooter(input.bodySnapshotPlain);
  }

  const sel = chooseSignatureForSend({
    mailbox: input.mailbox,
    clientBrief: { senderDisplayNameFallback: null, emailSignatureFallback: null },
  });
  const sigText = sel.emailSignatureText?.trim() ?? "";

  const messageCore = stripTrailingPlainSignature(bodyNoFooter, sigText ? sigText : null);

  const plainWithSig = sigText
    ? `${messageCore.replace(/\s+$/u, "")}\n\n${sigText}`
    : messageCore.replace(/\s+$/u, "");

  const plainFinal = url
    ? ensureUnsubscribeLinkInPlainTextBody(plainWithSig, url)
    : mailtoOptOut
      ? `${plainWithSig.replace(/\s+$/u, "")}\n\n---\n${MAILTO_OPT_OUT_LINE}`
      : plainWithSig;

  const normHtml = normaliseSignatureHtml(input.mailbox.senderSignatureHtml);
  const msgHtml = plainTextToHtmlParagraphs(messageCore);

  const sigHtmlBlock = (() => {
    if (normHtml.length > 0) {
      return `<div class="od-outreach-signature">${normHtml}</div>`;
    }
    if (sigText.length > 0) {
      return `<div class="od-outreach-signature">${plainTextToHtmlParagraphs(sigText)}</div>`;
    }
    return "";
  })();

  let html: string;
  if (url) {
    const footer = `<p><a href="${escapeHtmlAttr(url)}">Unsubscribe</a></p>`;
    const middle = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
    html = middle
      ? `${middle}\n${footer}`
      : buildCleanUnsubscribeHtmlBody({ bodyText: plainFinal, unsubscribeUrl: url });
  } else if (mailtoOptOut) {
    // No link — an instruction only, so the email carries no foreign host.
    const footer = plainTextToHtmlParagraphs(MAILTO_OPT_OUT_LINE);
    const middle = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
    html = middle ? `${middle}\n${footer}` : footer;
  } else {
    html = [msgHtml, sigHtmlBlock].filter(Boolean).join("\n");
  }

  return { text: plainFinal, html };
}
