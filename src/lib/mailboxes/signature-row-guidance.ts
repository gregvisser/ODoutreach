/**
 * Keeps repeated help out of the Sender-signatures table (pure).
 *
 * `getOperatorSignatureState` picks each row's `recommendedAction` from six
 * fixed templates, so a workspace whose mailboxes are all in the same state
 * prints the same paragraph once per row. On the live opensdoors workspace that
 * is four identical ~50-word paragraphs stacked one under another, which reads
 * as four different instructions until you compare them word by word.
 *
 * The rule: a sentence that appears on more than one row is not data about a
 * row. Hoist it above the table, once, naming the rows it came from — so the
 * table carries only what actually differs.
 */

/** One row's advice, keyed by something a human recognises (the address). */
export type SignatureRowAdvice = {
  readonly key: string;
  readonly action: string;
};

/** Advice that was identical on two or more rows. */
export type SharedSignatureGuidance = {
  readonly text: string;
  /** The row keys it was hoisted from, in the order the rows appear. */
  readonly keys: readonly string[];
};

export type SignatureRowGuidancePlan = {
  /**
   * Indexed identically to the input. `null` means the row has nothing of its
   * own to say — either it was blank, or it was hoisted into `shared`.
   */
  readonly perRow: readonly (string | null)[];
  readonly shared: readonly SharedSignatureGuidance[];
};

/** How many mailboxes can be named in a sentence before it stops being readable. */
const MAX_NAMED_KEYS = 3;

export function planSignatureRowGuidance(
  rows: readonly SignatureRowAdvice[],
): SignatureRowGuidancePlan {
  // First-seen order matters: the hoisted blocks should appear in the order the
  // reader would have met them in the table.
  const keysByText = new Map<string, string[]>();
  const trimmed = rows.map((row) => row.action.trim());

  for (const [i, text] of trimmed.entries()) {
    if (text.length === 0) continue;
    const existing = keysByText.get(text);
    if (existing) existing.push(rows[i]!.key);
    else keysByText.set(text, [rows[i]!.key]);
  }

  const shared: SharedSignatureGuidance[] = [];
  for (const [text, keys] of keysByText) {
    if (keys.length > 1) shared.push({ text, keys });
  }
  const hoisted = new Set(shared.map((s) => s.text));

  const perRow = trimmed.map((text) =>
    text.length === 0 || hoisted.has(text) ? null : text,
  );

  return { perRow, shared };
}

/**
 * Names the rows a hoisted sentence came from, so moving it out of the table
 * does not turn "these four mailboxes" into "somewhere on this page".
 */
export function describeSignatureGuidanceScope(
  keys: readonly string[],
): string {
  if (keys.length === 0) return "";
  if (keys.length > MAX_NAMED_KEYS) return `${keys.length} mailboxes`;
  if (keys.length === 1) return keys[0]!;
  return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]!}`;
}
