import { describe, expect, it } from "vitest";

import { humanizeLaunchBlocker } from "@/lib/clients/launch-blocker-copy";

describe("humanizeLaunchBlocker", () => {
  it("maps the invisible sender-signature blocker to a mailboxes link", () => {
    const hint = humanizeLaunchBlocker(
      "A sender signature is not configured on any connected mailbox.",
    );
    expect(hint.text).toMatch(/signature/i);
    expect(hint.hrefSuffix).toBe("/mailboxes");
    expect(hint.actionLabel).toBeTruthy();
  });

  it("distinguishes 'suppression not configured' from 'needs sync'", () => {
    expect(humanizeLaunchBlocker("Suppression is not configured.").text).toMatch(
      /attach/i,
    );
    const sync = humanizeLaunchBlocker("Launch readiness blocker: Suppression.");
    expect(sync.text).toMatch(/sync/i);
    expect(sync.hrefSuffix).toBe("/suppression");
  });

  it("maps 'contacts loaded but none eligible' to the contacts page", () => {
    const hint = humanizeLaunchBlocker("Launch readiness blocker: Contacts.");
    expect(hint.text).toMatch(/eligible/i);
    expect(hint.hrefSuffix).toBe("/contacts");
  });

  it("maps sequence + enrollment blockers to outreach", () => {
    expect(
      humanizeLaunchBlocker(
        "No launchable production sequence — open Outreach and pass the sequence launch checks.",
      ).hrefSuffix,
    ).toBe("/outreach");
    expect(humanizeLaunchBlocker("No sequence enrollments.").hrefSuffix).toBe(
      "/outreach",
    );
  });

  it("has a generic fallback for unknown 'Launch readiness blocker: X'", () => {
    const hint = humanizeLaunchBlocker("Launch readiness blocker: Widgets.");
    expect(hint.text).toBe("Finish setup: Widgets.");
    expect(hint.hrefSuffix).toBeUndefined();
  });

  it("passes through a fully unknown blocker verbatim (never hides it)", () => {
    const raw = "Some brand new gate we have not mapped yet.";
    expect(humanizeLaunchBlocker(raw)).toEqual({ text: raw });
  });
});
