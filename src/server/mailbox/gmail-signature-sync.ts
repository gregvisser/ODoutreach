import "server-only";

import {
  htmlSignatureToText,
  normaliseSignatureHtml,
} from "@/lib/mailboxes/sender-signature";

// NOTE: `getGoogleGmailAccessTokenForMailbox` is imported lazily inside
// `syncGmailSignatureForMailbox` because it transitively pulls in the
// Prisma pool, which requires `DATABASE_URL`. The pure helpers above
// (`fetchGmailSendAsForToken`, `selectSendAsFromPayload`) stay importable
// from unit tests without a database.

/**
 * Gmail signature sync (PR — mailbox sender signatures, 2026-04-22).
 *
 * Reads `users.settings.sendAs` for a connected Google mailbox and picks
 * the entry that matches the mailbox email (falling back to the default
 * / primary sendAs). Returns a structured result so callers can persist
 * the derived `senderDisplayName` / `senderSignatureHtml` / `-Text` /
 * `-Source` / `-SyncedAt` / `-SyncError` fields on `ClientMailboxIdentity`
 * without throwing.
 *
 * Safety:
 *   * Read-only — only issues `GET users/me/settings/sendAs`.
 *   * Never sends mail, never mutates the Gmail account.
 *   * Uses the existing OAuth token helper; will not force reconnect.
 *   * Surfaces 403 / missing-scope errors with an operator-friendly hint
 *     instead of crashing (`scope_missing` discriminant).
 *
 * Scope note:
 *   `users.settings.sendAs.list` is satisfied by any of
 *     - https://mail.google.com/
 *     - gmail.modify
 *     - gmail.readonly   <-- ODoutreach already requests this
 *     - gmail.settings.basic
 *     - gmail.settings.sharing
 *   so the current mailbox OAuth scope set is sufficient. No reconnect is
 *   required for the read path.
 */

const SEND_AS_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";

type RawSendAs = {
  sendAsEmail?: unknown;
  displayName?: unknown;
  signature?: unknown;
  isPrimary?: unknown;
  isDefault?: unknown;
  verificationStatus?: unknown;
};

type RawSendAsList = {
  sendAs?: unknown;
};

export type GmailSignatureSyncSuccess = {
  ok: true;
  /** Chosen `sendAsEmail`, lower-cased. */
  matchedEmail: string;
  /** Display name returned by Gmail (may be empty). */
  displayName: string | null;
  /** Raw HTML signature after `normaliseSignatureHtml`. */
  signatureHtml: string | null;
  /** Plain-text rendering after `htmlSignatureToText`. */
  signatureText: string | null;
  /**
   * Selection reason — `exact_match` when the mailbox email matched a
   * `sendAsEmail`, `default` for `isDefault`, `primary` for `isPrimary`.
   */
  selection: "exact_match" | "default" | "primary";
};

export type GmailSignatureSyncFailure = {
  ok: false;
  /**
   * `scope_missing` — 403 from Gmail; suggests reconnect with
   * `gmail.settings.basic` even though `gmail.readonly` is normally
   * sufficient (some Workspace policies restrict the settings surface).
   *
   * `no_sendas_match` — the response parsed but none of the entries
   * matched the mailbox email and no default/primary was flagged.
   *
   * `http_error` — any other non-2xx from Gmail; status + body captured
   * in `detail`.
   *
   * `network_error` — `fetch` threw (DNS, reset, etc.).
   */
  code:
    | "scope_missing"
    | "no_sendas_match"
    | "http_error"
    | "network_error"
    | "invalid_response";
  /** Short human-readable operator hint. */
  message: string;
  /** Optional detail string (status line, response snippet) for audit/logs. */
  detail?: string;
};

export type GmailSignatureSyncResult =
  | GmailSignatureSyncSuccess
  | GmailSignatureSyncFailure;

/**
 * Hook for tests — accepts an injected `fetch` implementation. Production
 * callers should use `syncGmailSignatureForMailbox` (below) which wires
 * in the global `fetch`.
 */
export async function fetchGmailSendAsForToken(params: {
  accessToken: string;
  mailboxEmail: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSignatureSyncResult> {
  const impl = params.fetchImpl ?? fetch;
  const target = (params.mailboxEmail ?? "").trim().toLowerCase();

  let res: Response;
  try {
    res = await impl(SEND_AS_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      code: "network_error",
      message: "Could not reach Gmail settings API.",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  if (res.status === 403) {
    const body = await safeReadBody(res);
    return {
      ok: false,
      code: "scope_missing",
      message:
        "Gmail signature sync requires Gmail settings permission — reconnect this mailbox with the signature scope and retry.",
      detail: body,
    };
  }
  if (!res.ok) {
    const body = await safeReadBody(res);
    return {
      ok: false,
      code: "http_error",
      message: `Gmail settings API returned HTTP ${res.status}.`,
      detail: body,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (e) {
    return {
      ok: false,
      code: "invalid_response",
      message: "Gmail settings API returned a non-JSON body.",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  return selectSendAsFromPayload(payload, target);
}

/**
 * Exported for unit tests — pick the right `sendAs` entry without any
 * network access.
 */
export function selectSendAsFromPayload(
  payload: unknown,
  mailboxEmailNormalized: string,
): GmailSignatureSyncResult {
  const outer = (payload ?? {}) as RawSendAsList;
  const list = Array.isArray(outer.sendAs) ? (outer.sendAs as RawSendAs[]) : [];
  if (list.length === 0) {
    return {
      ok: false,
      code: "no_sendas_match",
      message: "Gmail returned no sendAs identities for this account.",
    };
  }

  const normalised = list
    .map((entry) => {
      const sendAsEmail =
        typeof entry.sendAsEmail === "string"
          ? entry.sendAsEmail.trim().toLowerCase()
          : "";
      const displayName =
        typeof entry.displayName === "string" && entry.displayName.trim().length > 0
          ? entry.displayName.trim()
          : null;
      const signatureHtml = normaliseSignatureHtml(
        typeof entry.signature === "string" ? entry.signature : null,
      );
      const isPrimary = entry.isPrimary === true;
      const isDefault = entry.isDefault === true;
      return {
        sendAsEmail,
        displayName,
        signatureHtml: signatureHtml.length > 0 ? signatureHtml : null,
        isPrimary,
        isDefault,
      };
    })
    .filter((e) => e.sendAsEmail.length > 0);

  const byExact = normalised.find(
    (e) => e.sendAsEmail === mailboxEmailNormalized,
  );
  const byDefault = normalised.find((e) => e.isDefault);
  const byPrimary = normalised.find((e) => e.isPrimary);

  const picked = byExact ?? byDefault ?? byPrimary ?? null;
  if (!picked) {
    return {
      ok: false,
      code: "no_sendas_match",
      message:
        "Gmail returned sendAs entries but none matched this mailbox and no default/primary entry was flagged.",
    };
  }

  const signatureText = picked.signatureHtml
    ? htmlSignatureToText(picked.signatureHtml)
    : "";

  const selection: GmailSignatureSyncSuccess["selection"] = byExact
    ? "exact_match"
    : byDefault
      ? "default"
      : "primary";

  return {
    ok: true,
    matchedEmail: picked.sendAsEmail,
    displayName: picked.displayName,
    signatureHtml: picked.signatureHtml,
    signatureText: signatureText.length > 0 ? signatureText : null,
    selection,
  };
}

/**
 * Sync the Gmail signature for a connected Google mailbox.
 *
 * This function performs the read only — it does NOT write to the
 * database. The server action layer persists the resolved fields so we
 * keep IO boundaries explicit (and this module testable without Prisma).
 */
export async function syncGmailSignatureForMailbox(params: {
  mailboxIdentityId: string;
  mailboxEmail: string;
}): Promise<GmailSignatureSyncResult> {
  try {
    const { getGoogleGmailAccessTokenForMailbox } = await import(
      "@/server/mailbox/google-mailbox-access"
    );
    const token = await getGoogleGmailAccessTokenForMailbox(
      params.mailboxIdentityId,
    );
    return await fetchGmailSendAsForToken({
      accessToken: token,
      mailboxEmail: params.mailboxEmail,
    });
  } catch (e) {
    return {
      ok: false,
      code: "network_error",
      message:
        e instanceof Error
          ? e.message
          : "Could not refresh mailbox OAuth token for signature sync.",
    };
  }
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.length > 2000 ? `${t.slice(0, 2000)}…` : t;
  } catch {
    return "";
  }
}
