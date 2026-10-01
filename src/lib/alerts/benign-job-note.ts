/**
 * An empty follow-up step is a normal tick, not a broken sender.
 * The dispatcher says this when a step has no READY rows left.
 */
export function isBenignEmptyRecipientNote(entry: string): boolean {
  const text = entry.toLowerCase();
  return (
    text.includes("no recipients are ready") ||
    text.includes("already complete or no ready recipients")
  );
}
