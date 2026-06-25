import { describe, expect, it } from "vitest";

import { classifyOptOutReply, stripQuotedReply } from "./opt-out-detection";

describe("stripQuotedReply", () => {
  it("keeps only the new text before a quoted original", () => {
    const body = [
      "Please remove me from your list.",
      "",
      "On Mon, 23 Jun 2026, Luke Smith wrote:",
      "> Hi Cameron, we help with office maintenance...",
      "> Unsubscribe: https://app.example.com/unsubscribe/abc",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Please remove me from your list.");
  });

  it("handles a body with no quote markers", () => {
    expect(stripQuotedReply("Just the reply.")).toBe("Just the reply.");
  });
});

describe("classifyOptOutReply (H3)", () => {
  it("flags explicit removal demands", () => {
    for (const body of [
      "Please stop emailing me.",
      "Unsubscribe me.",
      "Take me off your list.",
      "Please remove me from your mailing list.",
      "Do not contact me again.",
      "I'd like to opt out, thanks.",
      "This is spam — stop.",
    ]) {
      const v = classifyOptOutReply({ subject: "Re: hello", bodyText: body });
      expect(v.isOptOut, body).toBe(true);
      expect(v.evidence.length).toBeGreaterThan(0);
    }
  });

  it("does NOT false-positive on the quoted original email's unsubscribe footer", () => {
    const body = [
      "Sure, sounds interesting — can you send pricing?",
      "",
      "On Mon, Luke Smith wrote:",
      "> ...",
      "> Unsubscribe: https://app.example.com/unsubscribe/abc",
    ].join("\n");
    const v = classifyOptOutReply({ subject: "Re: Office maintenance", bodyText: body });
    expect(v.isOptOut).toBe(false);
  });

  it("does NOT treat a soft 'not interested' as an opt-out", () => {
    const v = classifyOptOutReply({
      subject: "Re: hello",
      bodyText: "Thanks but we're not interested right now.",
    });
    expect(v.isOptOut).toBe(false);
  });

  it("does not flag a normal positive reply", () => {
    const v = classifyOptOutReply({
      subject: "Re: hello",
      bodyText: "Great, let's set up a call next week.",
    });
    expect(v.isOptOut).toBe(false);
  });
});
