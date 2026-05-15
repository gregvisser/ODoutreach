import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Table, TableHeader, TableRow } from "@/components/ui/table";
import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

import { UniverseContactFieldTableHeads } from "./universe-contact-field-table-heads";

function renderHeads(props?: Parameters<typeof UniverseContactFieldTableHeads>[0]): string[] {
  const html = renderToStaticMarkup(
    createElement(
      Table,
      null,
      createElement(
        TableHeader,
        null,
        createElement(TableRow, null, createElement(UniverseContactFieldTableHeads, props ?? {})),
      ),
    ),
  );
  return [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
}

describe("UniverseContactFieldTableHeads", () => {
  it("renders the twelve staff contract column labels in order", () => {
    expect(renderHeads()).toEqual([...STAFF_VISIBLE_CONTACT_IMPORT_HEADERS]);
  });

  // PR #138 — visible-column controls.
  it("filters out hidden columns when visibleKeys is provided", () => {
    const visible = new Set(["name", "employer", "emails"] as const);
    const texts = renderHeads({ visibleKeys: visible });
    expect(texts).toEqual(["Name", "Employer", "A Emails"]);
  });

  it("renders nothing when visibleKeys is the empty set (hide-all)", () => {
    const texts = renderHeads({ visibleKeys: new Set() });
    expect(texts).toEqual([]);
  });
});
