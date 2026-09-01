/**
 * Pure result -> banner-text mapping for the operations/outbound mutation
 * buttons (release stale locks, requeue failed, mark sender ready). Split out
 * from the client components so the mapping is testable without a DOM: the
 * defect this exists to fix was these results being silently discarded, not
 * a rendering bug, so the thing worth proving is that a failure produces
 * error text and a success reports the real count — not how React paints it.
 */

export type OperatorActionBanner = { tone: "ok" | "err"; text: string };

export function releaseStaleLocksMessage(released: number): OperatorActionBanner {
  return {
    tone: "ok",
    text:
      released === 0
        ? "No stale processing locks were found — nothing released."
        : `Released ${released} stale processing lock${released === 1 ? "" : "s"} back to QUEUED.`,
  };
}

export function requeueResultMessage(result: {
  ok: boolean;
  error?: string;
}): OperatorActionBanner {
  if (!result.ok) {
    return {
      tone: "err",
      text: result.error ?? "Requeue failed — the row was not changed.",
    };
  }
  return { tone: "ok", text: "Requeued — will retry on the next queue pass." };
}

export const VERIFY_SENDER_SUCCESS_MESSAGE = "Marked VERIFIED_READY.";

export function actionErrorMessage(error: unknown): OperatorActionBanner {
  return {
    tone: "err",
    text: error instanceof Error ? error.message : "Something went wrong — no change was made.",
  };
}
