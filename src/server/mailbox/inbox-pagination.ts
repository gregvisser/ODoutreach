/** A bounded page batch reports its continuation; callers save it after processing. */
export type InboxPageOptions = {
  folder?: "inbox" | "junk";
  cursor?: string | null;
  maxPages?: number;
  onContinuation?: (cursor: string | null) => void;
};

export class InboxCursorExpiredError extends Error {}

/** Independent continuations prevent a busy inbox from starving Junk replies.
 * Legacy cursors belong to Inbox. Persist only after both folders are processed.
 */
export async function readReplyFolders<T>(
  saved: string | null | undefined,
  read: (options: InboxPageOptions) => Promise<T[]>,
  identity?: (row: T) => string | null | undefined,
): Promise<{ rows: T[]; cursor: string | null }> {
  const prefix = "reply-folders-v1:";
  let cursors: { inbox: string | null; junk: string | null } = { inbox: saved || null, junk: null };
  if (saved?.startsWith(prefix)) {
    try {
      const value = JSON.parse(saved.slice(prefix.length));
      if (!value || ![value.inbox, value.junk].every(v => v === null || typeof v === "string")) throw new Error();
      cursors = value;
    } catch { throw new InboxCursorExpiredError("Reply folder continuation invalid; restart required"); }
  }
  const rows: T[] = [];
  for (const folder of ["inbox", "junk"] as const) {
    let next: string | null = null;
    rows.push(...await read({ folder, maxPages: 1, onContinuation: cursor => { next = cursor; } }));
    const backlog = cursors[folder] || next;
    if (backlog) {
      rows.push(...await read({ folder, cursor: backlog, maxPages: folder === "inbox" ? 3 : 1,
        onContinuation: cursor => { next = cursor; } }));
    }
    cursors[folder] = next;
  }
  // Fresh heads can overlap a saved backlog or another folder during a move.
  // Process each provider identity once, without discarding either continuation.
  const seen = new Set<string>();
  const uniqueRows = identity ? rows.filter(row => {
    const key = identity(row);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) : rows;
  return { rows: uniqueRows, cursor: cursors.junk ? prefix + JSON.stringify(cursors) : cursors.inbox };
}
