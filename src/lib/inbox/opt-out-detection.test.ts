import { describe, expect, it } from "vitest";

import { MAILTO_OPT_OUT_LINE } from "@/lib/unsubscribe/outreach-mailbox-bodies";

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

/**
 * The word the product actually asks people to use.
 *
 * Every outreach email sent on the mailto rail ends with
 * `MAILTO_OPT_OUT_LINE` — "To opt out, reply STOP to this email and we'll
 * remove you." That instruction is the whole opt-out mechanism on that rail:
 * there is no link, so replying STOP is the only thing a recipient can do.
 *
 * Until 2026-08-26 a reply consisting of the word STOP matched none of the
 * patterns above — `stop-emailing` requires STOP to be followed by
 * "email"/"contact"/"messag"/"sending"/"reaching", which a bare STOP is not.
 * The system asked for a word and then ignored it.
 */
describe("classifyOptOutReply — the STOP the outreach email asks for", () => {
  it("is the word our own outreach footer instructs recipients to send", () => {
    // Anchors these tests to the shipped copy: if the instruction ever changes
    // word, this fails rather than silently testing the wrong thing.
    expect(MAILTO_OPT_OUT_LINE).toContain("reply STOP");
  });

  it("flags a reply that is just STOP, in the shapes mail clients produce", () => {
    for (const body of [
      "STOP",
      "stop",
      "Stop.",
      "STOP!",
      // CRLF is what Microsoft Graph actually hands us — observed verbatim in
      // production on 2026-08-26.
      "STOP\r\n\r\nPlease take me off this list.",
      "STOP\r\n",
      // Above a quoted original, the ordinary reply shape.
      "STOP\n\nOn Wed, 26 Aug 2026, Greg Visser wrote:\n> Hi there, we help with...",
    ]) {
      const v = classifyOptOutReply({ subject: "Re: Office maintenance", bodyText: body });
      expect(v.isOptOut, JSON.stringify(body)).toBe(true);
    }
  });

  it("flags STOP sent as the subject line, with or without a reply prefix", () => {
    for (const subject of ["STOP", "Re: STOP", "RE: Stop", "stop"]) {
      const v = classifyOptOutReply({ subject, bodyText: "" });
      expect(v.isOptOut, subject).toBe(true);
    }
  });

  it("does NOT fire on the word stop inside an ordinary sentence", () => {
    for (const body of [
      "Great — let's set up a call. We can stop the trial any time.",
      "We've had non-stop enquiries this month, so next week is better.",
      "Do not stop what you're doing on my account, happy to wait.",
    ]) {
      const v = classifyOptOutReply({ subject: "Re: hello", bodyText: body });
      expect(v.isOptOut, body).toBe(false);
    }
  });

  it("does NOT fire when our own STOP instruction comes back in the quoted original", () => {
    // An Outlook reply quotes the whole message, including our footer. A
    // positive reply must not be read as an opt-out because our own email said
    // the word.
    const body = [
      "Yes please, that sounds useful. Can you send some dates?",
      "",
      "From: Greg Visser <greg@bidlow.co.uk>",
      "Sent: 26 August 2026 13:16",
      "Subject: Office maintenance",
      "",
      MAILTO_OPT_OUT_LINE,
    ].join("\r\n");
    const v = classifyOptOutReply({ subject: "Re: Office maintenance", bodyText: body });
    expect(v.isOptOut).toBe(false);
  });
});
