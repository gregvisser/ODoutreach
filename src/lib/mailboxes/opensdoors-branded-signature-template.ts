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
};

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML signature/disclaimer block — unsubscribe is appended separately by send pipelines.
 */
export function buildOpensDoorsBrandedSignatureHtml(input: OpensDoorsBrandedTemplateInput): string {
  const base = input.logoBaseUrl?.trim().replace(/\/+$/, "") ?? "";
  const logo =
    base.length > 0
      ? `<img src="${escapeHtmlText(`${base}/branding/opensdoors-logo.svg`)}" alt="OpensDoors" width="140" style="display:block;border:0;max-width:140px;height:auto;" />`
      : "";

  const lines = [
    escapeHtmlText(input.displayName.trim()),
    input.jobTitle?.trim() ? escapeHtmlText(input.jobTitle.trim()) : "",
    input.phone?.trim() ? escapeHtmlText(input.phone.trim()) : "",
    `<a href="mailto:${escapeHtmlText(input.email.trim())}">${escapeHtmlText(input.email.trim())}</a>`,
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
  const parts = [
    input.displayName.trim(),
    input.jobTitle?.trim() ?? "",
    input.phone?.trim() ?? "",
    input.email.trim(),
    input.website?.trim() ?? "",
    input.linkedInUrl?.trim() ? `LinkedIn: ${input.linkedInUrl.trim()}` : "",
    input.legalDisclaimer?.trim() ?? "Replace with approved legal disclaimer.",
  ].filter((p) => typeof p === "string" && p.length > 0);
  return parts.join("\n");
}
