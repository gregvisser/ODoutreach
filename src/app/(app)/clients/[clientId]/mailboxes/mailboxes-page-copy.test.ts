import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAILBOXES_PAGE_INTRO,
  MAILBOXES_PAGE_SUBTITLE,
  MAILBOXES_WHAT_HAPPENS_BULLETS,
} from "@/lib/mailboxes/mailbox-workspace-model";

/**
 * PR #139 — Mailboxes is staff-ready.
 *
 * This test supersedes the smaller PR #117 (`fix/mailboxes-remove-clutter-copy`)
 * test by:
 *   - locking the same dev-jargon removals (no "Tokens are stored",
 *     "shared sending pool", "authorised operator", "Clients do not need…",
 *     "MFA in the browser"),
 *   - also asserting the new page title ("Connected sending mailboxes —
 *     {client}") and the explainer card ("What happens when you connect a
 *     mailbox?") that PR #139 adds.
 */

const PAGE_PATH = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/mailboxes/page.tsx",
);
const PANEL_PATH = join(
  process.cwd(),
  "src/components/clients/client-mailbox-identities-panel.tsx",
);
const MODEL_PATH = join(
  process.cwd(),
  "src/lib/mailboxes/mailbox-workspace-model.ts",
);
const OPERATOR_MODEL_PATH = join(
  process.cwd(),
  "src/lib/mailboxes/mailboxes-operator-model.ts",
);

const combined = [PAGE_PATH, PANEL_PATH, MODEL_PATH, OPERATOR_MODEL_PATH]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const FORBIDDEN_DEV_PHRASES = [
  "Clients do not need ODoutreach sign-in",
  "Tokens are stored",
  "shared sending pool",
  "MFA in the browser",
  "authorised operator on this client",
  "they do not need ODoutreach Staff Access",
  "Outbound and inbound history already stored in OpensDoors remains visible",
] as const;

describe("Client Mailboxes page copy (PR #139, supersedes PR #117)", () => {
  it("keeps MAILBOXES_PAGE_INTRO and explainer free of dev jargon", () => {
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(MAILBOXES_PAGE_INTRO).not.toContain(phrase);
    }
    const explainer = MAILBOXES_WHAT_HAPPENS_BULLETS.join("\n");
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(explainer).not.toContain(phrase);
    }
  });

  it("does not reintroduce clutter in mailboxes page, panel, model or operator-model sources", () => {
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(combined).not.toContain(phrase);
    }
  });

  it("titles the page Connected sending mailboxes (with the client name)", () => {
    expect(MAILBOXES_PAGE_SUBTITLE).toBe("Connected sending mailboxes");
    const pageSrc = readFileSync(PAGE_PATH, "utf8");
    expect(pageSrc).toContain("{MAILBOXES_PAGE_SUBTITLE} — {client.name}");
  });

  it("renders the What-happens explainer card on the Mailboxes page", () => {
    const pageSrc = readFileSync(PAGE_PATH, "utf8");
    expect(pageSrc).toContain("What happens when you connect a mailbox?");
    expect(pageSrc).toContain("MAILBOXES_WHAT_HAPPENS_BULLETS");
  });

  it("explainer states no email is sent when you connect", () => {
    const explainer = MAILBOXES_WHAT_HAPPENS_BULLETS.join("\n");
    expect(explainer).toMatch(/No email is sent/i);
  });

  it("explainer states replies are read back from connected mailboxes", () => {
    const explainer = MAILBOXES_WHAT_HAPPENS_BULLETS.join("\n");
    expect(explainer).toMatch(/read replies/i);
  });
});

/**
 * Queue item 27, defect (6) — "the Mailboxes screen buries the mailboxes".
 *
 * Measured in Chrome on the live site 2026-08-26: before reaching the list of
 * mailboxes you scrolled past a "what happens when you connect" explainer, a
 * Microsoft admin-approval card carrying a raw OAuth consent URL, a full
 * SPF/DKIM/DMARC block, and a send-a-test-email form. Four screens of
 * documentation ahead of the thing the page is named after.
 *
 * The content stays — it is some of the best writing in the app. Only the order
 * changes. These assertions are on source order because the suite is
 * `environment: "node"` with no DOM renderer; `e2e/mailboxes-table-first.spec.ts`
 * is what proves it actually reaches the browser that way.
 */
describe("Mailboxes page puts the mailboxes first (queue item 27, defect 6)", () => {
  const pageSrc = readFileSync(PAGE_PATH, "utf8");
  const panelSrc = readFileSync(PANEL_PATH, "utf8");

  /** Every help/setup block that used to sit above the table. */
  const HELP_BLOCKS = [
    "MAILBOXES_WHAT_HAPPENS_BULLETS.map",
    "<MicrosoftAdminConsentHelp",
    "<ClientDeliverabilityHelp",
    "<InternalProofSendCard",
  ] as const;

  it("renders the mailbox table before every help and setup block", () => {
    const tableAt = pageSrc.indexOf("<ClientMailboxIdentitiesPanel");
    expect(tableAt).toBeGreaterThan(-1);

    for (const block of HELP_BLOCKS) {
      const helpAt = pageSrc.indexOf(block);
      expect(helpAt, `${block} is not on the page any more`).toBeGreaterThan(-1);
      expect(helpAt, `${block} still renders above the mailbox table`).toBeGreaterThan(
        tableAt,
      );
    }
  });

  it("keeps the help behind one closed disclosure, not four open cards", () => {
    const detailsAt = pageSrc.indexOf("Setup, deliverability and test sends");
    expect(detailsAt).toBeGreaterThan(-1);
    // Everything that was above the table is now inside that disclosure.
    for (const block of HELP_BLOCKS) {
      expect(pageSrc.indexOf(block)).toBeGreaterThan(detailsAt);
    }
    // `<details open>` would defeat the point — it renders expanded.
    expect(pageSrc).not.toMatch(/<details[^>]*\sopen[\s>]/);
  });

  it("prints repeated signature advice once above the table, not on every row", () => {
    // The defect was `{opState.recommendedAction}` inside the row map: six
    // fixed templates, so mailboxes in the same state printed the same ~50-word
    // paragraph once each. See src/lib/mailboxes/signature-row-guidance.ts.
    expect(panelSrc).not.toContain("{opState.recommendedAction}");
    expect(panelSrc).toContain("planSignatureRowGuidance");
    expect(panelSrc).toContain("signatureGuidance.perRow");
    expect(panelSrc).toContain("signatureGuidance.shared");
  });
});
