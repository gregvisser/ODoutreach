import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Demo-copy policy — cycle 14.
 *
 * Every assertion here corresponds to something found by opening the screen in
 * a real browser (`e2e/screen-walk.spec.ts`) and reading what a non-technical
 * client actually sees. Three classes of defect, all of which make a finished
 * product read as half-built:
 *
 *   1. RAW MARKDOWN. A `**bold**` marker in a copy string is rendered
 *      literally, because these screens render plain text, not Markdown.
 *   2. ENGINEER JARGON in a status a client reads aloud — "API missing",
 *      "OAuth readiness". The client does not know what an API is; they know
 *      whether their outreach can go out.
 *   3. THE SAME SENTENCE TWICE on one screen — an explanation in a card
 *      description repeated verbatim in that card's own empty state.
 *
 * Source is read as a string: fast, DB-free, and it fails on the copy itself
 * rather than on a render tree that could change shape. This mirrors the
 * existing `*-ui-policy.test.ts` files.
 */
function source(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

const trainingModules = source("src", "lib", "training", "modules.ts");
const launchState = source("src", "lib", "client-launch-state.ts");
const proofSendCard = source(
  "src",
  "components",
  "clients",
  "internal-proof-send-card.tsx",
);
const familyPanel = source(
  "src",
  "components",
  "suppression",
  "domain-family-panel.tsx",
);
const clientActivityPage = source(
  "src",
  "app",
  "(app)",
  "clients",
  "[clientId]",
  "activity",
  "page.tsx",
);
const sequencesPanel = source(
  "src",
  "components",
  "clients",
  "email-sequences",
  "client-email-sequences-panel.tsx",
);

/**
 * Pulls every double-quoted copy string out of a source file, skipping the
 * lines that are comments — a `/** ... *\/` block legitimately contains `**`.
 */
function copyStrings(fileSource: string): string[] {
  return fileSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//");
    })
    .flatMap((line) => line.match(/"[^"\\]{12,}"/g) ?? []);
}

describe("demo copy policy — raw Markdown never reaches the screen", () => {
  it("training module copy contains no literal ** emphasis markers", () => {
    const offenders = copyStrings(trainingModules).filter((s) =>
      s.includes("**"),
    );
    expect(offenders).toEqual([]);
  });

  it("training module copy contains no literal backtick code spans", () => {
    // `noreply@` rendered with its backticks still attached on
    // /training/mailboxes. Nothing on these screens parses Markdown.
    const offenders = copyStrings(trainingModules).filter((s) =>
      /`[^`]+`/.test(s),
    );
    expect(offenders).toEqual([]);
  });
});

describe("demo copy policy — no engineer jargon in client-facing status", () => {
  it("launch readiness metrics say what to do, not which API is missing", () => {
    // These render as the status chip beside Sources / Do-not-contact /
    // Outreach on the client overview — the first screen of a demo.
    expect(launchState).not.toContain('"API missing"');
    expect(launchState).not.toContain('"Google API missing"');
    expect(launchState).not.toContain('"Check mailboxes & OAuth"');
  });

  it("the mailbox verification hint does not mention OAuth", () => {
    expect(proofSendCard).not.toContain("OAuth readiness");
  });
});

describe("demo copy policy — one screen never says the same thing twice", () => {
  it("the related-domains empty state does not repeat the card description", () => {
    // The bt.com / bteurope.com explanation is the Card's description on
    // /clients/[id]/suppression. The panel's own empty state repeated it
    // word for word, two inches below.
    expect(familyPanel).not.toContain("does not block");
  });

  it("the sequence count line is suppressed when there are no sequences", () => {
    // "0 sequences for this client." sat directly above "No sequences yet."
    expect(sequencesPanel).toContain("counts.total > 0");
  });

  it("Activity never shows the same figure in the strip and the card", () => {
    // Both are driven by the same `metrics` object. The strip is the headline;
    // the card is the detail. A label present in both means a client reads the
    // same number twice under two names ("Unsubscribes" / "Opt-outs") and asks
    // which one is real.
    const labelsIn = (component: string): string[] =>
      Array.from(
        clientActivityPage.matchAll(
          new RegExp(`<${component}\\b[^>]*?label="([^"]+)"`, "gs"),
        ),
        (match) => match[1],
      );

    const stripLabels = new Set(labelsIn("SummaryCard"));
    const cardLabels = labelsIn("MetricRow");

    // Guards the guard: if the page is refactored away from these components
    // the test must fail loudly rather than pass on two empty sets.
    expect(stripLabels.size).toBeGreaterThan(0);
    expect(cardLabels.length).toBeGreaterThan(0);

    expect(cardLabels.filter((label) => stripLabels.has(label))).toEqual([]);
  });
});

/**
 * Queue item 27, defect (8) — "words a non-technical owner will stop on",
 * recorded by opening the live site in Chrome on 2026-08-26.
 *
 * These are not typos. Each one is an internal implementation detail that
 * escaped onto a screen a client reads: the name of a database condition
 * ("send proof missing"), the FORMULA behind a number instead of its meaning,
 * and a headline metric whose value is the words "Not tracked", which reads as
 * a broken page rather than as "nobody reports this".
 */
describe("demo copy policy — no engineer vocabulary in the headline numbers", () => {
  const reportingPage = source("src", "app", "(app)", "reporting", "page.tsx");
  const mailboxPanel = source(
    "src",
    "components",
    "clients",
    "client-mailbox-identities-panel.tsx",
  );

  it("neither Reports nor Activity labels a number 'Send proof missing'", () => {
    // "Proof" is our word for a provider message id. A client reading "Send
    // proof missing: 204" in red cannot tell whether 204 emails failed.
    expect(reportingPage).not.toContain('label="Send proof missing"');
    expect(clientActivityPage).not.toContain('label="Send proof missing"');
  });

  it("does not print the formula behind 'Not reached' as its explanation", () => {
    expect(reportingPage).not.toContain(
      "failed + bounces + suppressed + proof missing",
    );
  });

  it("never renders the words 'Not tracked' as a headline metric's value", () => {
    // Small print may say a thing is not tracked. A 30px number may not BE
    // the words "Not tracked" — on the live site that was the Delivered card.
    expect(reportingPage).not.toContain(
      'm.deliveryTracked ? m.delivered.toLocaleString() : "Not tracked"',
    );
  });

  it("calls troubleshooting sections what they are, not 'diagnostics'", () => {
    expect(clientActivityPage).not.toContain("Admin diagnostics");
    expect(mailboxPanel).not.toContain("Connection diagnostics");
  });
});
