/**
 * PR P — Pure, dependency-free helpers that turn provider email
 * payloads (Microsoft Graph JSON and Gmail API JSON) into a safe plain
 * text rendering suitable for display inside ODoutreach.
 *
 * Safety contract:
 *   * No raw provider HTML is ever returned. If only HTML is available
 *     we strip `<script>`/`<style>` blocks and tags entirely to produce
 *     readable plain text.
 *   * Links do not become executable anywhere — everything is text.
 *   * Helpers are pure so they are trivially testable without network
 *     or DB access.
 *   * Byte counts reflect the *raw provider* body so operators can tell
 *     when a message was truncated by our cap.
 */

/**
 * Absolute cap for the stored `bodyText`. Large but safely under
 * Postgres `TEXT` practical limits and the browser rendering budget.
 * 200,000 chars ≈ a very long email with forwarded history.
 */
export const MAX_INBOUND_BODY_CHARS = 200_000;

export type NormalizedInboundBody = {
  /** Safe plain-text rendering of the message body. Never HTML. */
  text: string;
  /**
   * `"text"` when the source was a plain text payload, `"html"` when
   * the source was HTML we converted to text, `"multipart"` when we
   * joined multiple parts, `"empty"` when no usable body was present.
   */
  contentType: "text" | "html" | "multipart" | "empty";
  /** Raw provider body size in characters (before truncation). */
  size: number;
  /** True when we truncated to `MAX_INBOUND_BODY_CHARS`. */
  truncated: boolean;
};

/**
 * Convert HTML to a readable plain-text rendering.
 *
 * Rules:
 *   * `<script>` / `<style>` blocks are removed entirely (content dropped).
 *   * `<br>` / `<br/>` becomes a newline.
 *   * Block-level elements (p, div, tr, li, h1..h6, blockquote, etc.)
 *     become paragraph breaks.
 *   * All other tags are stripped — text content is preserved.
 *   * HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`,
 *     numeric, hex) are decoded.
 *   * Excess whitespace is collapsed; long runs of blank lines are
 *     flattened to at most one blank line.
 */
export function htmlToSafeText(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  let s = html;

  // Drop script/style and their content. Case-insensitive. Using a
  // non-greedy body match.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  // Also drop self-closing noscript blocks defensively.
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "");
  // Drop HTML comments.
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Normalise <br> and block-level closing tags to newlines.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(
    /<\/(p|div|tr|li|h[1-6]|blockquote|article|section|header|footer|table|thead|tbody|tfoot|pre)\s*>/gi,
    "\n",
  );
  // Opening block tags: add a newline in front to separate paragraphs.
  s = s.replace(
    /<(p|div|tr|li|h[1-6]|blockquote|article|section|header|footer|table|thead|tbody|tfoot|pre)\b[^>]*>/gi,
    "\n",
  );

  // Strip everything else.
  s = s.replace(/<[^>]+>/g, "");

  // Decode entities. Keep this conservative — we only decode a small
  // well-known set plus numeric/hex entities.
  s = decodeBasicHtmlEntities(s);

  // Collapse runs of spaces/tabs while preserving newlines.
  s = s.replace(/[ \t\u00a0]+/g, " ");
  // Trim trailing spaces on each line.
  s = s.replace(/ +\n/g, "\n");
  // Collapse 3+ consecutive newlines to exactly two.
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

function decodeBasicHtmlEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  // Numeric / hex entities.
  let out = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? safeFromCharCode(code) : "";
  });
  out = out.replace(/&#(\d+);/g, (_m, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) && code > 0 ? safeFromCharCode(code) : "";
  });
  // Named entities.
  out = out.replace(/&([a-zA-Z]+|#39);/g, (m, name: string) => {
    const hit = named[name.toLowerCase()];
    return hit ?? m;
  });
  return out;
}

function safeFromCharCode(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Truncate a block of text to `maxChars`. Always appends an explicit
 * truncation marker when truncation occurred so the UI can flag it.
 */
export function truncateOrLimitBody(
  text: string,
  maxChars: number = MAX_INBOUND_BODY_CHARS,
): { text: string; truncated: boolean } {
  if (typeof text !== "string") return { text: "", truncated: false };
  if (text.length <= maxChars) return { text, truncated: false };
  const head = text.slice(0, maxChars);
  return {
    text: `${head}\n\n[… body truncated by ODoutreach at ${maxChars.toLocaleString("en-US")} characters …]`,
    truncated: true,
  };
}

export type MicrosoftGraphBody = {
  content?: string | null;
  contentType?: string | null; // "html" | "text" | etc.
};

/**
 * Normalize a Microsoft Graph `message.body` object.
 * Pure — does not hit the network.
 */
export function normalizeMicrosoftMessageBody(
  body: MicrosoftGraphBody | null | undefined,
  fallbackPreview?: string | null,
): NormalizedInboundBody {
  const rawContent = typeof body?.content === "string" ? body.content : "";
  const rawType = (body?.contentType ?? "").toString().toLowerCase();

  if (!rawContent.trim()) {
    const fallback =
      typeof fallbackPreview === "string" && fallbackPreview.trim().length > 0
        ? fallbackPreview.trim()
        : "";
    return {
      text: fallback,
      contentType: fallback ? "text" : "empty",
      size: fallback.length,
      truncated: false,
    };
  }

  const size = rawContent.length;

  if (rawType === "html") {
    const text = htmlToSafeText(rawContent);
    const capped = truncateOrLimitBody(text);
    return {
      text: capped.text,
      contentType: "html",
      size,
      truncated: capped.truncated,
    };
  }

  // Treat everything else as plain text (Graph sometimes reports
  // "text"; anything unexpected we also handle as text so we never
  // accidentally render HTML).
  const capped = truncateOrLimitBody(rawContent);
  return {
    text: capped.text,
    contentType: "text",
    size,
    truncated: capped.truncated,
  };
}

/**
 * A minimal subset of a Gmail API message payload that we care about.
 */
export type GmailPayloadPart = {
  mimeType?: string;
  filename?: string | null;
  headers?: { name?: string; value?: string }[];
  body?: {
    size?: number;
    data?: string | null;
    attachmentId?: string | null;
  };
  parts?: GmailPayloadPart[];
};

export type GmailPayloadMessage = {
  snippet?: string | null;
  payload?: GmailPayloadPart;
};

/**
 * Normalize a Gmail `users.messages.get?format=full` payload.
 * Walks the MIME tree, prefers `text/plain`, falls back to the first
 * `text/html`, strips it, and finally falls back to the `snippet`.
 */
export function normalizeGmailMessagePayload(
  message: GmailPayloadMessage | null | undefined,
): NormalizedInboundBody {
  if (!message || !message.payload) {
    const snippet =
      typeof message?.snippet === "string" ? message.snippet.trim() : "";
    return {
      text: snippet,
      contentType: snippet ? "text" : "empty",
      size: snippet.length,
      truncated: false,
    };
  }

  const textParts: string[] = [];
  const htmlParts: string[] = [];
  let totalRawSize = 0;

  walkGmailParts(message.payload, (part) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    const raw = decodeBase64UrlPartBody(part.body?.data ?? null);
    if (!raw) return;
    totalRawSize += raw.length;
    if (mime === "text/plain") {
      textParts.push(raw);
    } else if (mime === "text/html") {
      htmlParts.push(raw);
    }
  });

  if (textParts.length > 0) {
    const joined = textParts.join("\n\n---\n\n");
    const capped = truncateOrLimitBody(joined);
    return {
      text: capped.text,
      contentType: textParts.length > 1 ? "multipart" : "text",
      size: totalRawSize,
      truncated: capped.truncated,
    };
  }
  if (htmlParts.length > 0) {
    const joined = htmlParts.map(htmlToSafeText).join("\n\n---\n\n");
    const capped = truncateOrLimitBody(joined);
    return {
      text: capped.text,
      contentType: "html",
      size: totalRawSize,
      truncated: capped.truncated,
    };
  }

  const snippet =
    typeof message.snippet === "string" ? message.snippet.trim() : "";
  return {
    text: snippet,
    contentType: snippet ? "text" : "empty",
    size: snippet.length,
    truncated: false,
  };
}

function walkGmailParts(
  part: GmailPayloadPart,
  visit: (p: GmailPayloadPart) => void,
  depth: number = 0,
): void {
  if (depth > 8) return; // hard stop on pathological nesting
  const filename =
    typeof part.filename === "string" ? part.filename.trim() : "";
  // Skip attachments — we only want the body text parts.
  if (filename.length > 0) {
    if (part.parts && part.parts.length > 0) {
      for (const p of part.parts) walkGmailParts(p, visit, depth + 1);
    }
    return;
  }
  visit(part);
  if (part.parts && part.parts.length > 0) {
    for (const p of part.parts) walkGmailParts(p, visit, depth + 1);
  }
}

/**
 * Decode Gmail's URL-safe base64 (per RFC 4648 §5) for message part
 * bodies. Returns `""` when the input is missing or cannot be decoded.
 */
export function decodeBase64UrlPartBody(data: string | null): string {
  if (typeof data !== "string" || data.length === 0) return "";
  try {
    let s = data.replace(/-/g, "+").replace(/_/g, "/");
    // Pad to a multiple of 4.
    const pad = s.length % 4;
    if (pad === 2) s += "==";
    else if (pad === 3) s += "=";
    else if (pad === 1) return ""; // invalid length
    const buf = Buffer.from(s, "base64");
    return buf.toString("utf8");
  } catch {
    return "";
  }
}
