import { describe, expect, it } from "vitest";

import {
  mapGmailMessageToRow,
  parseEmailFromHeader,
  type GmailApiMessageDetail,
} from "./gmail-inbox";

describe("parseEmailFromHeader", () => {
  it("parses angle-bracket addresses", () => {
    expect(parseEmailFromHeader(`Jane <jane@example.com>`)).toBe("jane@example.com");
  });

  it("parses bare addresses", () => {
    expect(parseEmailFromHeader("jane@example.com")).toBe("jane@example.com");
  });
});

describe("mapGmailMessageToRow", () => {
  it("maps metadata to an idempotent row shape", () => {
    const msg: GmailApiMessageDetail = {
      id: "msgAbc",
      threadId: "threadX",
      snippet: "Hello world",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "Sender <sender@workspace.test>" },
          { name: "To", value: "me@workspace.test" },
          { name: "Subject", value: "Re: test" },
        ],
      },
    };
    const row = mapGmailMessageToRow(msg);
    expect(row).not.toBeNull();
    expect(row!.providerMessageId).toBe("msgAbc");
    expect(row!.fromEmail).toBe("sender@workspace.test");
    expect(row!.toEmail).toBe("me@workspace.test");
    expect(row!.conversationId).toBe("threadX");
    expect(row!.metadata.threadId).toBe("threadX");
    // PR Q — internalDate and rfc822MessageId captured for future fetch reliability.
    expect(row!.metadata.internalDate).toBe("1700000000000");
    expect(row!.metadata.rfc822MessageId).toBeNull();
  });

  it("captures rfc822 Message-ID header in metadata (PR Q)", () => {
    const msg: GmailApiMessageDetail = {
      id: "msgAbc",
      threadId: "threadX",
      snippet: "Hello",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "sender@workspace.test" },
          { name: "Subject", value: "Hi" },
          { name: "Message-ID", value: "<abc123@mail.workspace.test>" },
        ],
      },
    };
    const row = mapGmailMessageToRow(msg);
    expect(row!.metadata.rfc822MessageId).toBe(
      "<abc123@mail.workspace.test>",
    );
  });

  it("also accepts lower-case Message-Id spelling (PR Q)", () => {
    const msg: GmailApiMessageDetail = {
      id: "msgAbc",
      threadId: "threadX",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "sender@workspace.test" },
          { name: "Message-Id", value: "<x@y>" },
        ],
      },
    };
    const row = mapGmailMessageToRow(msg);
    expect(row!.metadata.rfc822MessageId).toBe("<x@y>");
  });

  it("returns null when From cannot be parsed", () => {
    const msg: GmailApiMessageDetail = {
      id: "x",
      payload: { headers: [{ name: "From", value: "not-an-email" }] },
    };
    expect(mapGmailMessageToRow(msg)).toBeNull();
  });
});
