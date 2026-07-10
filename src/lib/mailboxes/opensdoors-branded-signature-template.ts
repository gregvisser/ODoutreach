/**
 * Starter HTML/plain branded signature for OpensDoors outreach mailboxes.
 * Replace placeholder content with your official legal disclaimer and imagery as approved.
 */

export type OpensDoorsBrandedTemplateInput = {
  displayName: string;
  jobTitle?: string | null;
  phone?: string | null;
  email: string;
  website?: string | null;
  linkedInUrl?: string | null;
  legalDisclaimer?: string | null;
  /** Trailing slash stripped; used for `/branding/opensdoors-logo.svg`. */
  logoBaseUrl?: string | null;
  /**
   * Direct logo image URL (e.g. the client's own brand logo from its brief).
   * Takes precedence over `logoBaseUrl` so a client signature carries the
   * CLIENT's logo, not the OpensDoors mark. Alt text for it, when set.
   */
  logoUrl?: string | null;
  logoAlt?: string | null;
};

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * True when `displayName` is a real name worth showing as its own line — i.e.
 * non-empty and NOT just the email address again (callers fall back to the
 * email when no name is known). Comparison is case-insensitive and
 * whitespace-trimmed so the address never renders twice.
 */
function nameIsDistinctFromEmail(
  displayName: string | null | undefined,
  email: string,
): boolean {
  const name = displayName?.trim() ?? "";
  if (name.length === 0) return false;
  return name.toLowerCase() !== email.trim().toLowerCase();
}

/**
 * Derive a human name from an email's local-part when no real name is known —
 * `charlie@x.com` → "Charlie", `charlie.smith@x.com` → "Charlie Smith". Drops any
 * `+tag`, separators (`. _ -`) and digits, then title-cases each word. Returns
 * `null` when nothing usable remains (e.g. a role address that's all digits).
 */
export function humanizeEmailLocalPart(email: string): string | null {
  const local = (email.split("@")[0] ?? "").split("+")[0]?.trim() ?? "";
  if (!local) return null;
  const words = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : null;
}

/**
 * The name line to show in a signature. Prefer an explicit display name; when
 * none is given (or it's just the email address again) derive one from the email
 * local-part so a branded signature is never nameless. `null` only when even the
 * email yields nothing usable.
 */
function resolveSignatureName(
  displayName: string | null | undefined,
  email: string,
): string | null {
  if (nameIsDistinctFromEmail(displayName, email)) {
    return displayName!.trim();
  }
  return humanizeEmailLocalPart(email);
}

/**
 * HTML signature/disclaimer block — unsubscribe is appended separately by send pipelines.
 */
export function buildOpensDoorsBrandedSignatureHtml(input: OpensDoorsBrandedTemplateInput): string {
  const directLogo = input.logoUrl?.trim() ?? "";
  const base = input.logoBaseUrl?.trim().replace(/\/+$/, "") ?? "";
  // A client's own logo (directLogo) wins over the OpensDoors mark so a client
  // signature is correctly branded. Falls back to the OpensDoors logo path.
  const logoSrc =
    directLogo.length > 0
      ? directLogo
      : base.length > 0
        ? `${base}/branding/opensdoors-logo.svg`
        : "";
  const logoAlt = input.logoAlt?.trim() || (directLogo.length > 0 ? "" : "OpensDoors");
  const logo =
    logoSrc.length > 0
      ? `<img src="${escapeHtmlText(logoSrc)}" alt="${escapeHtmlText(logoAlt)}" width="140" style="display:block;border:0;max-width:140px;height:auto;" />`
      : "";

  const email = input.email.trim();
  // Always try to show a human name. Prefer an explicit display name; when none
  // is given (callers may pass the email address as the display name) derive one
  // from the email local-part so the signature is never nameless — the old
  // behaviour left branded signatures with a logo + address but no person.
  const displayName = resolveSignatureName(input.displayName, email);

  const lines = [
    displayName ? escapeHtmlText(displayName) : "",
    input.jobTitle?.trim() ? escapeHtmlText(input.jobTitle.trim()) : "",
    input.phone?.trim() ? escapeHtmlText(input.phone.trim()) : "",
    `<a href="mailto:${escapeHtmlText(email)}">${escapeHtmlText(email)}</a>`,
    input.website?.trim()
      ? `<a href="${escapeHtmlText(input.website.trim())}">${escapeHtmlText(input.website.replace(/^https?:\/\//i, ""))}</a>`
      : "",
    input.linkedInUrl?.trim()
      ? `<a href="${escapeHtmlText(input.linkedInUrl.trim())}">LinkedIn</a>`
      : "",
  ].filter(Boolean);

  const disclaimer = input.legalDisclaimer?.trim()
    ? `<p style="margin-top:12px;font-size:11px;line-height:1.35;color:#444;">${escapeHtmlText(input.legalDisclaimer.trim())}</p>`
    : `<p style="margin-top:12px;font-size:11px;line-height:1.35;color:#444;">Replace this block with your approved legal disclaimer.</p>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#111;">
  ${logo ? `<tr><td style="padding-bottom:8px;">${logo}</td></tr>` : ""}
  <tr><td>${lines.join("<br />")}</td></tr>
  <tr><td>${disclaimer}</td></tr>
</table>`.trim();
}

export function buildOpensDoorsBrandedSignaturePlain(input: OpensDoorsBrandedTemplateInput): string {
  const email = input.email.trim();
  // Same name resolution as the HTML builder — derive a name from the email
  // local-part when no explicit one is available so the address is never the
  // only identifier and is never printed twice.
  const displayName = resolveSignatureName(input.displayName, email);
  const parts = [
    displayName ?? "",
    input.jobTitle?.trim() ?? "",
    input.phone?.trim() ?? "",
    email,
    input.website?.trim() ?? "",
    input.linkedInUrl?.trim() ? `LinkedIn: ${input.linkedInUrl.trim()}` : "",
    input.legalDisclaimer?.trim() ?? "Replace with approved legal disclaimer.",
  ].filter((p) => typeof p === "string" && p.length > 0);
  return parts.join("\n");
}
