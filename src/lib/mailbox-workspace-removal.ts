/**
 * Soft-removal: `workspaceRemovedAt` is set when an address is taken out of the
 * active client workspace. The row, secrets cleared, and historical FKs remain;
 * the mailbox no longer sends, receives new sync, or accepts OAuth on this row
 * until explicitly restored.
 */
export function isMailboxRemovedFromWorkspace(m: {
  workspaceRemovedAt?: Date | null;
}): boolean {
  return m.workspaceRemovedAt != null;
}
