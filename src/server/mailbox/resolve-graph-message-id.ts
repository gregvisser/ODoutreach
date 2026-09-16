import "server-only";

import { normalizeEmail } from "@/lib/normalize";
import { stringMetadata } from "./graph-message-identity";

/** A provider locator is not the app identity. Resolve before dispatch so stale
 * overlapping sync snapshots cannot send using an obsolete folder-specific ID.
 * This performs only a GET; callers must never retry uncertain reply POSTs.
 */
export async function resolveGraphMessageId(input: {
  accessToken: string; mailboxUserPrincipalName: string;
  message: { providerMessageId: string; metadata: unknown; fromEmail: string; receivedAt: Date };
}): Promise<string> {
  const { message } = input;
  const internetMessageId = stringMetadata(message.metadata, "internetMessageId")?.trim();
  if (!internetMessageId) return stringMetadata(message.metadata, "graphMessageId") ?? message.providerMessageId;
  const url = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.mailboxUserPrincipalName.trim())}/messages`);
  url.searchParams.set("$filter", `internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`);
  url.searchParams.set("$select", "id,internetMessageId,from,receivedDateTime");
  url.searchParams.set("$top", "2");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Microsoft could not verify this message. Retry after the mailbox is available.");
  const body = await response.json() as {
    value?: { id?: string; internetMessageId?: string; from?: { emailAddress?: { address?: string } }; receivedDateTime?: string }[];
    "@odata.nextLink"?: string;
  };
  if (!Array.isArray(body.value) || body["@odata.nextLink"]) {
    throw new Error("Microsoft message identity is ambiguous; administrator review required.");
  }
  const matches = body.value.filter(row => typeof row.id === "string" && row.id &&
    row.internetMessageId?.trim() === internetMessageId &&
    normalizeEmail(row.from?.emailAddress?.address ?? "") === normalizeEmail(message.fromEmail) &&
    !!row.receivedDateTime && new Date(row.receivedDateTime).getTime() === message.receivedAt.getTime());
  if (matches.length !== 1) throw new Error("Microsoft could not identify the original message uniquely. Sync the mailbox and try again.");
  return matches[0].id!;
}
