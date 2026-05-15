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
