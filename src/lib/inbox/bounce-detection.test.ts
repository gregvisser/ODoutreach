import { describe, expect, it } from "vitest";

import { classifyInboundBounce } from "./bounce-detection";

describe("classifyInboundBounce (H2)", () => {
  it("classifies a Microsoft 365 NDR as a hard bounce and extracts the recipient", () => {
    const v = classifyInboundBounce({
      fromEmail: "postmaster@morsonfm.co.uk",
      subject: "Undeliverable: Support with Office Maintenance",
      bodyText: [
        "Delivery has failed to these recipients or groups:",
        "cameron@octaviangr.com",
        "The email address you entered couldn't be found.",
        "Final-Recipient: rfc822; cameron@octaviangr.com",
        "Action: failed",
        "Status: 5.1.1",
        "Diagnostic-Code: smtp;550 5.1.1 RESOLVER.ADR.RecipNotFound; not found",
      ].join("\n"),
    });
    expect(v.isBounce).toBe(true);
    expect(v.isHardBounce).toBe(true);
    expect(v.failedRecipient).toBe("cameron@octaviangr.com");
  });

  it("classifies a Gmail mailer-daemon failure as a hard bounce", () => {
    const v = classifyInboundBounce({
      fromEmail: "mailer-daemon@googlemail.com",
      subject: "Delivery Status Notification (Failure)",
      bodyText: [
        "Address not found",
        "Your message wasn't delivered to deadbox@example.com because the address couldn't be found.",
        "The response from the remote server was:",
        "550 5.1.1 The email account that you tried to reach does not exist.",
        "Final-Recipient: rfc822; deadbox@example.com",
        "Action: failed",
        "Status: 5.1.1",
      ].join("\n"),
    });
    expect(v.isBounce).toBe(true);
    expect(v.isHardBounce).toBe(true);
    expect(v.failedRecipient).toBe("deadbox@example.com");
  });

  it("does NOT treat a transient (4.x.x / mailbox full) bounce as hard", () => {
    const v = classifyInboundBounce({
      fromEmail: "mailer-daemon@example.com",
      subject: "Delivery delayed: message could not be delivered yet",
      bodyText: [
        "The recipient's mailbox is full and could not accept your message.",
        "Final-Recipient: rfc822; busy@example.com",
        "Action: delayed",
        "Status: 4.2.2",
      ].join("\n"),
    });
    expect(v.isBounce).toBe(true);
    expect(v.isHardBounce).toBe(false);
    expect(v.failedRecipient).toBeNull();
  });

  it("does not classify a genuine human reply as a bounce", () => {
    const v = classifyInboundBounce({
      fromEmail: "cameron@octaviangr.com",
      subject: "Re: Support with Office Maintenance",
      bodyText: "Thanks, this sounds interesting — can you send more detail?",
    });
    expect(v.isBounce).toBe(false);
    expect(v.isHardBounce).toBe(false);
    expect(v.failedRecipient).toBeNull();
  });

  it("is conservative: an 'Undeliverable' with no permanent signal is NOT hard", () => {
    const v = classifyInboundBounce({
      fromEmail: "postmaster@example.com",
      subject: "Undeliverable",
      bodyText: "Your message could not be delivered to the recipient.",
    });
    expect(v.isBounce).toBe(true);
    expect(v.isHardBounce).toBe(false);
    expect(v.failedRecipient).toBeNull();
  });

  it("detects a hard bounce from a 'user unknown' phrase even without an enhanced code", () => {
    const v = classifyInboundBounce({
      fromEmail: "MAILER-DAEMON@mail.example.net",
      subject: "failure notice",
      bodyText: [
        "Hi. This is the qmail-send program.",
        "<ghost@example.net>:",
        "Sorry, no mailbox here by that name. User unknown.",
        "Final-Recipient: rfc822; ghost@example.net",
      ].join("\n"),
    });
    expect(v.isBounce).toBe(true);
    expect(v.isHardBounce).toBe(true);
    expect(v.failedRecipient).toBe("ghost@example.net");
  });
});
