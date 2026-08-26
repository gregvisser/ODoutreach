/**
 * Turn any outcome of a server action into something the operator can SEE.
 *
 * Server actions have three outcomes, not two. They can resolve with `ok:true`,
 * resolve with `ok:false` (the action ran and refused), or REJECT — the request
 * never got an answer at all. The third is the one panels forget, and it is not
 * hypothetical here: production sheds concurrent requests with 503, so a POST
 * fired during a prefetch burst rejects in the browser. A panel that only
 * branches on `ok` shows the operator nothing in that case.
 *
 * The wording deliberately does NOT claim the work happened, and does not claim
 * it did not. When the answer is lost we genuinely cannot tell, and telling an
 * operator "nothing was changed" when a decision may well have been committed
 * is the same class of lie as claiming a send that never left.
 */

/** What a panel needs in order to render: some words, and how to style them. */
export type PanelActionOutcome = {
  isError: boolean;
  message: string;
  /** True when offering a retry control is the right next step. */
  retryable: boolean;
};

/** The shape every server action in this area returns. */
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Errors that mean "the request did not get an answer" rather than "the server
 * considered it and said no". Covers the browser's own transport failures and
 * the message Next.js surfaces when a server action gets a non-action response
 * — which is exactly what a 503 from App Service looks like from the client.
 */
const NO_ANSWER = /failed to fetch|networkerror|network error|load failed|unexpected response|503|service unavailable|fetch failed/i;

const RETRY = "Press Try again.";

/** Never let an operator face a blank error. */
function toText(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  if (typeof cause === "string" && cause.trim()) return cause.trim();
  return "";
}

/**
 * Plain-English wording for a failed action, always ending in a retry
 * instruction so the operator has somewhere to go.
 */
export function describeActionFailure(cause: unknown): string {
  const text = toText(cause);

  if (NO_ANSWER.test(text)) {
    return `The server did not answer — it may be busy. We could not tell whether that finished, so nothing on screen has changed. ${RETRY}`;
  }

  if (!text) {
    return `Something went wrong and we could not tell whether that finished. ${RETRY}`;
  }

  return `Something went wrong: ${text}. We could not tell whether that finished. ${RETRY}`;
}

/**
 * Run a server action and report what happened, whichever way it went.
 *
 * The success formatter runs inside the same guard on purpose: a formatter that
 * throws would otherwise leave the panel silent in exactly the way this module
 * exists to prevent.
 */
export async function resolveActionOutcome<R extends ActionResult>(
  run: () => Promise<R>,
  describeSuccess: (result: Extract<R, { ok: true }>) => string,
): Promise<PanelActionOutcome> {
  try {
    const result = await run();

    if (!result.ok) {
      return { isError: true, message: result.error, retryable: true };
    }

    return {
      isError: false,
      message: describeSuccess(result as Extract<R, { ok: true }>),
      retryable: false,
    };
  } catch (cause) {
    return {
      isError: true,
      message: describeActionFailure(cause),
      retryable: true,
    };
  }
}
