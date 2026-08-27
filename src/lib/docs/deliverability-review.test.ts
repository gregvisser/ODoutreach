/**
 * The client deliverability review is a document we SEND to the customer.
 *
 * Every load-bearing sentence in it is a claim about THIS codebase — "the
 * tracking pixel is off", "the ramp counts sending days", "bounce reporting
 * still shows zero". A document that says "fixed" about something that has
 * since changed is worse than no document at all: it is a written statement to
 * a paying client that is not true.
 *
 * So the claims are pinned here, against the real functions and the real
 * source, not against a paraphrase. Two directions matter equally:
 *
 *   - a "what was FIXED" claim goes red if the fix is reverted;
 *   - a "what REMAINS" claim goes red if the gap is closed — which is the
 *     good outcome, and the moment the document must be updated before it is
 *     sent again.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEND_BATCH_SIZE,
  resolveSendBatchSize,
} from "@/lib/mailboxes/send-pacing";
import {
  WARMUP_BASE_CAP,
  warmupDailyCap,
} from "@/lib/mailboxes/mailbox-warmup";
import { resolveUnsubscribeRail } from "@/lib/unsubscribe/one-click-readiness";

const REPO_ROOT = process.cwd();

const DOC_PATH = path.join(
  REPO_ROOT,
  "docs",
  "client",
  "2026-08-27-deliverability-review.md",
);

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/**
 * Source with comments removed.
 *
 * `send-introduction.ts` deliberately NAMES `resolvePublicBaseUrl` in a comment
 * explaining why it must never be imported, so a plain text search finds it and
 * reports the defect is back when it is not. Stripping comments first asks the
 * stronger and actually correct question: does executable code reference it?
 *
 * The `//` rule ignores a slash pair preceded by `:` so that `https://` inside a
 * string literal does not swallow the rest of its line.
 */
function executableCodeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readDocument(): string {
  return readFileSync(DOC_PATH, "utf8");
}

describe("the client deliverability review document", () => {
  it("exists, and is the document the client was promised", () => {
    const doc = readDocument();
    expect(doc.length).toBeGreaterThan(2000);
  });

  it("answers all three of the client's questions, in that order", () => {
    const doc = readDocument();
    const wrong = doc.indexOf("## What was wrong");
    const fixed = doc.indexOf("## What has been fixed");
    const remains = doc.indexOf("## What is still outstanding");

    expect(wrong, "missing 'What was wrong'").toBeGreaterThan(-1);
    expect(fixed, "missing 'What has been fixed'").toBeGreaterThan(-1);
    expect(remains, "missing 'What is still outstanding'").toBeGreaterThan(-1);
    expect(wrong).toBeLessThan(fixed);
    expect(fixed).toBeLessThan(remains);
  });
});

describe("CLAIM: outreach links no longer point at the OpensDoors app domain", () => {
  it("the real-prospect send path does not reference the app base URL at all", () => {
    const source = readRepoFile("src/server/email-sequences/send-introduction.ts");
    const code = executableCodeOnly(source);

    // Sanity: if comment-stripping ever eats the file, the absence check below
    // would pass vacuously and this guard would be worthless.
    expect(code).toContain("resolveClientLinkBaseUrl");

    expect(
      code.includes("resolvePublicBaseUrl"),
      "send-introduction.ts references resolvePublicBaseUrl again — the quarantine root cause is back, and the document tells the client it is fixed",
    ).toBe(false);
  });

  it("with no aligned domain the opt-out falls to the sender's own mailbox, never a hosted link", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: null,
      sendingMailboxAddress: "luke.smith@morsonfm.co.uk",
    });
    expect(rail).toEqual({ kind: "mailto", address: "luke.smith@morsonfm.co.uk" });
  });

  it("blocks the send outright rather than inventing a link when there is no rail at all", () => {
    const rail = resolveUnsubscribeRail({
      alignedBaseUrl: null,
      sendingMailboxAddress: null,
    });
    expect(rail).toEqual({ kind: "none" });
  });
});

describe("CLAIM: the warm-up ramp counts days the mailbox actually sent on", () => {
  it("a mailbox connected long ago that has never sent starts at 5 a day", () => {
    expect(warmupDailyCap(30, 0)).toBe(WARMUP_BASE_CAP);
    expect(warmupDailyCap(30, 0)).toBe(5);
  });

  it("the most-used mailbox in the fleet — 10 sending days — is still capped at 15", () => {
    expect(warmupDailyCap(30, 10)).toBe(15);
  });

  it("30 a day is 25 sending days away, which is the figure the document quotes", () => {
    expect(warmupDailyCap(30, 24)).toBeLessThan(30);
    expect(warmupDailyCap(30, 25)).toBe(30);
  });
});

describe("CLAIM: sending is paced at four at a time by default", () => {
  it("the house default is four", () => {
    expect(DEFAULT_SEND_BATCH_SIZE).toBe(4);
    expect(resolveSendBatchSize(null)).toBe(4);
  });
});

describe("CLAIM: a bounce is now written against the original email", () => {
  it("the mailbox bounce path both blocks the address AND marks the row", () => {
    const source = readRepoFile("src/server/mailbox/bounce-detection.ts");

    expect(
      source.includes("suppressRecipientForHardBounce"),
      "the protection half is gone — the document claims bounced addresses are blocked",
    ).toBe(true);

    expect(
      source.includes("recordOutboundBounce"),
      "the mailbox bounce path no longer marks the original email. The document tells the client the reported bounce figure can move off zero — it cannot if this is reverted.",
    ).toBe(true);
  });

  it("both routes a bounce arrives by end in the SAME writer", () => {
    const webhook = readRepoFile(
      "src/server/email/webhooks/outbound-provider-events.ts",
    );
    const recorder = readRepoFile(
      "src/server/email/outbound/record-bounce.ts",
    );

    // The document's claim is specifically "one piece of code", not "two paths
    // that happen to agree today". Both must import the shared writer, and the
    // shared writer must be the only place BOUNCED is assigned.
    expect(webhook.includes("stampOutboundBounce")).toBe(true);
    expect(
      /status:\s*"BOUNCED"/.test(webhook),
      "the webhook path has grown its own BOUNCED write again — the two routes can now drift apart",
    ).toBe(false);
    expect(/status:\s*"BOUNCED"/.test(recorder)).toBe(true);
  });
});

describe("HONESTY: the bounce rate is presented as an estimate, not a measurement", () => {
  it("says so in as many words", () => {
    const doc = readDocument();
    expect(doc).toContain("4-5%");
    expect(
      doc.toLowerCase(),
      "the 4-5% figure is inferred from bounce messages that were never classified. Calling it a measurement in a client document would be a false claim.",
    ).toContain("an estimate, not a measurement");
  });

  it("does not claim we sent anything on the client's behalf while proving the fixes", () => {
    const doc = readDocument();
    expect(doc).toContain("No outreach has been sent");
  });
});
