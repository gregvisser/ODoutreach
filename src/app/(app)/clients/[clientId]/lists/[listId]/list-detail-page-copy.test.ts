import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Row 152 (raised by row 135/cycle195 finding 3): a contact list's own
// detail page (`/clients/[clientId]/lists/[listId]`) rendered ten summary
// counts and a contact table with no button beyond a breadcrumb link. It
// never told an operator the page was read-only (unlike the Contacts tab
// one level up, which says so explicitly), and had no forward path to
// building a sequence with the list — reproducing row 146's gap on the
// list's own permanent home screen, not just a one-time success message.

const listDetailPagePath = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/lists/[listId]/page.tsx",
);

describe("Client list-detail page copy (row 152)", () => {
  it("states plainly that this page is read-only", () => {
    const src = readFileSync(listDetailPagePath, "utf8");
    expect(src).toMatch(/read-only/i);
  });

  it("renders a 'Build a sequence with this list' link to the client's Outreach tab", () => {
    const src = readFileSync(listDetailPagePath, "utf8");
    // Reuses the same href/label helpers row 146 built for the Universe
    // success message, so the two forward paths cannot drift apart.
    expect(src).toContain("universeListSequenceCtaHref");
    expect(src).toContain("universeListSequenceCtaLabel");
  });
});
