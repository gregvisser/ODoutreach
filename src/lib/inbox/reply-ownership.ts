import type { DisplayReplyClaim } from "./reply-claim";

/**
 * Row 132 — Greg's own words: "replies in the activity view do not show
 * read, or done — it just stays as waiting, and a human cannot tell whether
 * somebody on the team has taken responsibility for it."
 *
 * The durable data already existed in two separate, half-buried places
 * before this row: `ReplyClaim` (advisory "somebody has this open right
 * now", never shown in a list, never shown to the claimant themselves) and
 * `handledAt`/`handledByStaffUserId` (durable, but only for replies
 * correlated to a synced mailbox message, and only reachable from a
 * different detail page). Neither was visible where Greg was looking.
 *
 * This module does not invent a third mechanism. It folds the two existing
 * signals into ONE plain-English state for a screen to render:
 *
 *   unclaimed -> nobody has opened it and nobody has dealt with it.
 *   claimed   -> somebody (maybe the viewer) has it open, right now.
 *   handled   -> somebody (maybe the viewer) has dealt with it. Durable —
 *                this does not expire.
 *
 * "Handled" always wins over "claimed": once the conversation is dealt
 * with, showing a stale "so-and-so has this open" is actively misleading.
 */
export type ReplyOwnershipState =
  | { kind: "unclaimed" }
  | { kind: "claimed"; name: string; isViewer: boolean; agoLabel: string }
  | { kind: "handled"; handledAt: Date; byName: string | null; isViewer: boolean };

export function resolveReplyOwnershipState(args: {
  handledAt: Date | null;
  handledByName: string | null;
  handledByIsViewer: boolean;
  claim: DisplayReplyClaim | null;
}): ReplyOwnershipState {
  if (args.handledAt) {
    return {
      kind: "handled",
      handledAt: args.handledAt,
      byName: args.handledByName,
      isViewer: args.handledByIsViewer,
    };
  }
  if (args.claim) {
    return {
      kind: "claimed",
      name: args.claim.name,
      isViewer: args.claim.isViewer,
      agoLabel: args.claim.agoLabel,
    };
  }
  return { kind: "unclaimed" };
}

/**
 * The sentence and the tone a badge should use. No raw enum values, no
 * abbreviations — readable by somebody who has never used the product.
 */
export function replyOwnershipLabel(
  state: ReplyOwnershipState,
): { text: string; tone: "muted" | "warn" | "ok" } {
  switch (state.kind) {
    case "unclaimed":
      return { text: "Unclaimed", tone: "muted" };
    case "claimed":
      return {
        text: state.isViewer
          ? `You have this — opened ${state.agoLabel}`
          : `${state.name} has this — opened ${state.agoLabel}`,
        tone: "warn",
      };
    case "handled":
      return {
        text: state.isViewer
          ? "Handled by you"
          : state.byName
            ? `Handled by ${state.byName}`
            : "Handled",
        tone: "ok",
      };
  }
}
