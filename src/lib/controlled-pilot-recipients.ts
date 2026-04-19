import { normalizeEmail } from "@/lib/normalize";

import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";

export type ParsePilotRecipientsResult =
  | { ok: true; emails: string[]; truncatedFromHardCap: boolean }
  | { ok: false; error: string };

/**
 * Parse one email per non-empty line; commas allowed on a line (split).
 * Dedupe while preserving order. Enforces hard max (truncates with flag).
 */
export function parsePilotRecipientLines(raw: string): ParsePilotRecipientsResult {
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    for (const p of parts.length > 0 ? parts : [line.trim()].filter(Boolean)) {
      const n = normalizeEmail(p);
      if (!n.includes("@")) {
        return { ok: false, error: `Invalid email: ${p}` };
      }
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      if (out.length >= CONTROLLED_PILOT_HARD_MAX_RECIPIENTS) {
        return { ok: true, emails: out, truncatedFromHardCap: true };
      }
    }
  }
  return { ok: true, emails: out, truncatedFromHardCap: false };
}
