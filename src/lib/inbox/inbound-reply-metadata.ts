export const INBOUND_REPLY_METADATA_KIND = "inboundMailboxReply";

export function isInboundMailboxReply(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && !Array.isArray(metadata)
    && "kind" in metadata && metadata.kind === INBOUND_REPLY_METADATA_KIND;
}

export function inboundReplyMessageHref(clientId: string, metadata: unknown): string | null {
  if (!isInboundMailboxReply(metadata)) return null;
  const messageId = (metadata as { inboundMessageId?: unknown }).inboundMessageId;
  return typeof messageId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(messageId)
    ? `/clients/${encodeURIComponent(clientId)}/activity/messages/${encodeURIComponent(messageId)}`
    : null;
}
