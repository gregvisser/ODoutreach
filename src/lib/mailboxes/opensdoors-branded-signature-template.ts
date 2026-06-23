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
  // When no real name is available the caller may pass the email address as the
  // display name. Drop the standalone name line in that case so the address is
  // not printed twice (once as a name, once as the mailto link).
  const showName = nameIsDistinctFromEmail(input.displayName, email);

  const lines = [
    showName ? escapeHtmlText(input.displayName.trim()) : "",
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
  // Same de-dupe as the HTML builder: omit the name line when it is just the
  // email address so the address is not printed twice.
  const showName = nameIsDistinctFromEmail(input.displayName, email);
  const parts = [
    showName ? input.displayName.trim() : "",
    input.jobTitle?.trim() ?? "",
    input.phone?.trim() ?? "",
    email,
    input.website?.trim() ?? "",
    input.linkedInUrl?.trim() ? `LinkedIn: ${input.linkedInUrl.trim()}` : "",
    input.legalDisclaimer?.trim() ?? "Replace with approved legal disclaimer.",
  ].filter((p) => typeof p === "string" && p.length > 0);
  return parts.join("\n");
}
