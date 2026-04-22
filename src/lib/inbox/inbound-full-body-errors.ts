/**
 * PR Q — Classify provider errors returned by the on-demand inbound
 * full-body fetch into a small set of operator-facing categories.
 *
 * Goals:
 *   * Never leak raw provider stack/JSON to the operator UI.
 *   * Give the operator a clear reason and an action (or no action)
 *     without suggesting "open Outlook/Gmail" as the primary solution.
 *   * Keep the classification pure and testable. No I/O, no logging.
 *
 * Categories:
 *   - message_not_available
 *       The message no longer exists in the connected mailbox by the
 *       providerMessageId ODoutreach captured at ingestion. Typically
 *       because it was moved, archived, or deleted after preview was
 *       stored. No amount of retry will change this.
 *   - provider_auth_error
 *       The delegated access token is invalid/expired/revoked. The
 *       operator needs to reconnect the mailbox.
 *   - provider_permission_error
 *       The mailbox is connected but the scope/permissions do not
 *       allow reading the message. Needs re-consent with the right
 *       scopes.
 *   - provider_rate_limited
 *       The provider is rate-limiting or throttling us. A short wait
 *       should resolve it.
 *   - provider_unknown
 *       Any other provider failure — surface a short generic message
 *       without raw text.
 */

export type InboundFullBodyErrorCategory =
  | "message_not_available"
  | "provider_auth_error"
  | "provider_permission_error"
  | "provider_rate_limited"
  | "provider_unknown";

export type ClassifiedInboundFullBodyError = {
  category: InboundFullBodyErrorCategory;
  /** Short one-line summary safe to render in a banner. */
  title: string;
  /** Operator-facing explanation safe to render in a banner. */
  message: string;
  /** Whether a retry is likely to succeed in the near term. */
  retryable: boolean;
};

const MESSAGE_NOT_AVAILABLE_COPY: Omit<
  ClassifiedInboundFullBodyError,
  "category"
> = {
  title: "Message no longer available in mailbox",
  message:
    "Message is no longer available in the connected mailbox. It may have been moved or deleted after ODoutreach ingested the preview.",
  retryable: false,
};

const AUTH_COPY: Omit<ClassifiedInboundFullBodyError, "category"> = {
  title: "Mailbox needs to be reconnected",
  message:
    "The connected mailbox rejected the request. Reconnect the mailbox from the Mailboxes tab so ODoutreach can read messages again.",
  retryable: false,
};

const PERMISSION_COPY: Omit<ClassifiedInboundFullBodyError, "category"> = {
  title: "Mailbox permissions are insufficient",
  message:
    "The connected mailbox is missing a required permission for reading message bodies. Reconnect the mailbox to re-consent with the right scopes.",
  retryable: false,
};

const RATE_LIMITED_COPY: Omit<ClassifiedInboundFullBodyError, "category"> = {
  title: "Mailbox is temporarily rate-limited",
  message:
    "The mail provider is temporarily rate-limiting us. Try again in a few moments.",
  retryable: true,
};

const UNKNOWN_COPY: Omit<ClassifiedInboundFullBodyError, "category"> = {
  title: "Full body fetch failed",
  message:
    "ODoutreach could not fetch the full body from the connected mailbox. Try again later; if it keeps failing, check that the mailbox is still connected.",
  retryable: true,
};

/**
 * Input shape from the provider helpers (Microsoft Graph / Gmail API).
 * Either `errorCode` or `rawMessage` may be empty; the classifier must
 * tolerate both.
 */
export type ProviderErrorInput = {
  provider: "MICROSOFT" | "GOOGLE" | string;
  /**
   * Opaque provider error code. Microsoft Graph returns strings like
   * `ErrorItemNotFound`, `InvalidAuthenticationToken`. Gmail returns
   * numeric HTTP status codes, which we pass as `gmail_<code>`.
   */
  errorCode?: string | null;
  /** The full `error` message from the provider (already prefixed). */
  rawMessage?: string | null;
  /** HTTP status code if known, used as a secondary signal. */
  httpStatus?: number | null;
};

/**
 * Pure classifier — no I/O, no logging. Returns a copy-ready object.
 */
export function classifyInboundFullBodyError(
  input: ProviderErrorInput,
): ClassifiedInboundFullBodyError {
  const code = (input.errorCode ?? "").trim();
  const raw = (input.rawMessage ?? "").toLowerCase();
  const status = input.httpStatus ?? null;

  if (isMessageNotAvailable(input.provider, code, raw, status)) {
    return { category: "message_not_available", ...MESSAGE_NOT_AVAILABLE_COPY };
  }
  if (isAuthError(code, raw, status)) {
    return { category: "provider_auth_error", ...AUTH_COPY };
  }
  if (isPermissionError(code, raw, status)) {
    return { category: "provider_permission_error", ...PERMISSION_COPY };
  }
  if (isRateLimited(code, raw, status)) {
    return { category: "provider_rate_limited", ...RATE_LIMITED_COPY };
  }
  return { category: "provider_unknown", ...UNKNOWN_COPY };
}

function isMessageNotAvailable(
  provider: string,
  code: string,
  raw: string,
  status: number | null,
): boolean {
  // Microsoft Graph
  if (code === "ErrorItemNotFound") return true;
  if (code === "itemNotFound") return true;
  if (code === "ResourceNotFound") return true;
  // Raw message hints (Graph sometimes sends sentence-case variants)
  if (raw.includes("specified object was not found in the store")) return true;
  if (raw.includes("item not found")) return true;
  // Gmail
  if (provider === "GOOGLE" && (code === "gmail_404" || status === 404)) {
    return true;
  }
  if (provider === "GOOGLE" && raw.includes("not found")) return true;
  if (provider === "GOOGLE" && raw.includes("requested entity was not found")) {
    return true;
  }
  return false;
}

function isAuthError(
  code: string,
  raw: string,
  status: number | null,
): boolean {
  if (code === "InvalidAuthenticationToken") return true;
  if (code === "unauthenticated") return true;
  if (code === "UNAUTHENTICATED") return true;
  if (code === "gmail_401") return true;
  if (status === 401) return true;
  if (
    raw.includes("access token") &&
    (raw.includes("expired") || raw.includes("invalid") || raw.includes("revoked"))
  ) {
    return true;
  }
  return false;
}

function isPermissionError(
  code: string,
  raw: string,
  status: number | null,
): boolean {
  if (code === "ErrorAccessDenied") return true;
  if (code === "AccessDenied") return true;
  if (code === "Forbidden") return true;
  if (code === "insufficientPermissions") return true;
  if (code === "PERMISSION_DENIED") return true;
  if (code === "gmail_403") return true;
  if (status === 403) return true;
  if (raw.includes("insufficient permission")) return true;
  if (raw.includes("access is denied")) return true;
  return false;
}

function isRateLimited(
  code: string,
  raw: string,
  status: number | null,
): boolean {
  if (code === "ApplicationThrottled") return true;
  if (code === "TooManyRequests") return true;
  if (code === "rateLimitExceeded") return true;
  if (code === "userRateLimitExceeded") return true;
  if (code === "gmail_429") return true;
  if (status === 429) return true;
  if (raw.includes("too many requests")) return true;
  if (raw.includes("rate limit")) return true;
  return false;
}
