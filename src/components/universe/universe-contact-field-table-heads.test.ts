import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Table, TableHeader, TableRow } from "@/components/ui/table";
import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

import { UniverseContactFieldTableHeads } from "./universe-contact-field-table-heads";

describe("UniverseContactFieldTableHeads", () => {
  it("renders the twelve staff contract column labels in order", () => {
    const html = renderToStaticMarkup(
      createElement(
        Table,
        null,
        createElement(
          TableHeader,
          null,
          createElement(TableRow, null, createElement(UniverseContactFieldTableHeads)),
        ),
      ),
    );
    const texts = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(texts).toEqual([...STAFF_VISIBLE_CONTACT_IMPORT_HEADERS]);
  });
});
