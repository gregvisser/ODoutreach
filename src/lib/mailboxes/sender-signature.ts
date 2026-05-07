/**
 * Per-mailbox sender signature helper (PR — mailbox sender signatures, 2026-04-22).
 *
 * Pure: no I/O, no Prisma imports, no `Date.now()`, no network. Consumed by
 *
 *   * `src/lib/mailboxes/sender-signature.test.ts` — direct unit tests
 *   * `src/components/clients/client-mailbox-identities-panel.tsx` — UI view model
 *   * `src/server/email-sequences/send-introduction.ts` — `chooseSignatureForSend`
 *
 * We deliberately keep the HTML→text conversion tiny and defensive: the
 * sends today are plain-text MIME, so for composition we only need a
 * readable text rendering. If a richer HTML send path ships later the
 * `senderSignatureHtml` field is preserved for it.
 */

/** Canonical values for `ClientMailboxIdentity.senderSignatureSource`. */
export type SenderSignatureSource =
  | "gmail_send_as"
  | "manual"
  | "client_brief_fallback"
  | "unsupported_provider"
  | "missing";

/** Minimal projection of a `ClientMailboxIdentity` row this helper needs. */
export type SenderSignatureMailbox = {
  provider: "MICROSOFT" | "GOOGLE";
  email: string;
  /** `ClientMailboxIdentity.displayName` — the connection-profile label. */
  displayName: string | null;
  /** Per-mailbox sender identity fields added in the 2026-04-22 migration. */
  senderDisplayName: string | null;
  senderSignatureHtml: string | null;
  senderSignatureText: string | null;
  senderSignatureSource: string | null;
  senderSignatureSyncedAt: Date | string | null;
  senderSignatureSyncError: string | null;
};

/**
 * Client-level brief fields (legacy). `emailSignatureFallback` is not used for
 * mailbox-native send resolution — per-mailbox signature is required.
 */
export type SenderSignatureClientBriefFallback = {
  /**
   * Optional display hint; not used for mailbox identity when mailbox fields
   * are set (kept for callers that still pass the shape).
   */
  senderDisplayNameFallback: string | null;
  /** Ignored for mailbox send/preview; do not use as a signature body fallback. */
  emailSignatureFallback: string | null;
};

export type SenderSignatureViewModel = {
  /** What operators see in the mailbox row header. */
  resolvedDisplayName: string;
  /** Plain-text preview rendered into the UI. */
  resolvedSignatureText: string;
  /** True only when the mailbox has a non-empty signature of its own. */
  hasMailboxSignature: boolean;
  /**
   * Authoritative status for badges. See `SENDER_SIGNATURE_STATUS` below
   * for the canonical string values rendered in UI copy / tests.
   */
  source: SenderSignatureSource;
  /**
   * Last time `senderSignatureSyncedAt` was written. Passed through as an
   * ISO string for UI formatting; `null` means "never synced on this row".
   */
  lastSyncedAtIso: string | null;
  /** Last sync error string, if any. Cleared on successful sync. */
  syncError: string | null;
  /** True when the provider supports automatic signature sync at all. */
  automaticSyncSupported: boolean;
};

/** Canonical human-readable labels used in UI copy and tests. */
export const SENDER_SIGNATURE_STATUS: Record<SenderSignatureSource, string> = {
  gmail_send_as: "Synced from Gmail (send-as)",
  manual: "Set in OpensDoors",
  client_brief_fallback: "Client brief (legacy) — not used for mailbox sends",
  unsupported_provider: "Microsoft 365: set in OpensDoors (no Outlook pull)",
  missing: "None — mailbox signature required",
};

const HTML_BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "section",
]);

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

/**
 * Convert an HTML signature (as returned by Gmail's `sendAs.signature`) to
 * a plain-text rendering suitable for the current text-body send path.
 *
 *   * Strips `<script>` / `<style>` blocks entirely.
 *   * Collapses block-level tags into newlines.
 *   * Removes remaining tags.
 *   * Decodes a small set of common HTML entities.
 *   * Trims trailing whitespace and collapses runs of >2 blank lines.
 */
export function htmlSignatureToText(html: string | null | undefined): string {
  if (typeof html !== "string") return "";
  if (html.trim().length === 0) return "";

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Replace block-level tags with newlines before stripping all tags.
  cleaned = cleaned.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (match, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (HTML_BLOCK_TAGS.has(tag)) {
      return "\n";
    }
    return "";
  });

  cleaned = decodeEntities(cleaned);

  // Normalise whitespace. For signatures we collapse every run of blank
  // lines (including those introduced by paired block tags like
  // `<div>...</div>`) to a single line break so the plain-text rendering
  // stays compact.
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0);
  return lines.join("\n");
}

/**
 * Defensive pass-through for HTML signatures before we store them. We do
 * not attempt full sanitisation here — Gmail returns its own markup and
 * we never render raw HTML without going through this helper plus a
 * later trusted renderer. What we DO enforce:
 *
 *   * Drop `<script>` / `<style>` / HTML comments.
 *   * Trim extreme leading/trailing whitespace.
 *   * Reject empty-after-strip values so callers can treat "empty HTML"
 *     as missing.
 */
export function normaliseSignatureHtml(
  html: string | null | undefined,
): string {
  if (typeof html !== "string") return "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  // If nothing but whitespace/markup remains, treat as empty.
  const text = htmlSignatureToText(stripped);
  if (text.length === 0) return "";
  return stripped;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function isoFrom(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function resolveSource(
  stored: string | null,
  hasText: boolean,
  provider: "MICROSOFT" | "GOOGLE",
): SenderSignatureSource {
  if (hasText) {
    if (stored === "gmail_send_as" || stored === "manual") {
      return stored;
    }
    return "manual";
  }
  if (provider === "MICROSOFT") return "unsupported_provider";
  return "missing";
}

export function buildSenderSignatureViewModel(
  mailbox: SenderSignatureMailbox,
  clientBrief: SenderSignatureClientBriefFallback,
): SenderSignatureViewModel {
  void clientBrief;
  const mailboxText = trimOrNull(mailbox.senderSignatureText);
  const mailboxHtml = trimOrNull(mailbox.senderSignatureHtml);

  const hasMailboxSignature =
    mailboxText !== null ||
    (mailboxHtml !== null && htmlSignatureToText(mailboxHtml).length > 0);

  const resolvedText = hasMailboxSignature
    ? (mailboxText ?? htmlSignatureToText(mailboxHtml ?? ""))
    : "";

  const source = resolveSource(
    mailbox.senderSignatureSource,
    hasMailboxSignature,
    mailbox.provider,
  );

  const resolvedDisplayName =
    trimOrNull(mailbox.senderDisplayName) ??
    trimOrNull(mailbox.displayName) ??
    mailbox.email;

  return {
    resolvedDisplayName,
    resolvedSignatureText: resolvedText,
    hasMailboxSignature,
    source,
    lastSyncedAtIso: isoFrom(mailbox.senderSignatureSyncedAt),
    syncError: trimOrNull(mailbox.senderSignatureSyncError),
    automaticSyncSupported: mailbox.provider === "GOOGLE",
  };
}

/** Resolution picked by the composition path — mailbox always wins. */
export type SenderSignatureSelection = {
  senderDisplayName: string | null;
  emailSignatureText: string | null;
  source: SenderSignatureSource;
};

/**
 * Choose the sender display name + text signature for mailbox-native sends.
 * Uses mailbox-owned text/HTML only. Client-brief `emailSignature` is never
 * used as a body fallback (avoids the wrong person’s name on a mailbox).
 */
/**
 * True when the mailbox stores a substantial branded block (HTML preferred).
 * Used for readiness warnings — short “Kind regards / Name / OpensDoors” rows stay “minimal”.
 */
export function isMailboxFullBrandedSignature(mailbox: {
  senderSignatureHtml: string | null;
  senderSignatureText: string | null;
}): boolean {
  const nh = normaliseSignatureHtml(mailbox.senderSignatureHtml);
  if (nh.length > 0) {
    return htmlSignatureToText(nh).length >= 64;
  }
  const t = mailbox.senderSignatureText?.trim() ?? "";
  return t.length >= 160;
}

export function chooseSignatureForSend(params: {
  mailbox: SenderSignatureMailbox;
  clientBrief: SenderSignatureClientBriefFallback;
}): SenderSignatureSelection {
  const { mailbox, clientBrief } = params;
  void clientBrief;
  const mailboxText = trimOrNull(mailbox.senderSignatureText);
  const mailboxHtml = trimOrNull(mailbox.senderSignatureHtml);

  let emailSignatureText: string | null = null;
  let source: SenderSignatureSource;

  if (mailboxText !== null) {
    emailSignatureText = mailboxText;
    source =
      mailbox.senderSignatureSource === "gmail_send_as"
        ? "gmail_send_as"
        : "manual";
  } else if (mailboxHtml !== null) {
    const fromHtml = htmlSignatureToText(mailboxHtml);
    if (fromHtml.length > 0) {
      emailSignatureText = fromHtml;
      source =
        mailbox.senderSignatureSource === "gmail_send_as"
          ? "gmail_send_as"
          : "manual";
    } else {
      source =
        mailbox.provider === "MICROSOFT" ? "unsupported_provider" : "missing";
    }
  } else {
    source =
      mailbox.provider === "MICROSOFT" ? "unsupported_provider" : "missing";
  }

  const senderDisplayName =
    trimOrNull(mailbox.senderDisplayName) ?? trimOrNull(mailbox.displayName);

  return {
    senderDisplayName,
    emailSignatureText,
    source,
  };
}
