import {
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_APP_MISCONFIGURED_REASON,
  MAILBOX_OAUTH_EXPIRED_STATE_REASON,
  MAILBOX_OAUTH_MAILBOX_ACCESS_DENIED_REASON,
  MAILBOX_OAUTH_NO_REFRESH_TOKEN_REASON,
  MAILBOX_OAUTH_PROFILE_UNAVAILABLE_REASON,
  MAILBOX_OAUTH_TOKEN_EXCHANGE_REJECTED_REASON,
} from "@/lib/mailboxes/mailbox-oauth-failure-reason";
import { isValidEmailFormat, normalizeEmail } from "@/lib/normalize";

/**
 * The banner shown on the mailboxes page after a mailbox OAuth round-trip.
 *
 * Two things went wrong here before 2026-08-28 and both are fixed in this file.
 *
 * 1. The banner hardcoded the word "Microsoft" into five of its six messages —
 *    written when Microsoft was the only provider and never revisited when
 *    Google was added. A Google mailbox that failed to connect was told to check
 *    Microsoft. The provider now arrives as an argument, read from the persisted
 *    mailbox row by the caller, because the OAuth result is a URL parameter and
 *    a URL parameter is a guess.
 * 2. Approving as the wrong account was flattened to `callback_failed`, which
 *    tells the operator nothing. It has its own reason code and its own message
 *    naming BOTH addresses — the one that approved and the one on the row. A
 *    mismatch message that does not print both addresses is half a message.
 *
 * Pure on purpose: the page is a server component wrapped in auth and Prisma,
 * so this is the layer that can be tested.
 */

export type MailboxOAuthBannerProvider = "MICROSOFT" | "GOOGLE" | null;

export type MailboxOAuthBanner = { type: "ok" | "err"; text: string };

/**
 * The reason vocabulary lives in `mailbox-oauth-failure-reason.ts` — one list,
 * so a code cannot exist without a sentence. Re-exported here because the two
 * callback routes have always imported these from this module and the import
 * path is not what this change is about.
 */
export {
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_EXPIRED_STATE_REASON,
};

/**
 * How to name the provider mid-sentence. Never sentence-initial, so the
 * unknown-row case ("your email provider") still reads as English.
 */
function providerLabel(provider: MailboxOAuthBannerProvider): string {
  if (provider === "GOOGLE") return "Google";
  if (provider === "MICROSOFT") return "Microsoft";
  return "your email provider";
}

/** One wording, used for the banner AND for the error stored on the row. */
export function formatMailboxOAuthAccountMismatch(
  approvedAs: string,
  mailboxRowEmail: string,
): string {
  return (
    `You approved as ${approvedAs}, but this mailbox is ${mailboxRowEmail}. ` +
    `Sign in as ${mailboxRowEmail}, or ask that person to connect their own mailbox.`
  );
}

export type MailboxOAuthSearchParams = {
  result: string | null;
  reason: string | null;
  mailboxId: string | null;
  /** The address that completed the provider consent screen, if it was sent. */
  approvedEmail: string | null;
};

function firstParam(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the callback's redirect query.
 *
 * `oauth_actor` rides on the URL because it is the one fact the page cannot
 * look up: the account a person chose on Google's or Microsoft's own screen.
 * That makes it attacker-suppliable, so it is accepted only when it is shaped
 * like an email address and short enough to be one. It is rendered as text by
 * React, never as markup — the check is here to stop a hand-typed URL putting a
 * sentence of its own choosing into an error banner.
 */
export function readMailboxOAuthSearchParams(
  sp: Record<string, string | string[] | undefined>,
): MailboxOAuthSearchParams {
  const actorRaw = firstParam(sp.oauth_actor);
  const approvedEmail =
    actorRaw && actorRaw.length <= 254 && isValidEmailFormat(actorRaw)
      ? normalizeEmail(actorRaw)
      : null;
  return {
    result: firstParam(sp.mailbox_oauth),
    reason: firstParam(sp.reason),
    mailboxId: firstParam(sp.oauth_mailbox_id),
    approvedEmail,
  };
}

export type MailboxOAuthBannerInput = {
  result: string | null | undefined;
  reason: string | null | undefined;
  /** From the persisted mailbox row — never from the URL. */
  provider: MailboxOAuthBannerProvider;
  /** From the persisted mailbox row — never from the URL. */
  mailboxEmail: string | null;
  approvedEmail: string | null;
  /** The row was re-read and really is CONNECTED. */
  verifiedConnected: boolean;
  /** The redirect identified which mailbox it was for. */
  hasMailboxId: boolean;
};

export function mailboxOAuthBanner(
  input: MailboxOAuthBannerInput,
): MailboxOAuthBanner | null {
  const p = providerLabel(input.provider);

  if (input.result === "connected") {
    // A read-model overlay must not decide success: the caller re-reads the row.
    if (input.hasMailboxId && !input.verifiedConnected) {
      return {
        type: "err",
        text: `Sign-in with ${p} came back, but this mailbox is still not connected. Open the row below and press Connect again.`,
      };
    }
    return { type: "ok", text: "Mailbox connected. Connection status was updated." };
  }

  if (input.result !== "error") return null;

  switch (input.reason) {
    case MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON: {
      if (input.approvedEmail && input.mailboxEmail) {
        return {
          type: "err",
          text: formatMailboxOAuthAccountMismatch(
            input.approvedEmail,
            input.mailboxEmail,
          ),
        };
      }
      if (input.mailboxEmail) {
        return {
          type: "err",
          text: `The ${p} account that approved this sign-in is not ${input.mailboxEmail}. Sign in as ${input.mailboxEmail}, or ask that person to connect their own mailbox.`,
        };
      }
      return {
        type: "err",
        text: "The account that approved this sign-in is not the mailbox on this row. Press Connect again and sign in as that mailbox.",
      };
    }
    case MAILBOX_OAUTH_EXPIRED_STATE_REASON:
      return {
        type: "err",
        text: "That sign-in link timed out — they are only good for 15 minutes. Press Connect on the row below and finish signing in without leaving it open.",
      };
    case "missing_state":
    case "unknown_state":
      return {
        type: "err",
        text: "That sign-in link was not recognised — it may already have been used. Press Connect on the row below to start again.",
      };
    case "mailbox_removed":
      return {
        type: "err",
        text: "That mailbox was removed from this workspace. Restore it first, then press Connect.",
      };
    case "provider_denied":
      return {
        type: "err",
        text: `Sign-in with ${p} was cancelled or refused. Press Connect and approve each prompt to continue.`,
      };
    case "missing_code":
      return {
        type: "err",
        text: `Sign-in with ${p} came back without a sign-in code. Press Connect to try again.`,
      };
    // The five below replaced a single `callback_failed`. Each one names what
    // failed and gives ONE next move; where that move is not the operator's to
    // make, it says whose it is instead of sending them round Connect again.
    case MAILBOX_OAUTH_TOKEN_EXCHANGE_REJECTED_REASON:
      return {
        type: "err",
        text: `${p} refused to complete the sign-in — this usually means the sign-in link was reused or had already expired. Press Connect and finish signing in straight away, in one go.`,
      };
    case MAILBOX_OAUTH_NO_REFRESH_TOKEN_REASON:
      return {
        type: "err",
        text: `${p} signed in but did not give ongoing access, so the connection would stop working within the hour. Press Connect again and approve every prompt${input.provider === "GOOGLE" ? " — if it happens twice, remove OpensDoors under your Google account's third-party access first, then reconnect" : ""}.`,
      };
    case MAILBOX_OAUTH_PROFILE_UNAVAILABLE_REASON:
      return {
        type: "err",
        text: `${p} would not confirm which account had signed in, so this mailbox was left disconnected rather than connected to the wrong account. Press Connect to try again in a few minutes.`,
      };
    case MAILBOX_OAUTH_MAILBOX_ACCESS_DENIED_REASON:
      return {
        type: "err",
        text: input.mailboxEmail
          ? `That sign-in worked, but the account has no permission to send from ${input.mailboxEmail}. Ask the customer's IT administrator to grant it access to that mailbox, or connect while signed in as ${input.mailboxEmail}.`
          : `That sign-in worked, but the account has no permission to send from this mailbox. Ask the customer's IT administrator to grant access, or connect while signed in as the mailbox itself.`,
      };
    case MAILBOX_OAUTH_APP_MISCONFIGURED_REASON:
      return {
        type: "err",
        text: `OpensDoors is not set up to connect ${p} mailboxes yet — nothing you do on this page will fix it. Ask an administrator to check the mailbox sign-in settings, then try again.`,
      };
    case "callback_failed":
      return {
        type: "err",
        text: `Sign-in with ${p} did not finish, and the cause was not one we recognise. Press Connect to try again — if it keeps failing, ask the owner account to read the connection diagnostics on that row, which now record the underlying error.`,
      };
    default:
      return {
        type: "err",
        text: `Sign-in with ${p} did not complete. Press Connect on the row below to try again.`,
      };
  }
}
