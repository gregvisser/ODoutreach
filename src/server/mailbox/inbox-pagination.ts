/** A bounded page batch reports its continuation; callers save it after processing. */
export type InboxPageOptions = {
  cursor?: string | null;
  maxPages?: number;
  onContinuation?: (cursor: string | null) => void;
};

export class InboxCursorExpiredError extends Error {}
