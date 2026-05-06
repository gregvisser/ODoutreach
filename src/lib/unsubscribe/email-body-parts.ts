/**
 * Builds provider-ready text/html bodies from the canonical plain-text
 * bodySnapshot. Text keeps the full URL; HTML hides it behind anchor text.
 */

const FOOTER_RE = /(?:\r?\n){0,2}---\r?\nUnsubscribe:\s*(\S+)\s*$/u;

export type EmailBodyParts = {
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export function extractUnsubscribeUrlFromPlainTextBody(bodyText: string): string | null {
  const match = bodyText.match(FOOTER_RE);
  return match?.[1]?.trim() ?? null;
}

export function stripPlainTextUnsubscribeFooter(bodyText: string): string {
  return bodyText.replace(FOOTER_RE, "").replace(/\s+$/u, "");
}

function textBlocksToHtml(bodyText: string, unsubscribeUrl: string | null): string {
  const escapedUrl = unsubscribeUrl ? escapeHtml(unsubscribeUrl) : null;
  const anchor = unsubscribeUrl
    ? `<a href="${escapeAttr(unsubscribeUrl)}">Unsubscribe</a>`
    : null;

  const blocks = bodyText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return blocks
    .map((block) => {
      let escaped = escapeHtml(block).replace(/\n/g, "<br />");
      if (escapedUrl && anchor) {
        escaped = escaped.split(escapedUrl).join(anchor);
      }
      return `<p>${escaped}</p>`;
    })
    .join("\n");
}

export function buildCleanUnsubscribeHtmlBody(input: {
  bodyText: string;
  unsubscribeUrl?: string | null;
}): string {
  const url =
    input.unsubscribeUrl?.trim() ||
    extractUnsubscribeUrlFromPlainTextBody(input.bodyText);
  const bodyWithoutFooter = url
    ? stripPlainTextUnsubscribeFooter(input.bodyText)
    : input.bodyText.replace(/\s+$/u, "");
  const htmlBody = textBlocksToHtml(bodyWithoutFooter, url);
  if (!url) return htmlBody;
  const footer = `<p><a href="${escapeAttr(url)}">Unsubscribe</a></p>`;
  return htmlBody ? `${htmlBody}\n${footer}` : footer;
}

export function buildEmailBodyParts(input: {
  bodyText: string;
  unsubscribeUrl?: string | null;
}): EmailBodyParts {
  return {
    text: input.bodyText,
    html: buildCleanUnsubscribeHtmlBody(input),
  };
}
