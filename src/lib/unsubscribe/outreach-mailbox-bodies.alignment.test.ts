import { describe, expect, it } from "vitest";

import {
  buildMailboxGovernedEmailBodies,
  MAILTO_OPT_OUT_LINE,
} from "./outreach-mailbox-bodies";
import type { SenderSignatureMailbox } from "@/lib/mailboxes/sender-signature";

/**
 * HOLE 1b — the mailto rail can be defeated by the stored snapshot.
 *
 * `buildMailboxGovernedEmailBodies` resolves the opt-out like this:
 *
 *     const url = hosted ?? extracted ?? null;
 *
 * `hosted === null` is not an absence of information. It is how a caller SAYS
 * "this recipient gets the mailto rail, because there is no sender-aligned
 * domain to host a link on". The next line overrides that decision with
 * whatever URL happens to be sitting in the persisted snapshot, and the line
 * after suppresses the mailto opt-out because `url` is now truthy. The
 * deliberate safe choice is silently converted into the unsafe one.
 *
 * This is not theoretical. Measured on production 2026-08-24: 1358 of 1358 sent
 * emails have an unsubscribe URL on the OpensDoors app domain baked into
 * `bodySnapshot`, and ZERO use the mailto rail. Those snapshots predate the
 * 2026-08-06 rail fix, so they are exactly the poisoned input this path reads.
 *
 * The function is on the live send path for both providers, unconditionally:
 * `execute-one.ts:460` (Google) and `:620` (Microsoft) call it and put the
 * returned `.html` on the wire.
 *
 * Link alignment is Bidlow's own rule, earned from the 2026 quarantine — it is
 * not an external standard and is not presented as one here.
 */

const mailbox: SenderSignatureMailbox = {
  provider: "MICROSOFT",
  email: "sam@clientdomain.co.uk",
  displayName: "Sam",
  senderDisplayName: "Sam Example",
  senderSignatureHtml: null,
  senderSignatureText: "Sam Example\nClient Ltd",
  senderSignatureSource: "SET_IN_ODOUTREACH",
  senderSignatureSyncedAt: null,
  senderSignatureSyncError: null,
};

/** A snapshot shaped exactly like the 1,358 sitting in production today. */
const POISONED_SNAPSHOT = [
  "Hello there,",
  "",
  "We help facilities teams cut catering spend.",
  "",
  "---",
  "Unsubscribe: https://opensdoors.example/unsubscribe/abc123",
].join("\n");

describe("the mailto rail cannot be defeated by a URL in the snapshot", () => {
  it("does NOT put a foreign host in the email when the mailto rail was chosen", () => {
    const parts = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: POISONED_SNAPSHOT,
      mailbox,
      // The caller deliberately chose the mailto rail: no aligned domain exists.
      hostedUnsubscribeUrl: null,
      mailtoUnsubscribeAddress: "sam@clientdomain.co.uk",
    });

    // The whole purpose of this rail is that the email carries no host but the
    // sender's own.
    expect(parts.html).not.toContain("opensdoors.example");
    expect(parts.text).not.toContain("opensdoors.example");
  });

  it("still renders the visible mailto opt-out instead of the scavenged link", () => {
    const parts = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: POISONED_SNAPSHOT,
      mailbox,
      hostedUnsubscribeUrl: null,
      mailtoUnsubscribeAddress: "sam@clientdomain.co.uk",
    });

    // Without an opt-out at all the email is not sendable outreach, so the rail
    // must actually fire - not merely be skipped quietly.
    expect(parts.text).toContain(MAILTO_OPT_OUT_LINE);
    expect(parts.html).not.toContain("<a href=\"https://opensdoors.example");
  });

  it("DOES keep a snapshot URL that is aligned with the sending domain", () => {
    // Not everything extracted is dangerous. A link already on the sender's own
    // domain is exactly what the rule wants, and must survive.
    const aligned = [
      "Hello there,",
      "",
      "---",
      "Unsubscribe: https://go.clientdomain.co.uk/unsubscribe/abc123",
    ].join("\n");

    const parts = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: aligned,
      mailbox,
      hostedUnsubscribeUrl: null,
      mailtoUnsubscribeAddress: "sam@clientdomain.co.uk",
    });

    expect(parts.html).toContain("go.clientdomain.co.uk/unsubscribe/abc123");
  });

  it("an explicit hosted URL is still honoured exactly as before", () => {
    const parts = buildMailboxGovernedEmailBodies({
      bodySnapshotPlain: POISONED_SNAPSHOT,
      mailbox,
      hostedUnsubscribeUrl: "https://go.clientdomain.co.uk/unsubscribe/zzz",
      mailtoUnsubscribeAddress: "sam@clientdomain.co.uk",
    });

    expect(parts.html).toContain("go.clientdomain.co.uk/unsubscribe/zzz");
    expect(parts.html).not.toContain("opensdoors.example");
  });
});
