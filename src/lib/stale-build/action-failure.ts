/**
 * Detect a server-action mismatch after a deploy (Next.js UnrecognizedActionError).
 * Kept free of `next/*` imports so unit tests stay in the node vitest suite.
 */
export function isUnrecognizedActionFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      if (current.name === "UnrecognizedActionError") return true;
      if (messageLooksLikeMissingServerAction(current.message)) return true;
      current = current.cause;
      continue;
    }

    const record = current as Record<string, unknown>;
    if (record.name === "UnrecognizedActionError") return true;
    if (
      typeof record.message === "string" &&
      messageLooksLikeMissingServerAction(record.message)
    ) {
      return true;
    }
    break;
  }

  if (typeof error === "string" && messageLooksLikeMissingServerAction(error)) {
    return true;
  }

  return false;
}

function messageLooksLikeMissingServerAction(message: string): boolean {
  return /Server Action "[^"]+" was not found on the server/i.test(message);
}
