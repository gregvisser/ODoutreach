/**
 * PR J — pure helpers for the `InboundMailboxMessage.metadata.handling`
 * sub-object. We store operator handling state (read/handled + replies)
 * on the existing JSON column to avoid a migration in this slice.
 *
 * Layout:
 *   metadata = {
 *     // producer-specific keys (Graph / Gmail sync writers)
 *     internetMessageId?: string | null,
 *     threadId?: string | null,
 *     // operator-handling state owned by PR J
 *     handling?: {
 *       handledAt?: string,           // ISO timestamp
 *       handledByStaffUserId?: string,
 *       lastRepliedAt?: string,        // ISO timestamp
 *       replyOutboundEmailIds?: string[],
 *     },
 *   }
 *
 * All helpers are defensive — unknown or malformed shapes collapse to
 * empty `HandlingState`, and merges never mutate their inputs.
 */

export type HandlingState = {
  handledAt: string | null;
  handledByStaffUserId: string | null;
  lastRepliedAt: string | null;
  replyOutboundEmailIds: string[];
};

export const EMPTY_HANDLING_STATE: HandlingState = {
  handledAt: null,
  handledByStaffUserId: null,
  lastRepliedAt: null,
  replyOutboundEmailIds: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringOrNull(
  bag: Record<string, unknown>,
  key: string,
): string | null {
  const v = bag[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readStringArray(
  bag: Record<string, unknown>,
  key: string,
): string[] {
  const v = bag[key];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry === "string" && entry.length > 0) out.push(entry);
  }
  return out;
}

/**
 * Read `metadata.handling` defensively. Any unknown or malformed shape
 * returns the empty state so callers never have to guard.
 */
export function readHandlingStateFromMetadata(
  metadata: unknown,
): HandlingState {
  if (!isRecord(metadata)) return { ...EMPTY_HANDLING_STATE };
  const handling = metadata["handling"];
  if (!isRecord(handling)) return { ...EMPTY_HANDLING_STATE };
  return {
    handledAt: readStringOrNull(handling, "handledAt"),
    handledByStaffUserId: readStringOrNull(handling, "handledByStaffUserId"),
    lastRepliedAt: readStringOrNull(handling, "lastRepliedAt"),
    replyOutboundEmailIds: readStringArray(handling, "replyOutboundEmailIds"),
  };
}

/**
 * Merge new handling fields into the existing metadata object, preserving
 * every non-handling key (so `internetMessageId` and `threadId` from the
 * sync writers stay intact). Returns a fresh object; inputs are not
 * mutated. Use this to build the JSON payload for Prisma `update`.
 */
export function mergeHandlingIntoMetadata(
  metadata: unknown,
  patch: Partial<HandlingState>,
): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(metadata)
    ? { ...metadata }
    : {};
  const current = readHandlingStateFromMetadata(metadata);

  const nextHandling: Record<string, unknown> = {};

  const handledAt =
    patch.handledAt !== undefined ? patch.handledAt : current.handledAt;
  if (handledAt) nextHandling["handledAt"] = handledAt;

  const handledByStaffUserId =
    patch.handledByStaffUserId !== undefined
      ? patch.handledByStaffUserId
      : current.handledByStaffUserId;
  if (handledByStaffUserId) {
    nextHandling["handledByStaffUserId"] = handledByStaffUserId;
  }

  const lastRepliedAt =
    patch.lastRepliedAt !== undefined
      ? patch.lastRepliedAt
      : current.lastRepliedAt;
  if (lastRepliedAt) nextHandling["lastRepliedAt"] = lastRepliedAt;

  const replyIds =
    patch.replyOutboundEmailIds !== undefined
      ? patch.replyOutboundEmailIds
      : current.replyOutboundEmailIds;
  if (replyIds.length > 0) {
    nextHandling["replyOutboundEmailIds"] = [...replyIds];
  }

  if (Object.keys(nextHandling).length > 0) {
    base["handling"] = nextHandling;
  } else {
    delete base["handling"];
  }
  return base;
}

/**
 * Append an outbound email id to the reply history, keeping the list
 * deduplicated and chronologically ordered (append-only).
 */
export function appendReplyOutboundId(
  state: HandlingState,
  outboundEmailId: string,
): HandlingState {
  if (!outboundEmailId) return state;
  if (state.replyOutboundEmailIds.includes(outboundEmailId)) return state;
  return {
    ...state,
    replyOutboundEmailIds: [...state.replyOutboundEmailIds, outboundEmailId],
  };
}

/**
 * Normalise a subject line into a "Re:" reply subject, without stacking
 * repeated "Re:" prefixes. A null / empty subject collapses to "Re:".
 */
export function buildReplySubject(originalSubject: string | null): string {
  const trimmed = (originalSubject ?? "").trim();
  if (!trimmed) return "Re:";
  if (/^re\s*:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}
