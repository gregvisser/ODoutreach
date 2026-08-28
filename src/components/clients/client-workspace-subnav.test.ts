import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #138 — Client workspace subnav decision lock.
 *
 *  - The "Contacts" subnav label is renamed to **Lists** because the tab
 *    shows list KPIs/readiness for the client (Sources is where contacts
 *    are imported, which is the action staff actually want from "Contacts").
 *  - The href stays at `/clients/[id]/contacts` so existing in-app links
 *    and bookmarks keep working — only the visible label changes.
 *  - The subnav considers `/clients/[id]/lists/[listId]` active under the
 *    Lists tab so the list-detail page highlights correctly.
 */

const subnavPath = join(
  process.cwd(),
  "src/components/clients/client-workspace-subnav.tsx",
);
const subnavSource = readFileSync(subnavPath, "utf8");

describe("Client workspace subnav (PR #138)", () => {
  it("renames the Contacts tab to Lists", () => {
    expect(subnavSource).toContain('label: "Lists"');
    expect(subnavSource).not.toMatch(/label:\s*"Contacts"/);
  });

  it("keeps the href stable at /clients/[id]/contacts", () => {
    expect(subnavSource).toContain('href: `${base}/contacts`');
  });

  it("treats /clients/[id]/lists/[listId] as part of the Lists tab", () => {
    expect(subnavSource).toContain("pathname.startsWith(`${base}/lists/`)");
  });
});

/**
 * Owner request A (2026-08-28) — the Microsoft admin-consent and SPF/DKIM/DMARC
 * instructions must be reachable from EVERY client account, whatever state its
 * mailboxes are in. A tab is the only placement that survives a client with no
 * mailbox connected, because everything on the Mailboxes tab was conditional on
 * having one. This test is the lock: the tab is not allowed to quietly move
 * back inside the Mailboxes page.
 */
describe("Client workspace subnav — Setup help tab", () => {
  it("offers a Setup help tab on every client workspace", () => {
    expect(subnavSource).toContain('label: "Setup help"');
    expect(subnavSource).toContain("href: `${base}/setup-help`");
  });

  it("has a matching route file, so the tab cannot lead to a 404", () => {
    const routePath = join(
      process.cwd(),
      "src/app/(app)/clients/[clientId]/setup-help/page.tsx",
    );
    expect(() => readFileSync(routePath, "utf8")).not.toThrow();
  });
});
