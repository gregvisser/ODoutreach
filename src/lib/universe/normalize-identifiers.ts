import { createHash } from "node:crypto";

/** Lowercase / trim LinkedIn profile URL for dedupe (best-effort). */
export function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  let u = t.toLowerCase();
  if (!u.startsWith("http")) {
    u = `https://${u}`;
  }
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/$/, "");
    if (!url.hostname.includes("linkedin.com")) {
      return `${url.hostname}${path}`.toLowerCase();
    }
    return `${url.hostname}${path}`.toLowerCase();
  } catch {
    return t.toLowerCase().replace(/\s+/g, "");
  }
}

/** Strip to digits for phone dedupe; returns null if too short. */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return d;
}

/**
 * Weak key when no email / LinkedIn / phone — avoids merging unless identical
 * company + name + title fingerprint.
 */
export function buildWeakMatchKey(input: {
  company: string;
  fullName: string;
  title: string;
}): string | null {
  const c = input.company.trim().toLowerCase().replace(/\s+/g, " ");
  const n = input.fullName.trim().toLowerCase().replace(/\s+/g, " ");
  const t = input.title.trim().toLowerCase().replace(/\s+/g, " ");
  if (!c || !n) return null;
  return createHash("sha256").update(`${c}|${n}|${t}`).digest("hex");
}
