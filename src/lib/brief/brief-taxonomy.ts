/** Normalise free-text taxonomy input for deduplication and display. */
export function normalizeTaxonomyLabel(raw: string): { key: string; display: string } {
  const display = raw.trim().replace(/\s+/g, " ");
  const key = display.toLowerCase();
  return { key, display };
}
