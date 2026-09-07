import { expect, it } from "vitest";
import { inboundReplyMessageHref, isInboundMailboxReply } from "./inbound-reply-metadata";

it.each([null, {}, [], "inboundMailboxReply", { kind: null }, { kind: "campaign" }])("does not classify ordinary or malformed metadata as an inline reply: %j", (metadata) => {
  expect(isInboundMailboxReply(metadata)).toBe(false);
  expect(inboundReplyMessageHref("client", metadata)).toBeNull();
});
it("recognizes a reply even when its original message link is missing", () => {
  const metadata = { kind: "inboundMailboxReply" };
  expect(isInboundMailboxReply(metadata)).toBe(true);
  expect(inboundReplyMessageHref("client", metadata)).toBeNull();
});
it("builds a client-scoped link only for an ordinary message identifier", () => {
  expect(inboundReplyMessageHref("client", { kind: "inboundMailboxReply", inboundMessageId: "original-message" })).toBe("/clients/client/activity/messages/original-message");
  for (const id of ["", "..", "../other", "https://example.test", 123]) {
    expect(inboundReplyMessageHref("client", { kind: "inboundMailboxReply", inboundMessageId: id })).toBeNull();
  }
});
