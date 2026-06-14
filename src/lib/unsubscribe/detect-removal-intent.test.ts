import { describe, expect, it } from "vitest";

import {
  detectRemovalIntent,
  scanRemovalIntent,
} from "./detect-removal-intent";

describe("scanRemovalIntent — genuine removal requests", () => {
  // The real case from production: alex.ullmann@pxc.co.uk's reply.
  it("flags the production reply that prompted this fix", () => {
    const r = scanRemovalIntent(
      "Hi Sam, Not in control of business travel, and we're in a long term deal with a provider. Unable to unsubscribe via link, please remove me from your records Thanks, Alex Ullmann Sustainability",
    );
    expect(r.detected).toBe(true);
  });

  it.each([
    "Please remove me from your mailing list.",
    "Stop emailing me.",
    "I want to opt out of these emails",
    "opt-out please",
    "unsubscribe me please",
    "Take me off your list",
    "do not contact me again",
    "Please delete my details from your database",
    "I no longer wish to receive these emails",
    "I can't unsubscribe — please take me off",
    "kindly unsubscribe my address",
  ])("flags: %s", (text) => {
    expect(scanRemovalIntent(text).detected).toBe(true);
  });
});

describe("scanRemovalIntent — must NOT false-positive", () => {
  it("ignores a positive reply", () => {
    expect(
      scanRemovalIntent("Thanks, this sounds great — let's chat next week.")
        .detected,
    ).toBe(false);
  });

  it("does not treat a sales objection as a removal request", () => {
    expect(scanRemovalIntent("Not interested, thanks.").detected).toBe(false);
  });

  it("ignores a mention of subscribing", () => {
    expect(
      scanRemovalIntent("I'd love to subscribe to your newsletter!").detected,
    ).toBe(false);
  });

  it("does NOT fire on the polite 'do not hesitate to contact me'", () => {
    expect(
      scanRemovalIntent(
        "Sounds interesting. Please do not hesitate to contact me with details.",
      ).detected,
    ).toBe(false);
  });

  it("does NOT fire on our own quoted unsubscribe footer (the key trap)", () => {
    const reply =
      "Sounds good!\n\n---\nUnsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/abc123def";
    expect(scanRemovalIntent(reply).detected).toBe(false);
  });

  it("ignores quoted original-email lines beginning with >", () => {
    const reply =
      "Great, I'll review and revert.\n> ---\n> Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/xyz\n> From: Sam";
    expect(scanRemovalIntent(reply).detected).toBe(false);
  });

  it("handles empty / null input", () => {
    expect(scanRemovalIntent("").detected).toBe(false);
    expect(scanRemovalIntent(null).detected).toBe(false);
    expect(scanRemovalIntent(undefined).detected).toBe(false);
  });
});

describe("detectRemovalIntent — across reply parts", () => {
  it("detects intent carried in the subject", () => {
    const r = detectRemovalIntent({
      subject: "Re: unsubscribe me",
      snippet: "see below",
      bodyPreview: null,
    });
    expect(r.detected).toBe(true);
  });

  it("combines snippet + bodyPreview and ignores the quoted footer in bodyPreview", () => {
    const r = detectRemovalIntent({
      subject: "Re: OpensDoors Prospect",
      snippet: "Please take me off your list",
      bodyPreview:
        "Please take me off your list\n\n---\nUnsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/tok",
    });
    expect(r.detected).toBe(true);
    expect(r.signal).toBe("take me off");
  });

  it("returns no detection for an all-positive reply", () => {
    expect(
      detectRemovalIntent({
        subject: "Re: great chat",
        snippet: "Looking forward to it",
        bodyPreview: "Looking forward to it, thanks!",
      }).detected,
    ).toBe(false);
  });
});
