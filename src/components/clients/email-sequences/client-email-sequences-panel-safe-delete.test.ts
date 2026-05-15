import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #140 — UI safe-delete + archived sequence visibility (G5).
 *
 * Pairs with the server-side test in
 * `src/server/email-sequences/delete-or-archive-sequence.test.ts` which
 * already locks in the behaviour:
 *   - Sequences with SENT / FAILED step-send history (or linked
 *     OutboundEmail) cannot be hard-deleted — they are archived instead.
 *   - Contacts, ContactUniverse, ContactList, OutboundEmail, mailboxes
 *     are never removed.
 *
 * This test locks the UI half:
 *   - The destructive button does not say "Delete sequence" outright.
 *   - The confirm copy spells out that sequences with send history are
 *     archived for audit instead of being deleted.
 *   - An "Archived sequences" disclosure renders archived sequences so
 *     staff can intentionally review them.
 *   - "Restore to draft" is wired to `returnClientEmailSequenceToDraftAction`.
 */

const PANEL_PATH = join(
  process.cwd(),
  "src/components/clients/email-sequences/client-email-sequences-panel.tsx",
);
const PANEL_SOURCE = readFileSync(PANEL_PATH, "utf8");

describe("Sequences panel safe-delete UI (PR #140)", () => {
  it("uses the safer 'Delete or archive sequence' label", () => {
    expect(PANEL_SOURCE).toContain("Delete or archive sequence");
    expect(PANEL_SOURCE).not.toMatch(/>\s*Delete sequence\s*</);
  });

  it("explains in the inline hint that send history is kept for audit", () => {
    expect(PANEL_SOURCE).toMatch(
      /sequences with send history are\s+kept for\s+audit/,
    );
    expect(PANEL_SOURCE).toMatch(
      /Delete only removes draft sequences that have never\s+sent/,
    );
    expect(PANEL_SOURCE).toContain(
      "Contacts, lists, and mailboxes are never removed",
    );
  });

  it("uses the audit-aware confirm copy on the destructive form", () => {
    expect(PANEL_SOURCE).toContain(
      "Delete or archive this sequence? If it has send history it will be archived (kept for audit). Contacts and lists will stay available.",
    );
  });

  it("renders an Archived sequences disclosure section", () => {
    expect(PANEL_SOURCE).toContain("Archived sequences");
    expect(PANEL_SOURCE).toContain("Kept for audit");
    expect(PANEL_SOURCE).toContain("archivedSequences");
  });

  it("does not silently hide archived sequences any more", () => {
    expect(PANEL_SOURCE).not.toContain("archived sequence hidden");
    expect(PANEL_SOURCE).not.toContain("archived sequences hidden");
    expect(PANEL_SOURCE).not.toContain("hidden from\n            this table");
    expect(PANEL_SOURCE).toContain("available below");
  });

  it("wires Restore to draft to the existing return-to-draft action", () => {
    expect(PANEL_SOURCE).toContain("returnClientEmailSequenceToDraftAction");
    expect(PANEL_SOURCE).toContain("Restore to draft");
  });

  it("never removes contacts/lists/mailboxes copy is visible to staff", () => {
    expect(PANEL_SOURCE).toMatch(
      /Contacts.{0,3}lists.{0,3}and mailboxes are never removed/,
    );
  });
});
