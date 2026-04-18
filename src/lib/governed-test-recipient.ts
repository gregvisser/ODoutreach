import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";

/**
 * Comma-separated list of allowed recipient email domains (lowercased) for the
 * operator-only governed test send. Defaults to a single internal domain for safety.
 * Example: `GOVERNED_TEST_EMAIL_DOMAINS=bidlow.co.uk,opensdoors.local`
 */
export function allowedGovernedTestEmailDomains(): string[] {
  const raw = process.env.GOVERNED_TEST_EMAIL_DOMAINS?.trim();
  if (!raw) {
    return ["bidlow.co.uk"];
  }
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isRecipientAllowedForGovernedTest(toEmail: string): boolean {
  const to = normalizeEmail(toEmail);
  if (!to.includes("@")) return false;
  const dom = extractDomainFromEmail(to)?.toLowerCase() ?? "";
  if (!dom) return false;
  const allowed = new Set(allowedGovernedTestEmailDomains());
  return allowed.has(dom);
}
