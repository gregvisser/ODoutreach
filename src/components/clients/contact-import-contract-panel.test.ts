import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

import { ContactImportContractPanel } from "./contact-import-contract-panel";

describe("ContactImportContractPanel — staff-visible headings only in chip row", () => {
  it("renders exactly the twelve Greg labels in the accepted-heading chips", () => {
    const html = renderToStaticMarkup(createElement(ContactImportContractPanel));
    const start = html.indexOf("Accepted headings");
    expect(start).toBeGreaterThanOrEqual(0);
    const ulStart = html.indexOf("<ul", start);
    const ulEnd = html.indexOf("</ul>", ulStart);
    expect(ulStart).toBeGreaterThanOrEqual(0);
    expect(ulEnd).toBeGreaterThanOrEqual(0);
    const chipSection = html.slice(ulStart, ulEnd);

    const chipLabels = [...chipSection.matchAll(/<li[^>]*>([^<]+)<\/li>/g)].map(
      (m) => m[1],
    );
    expect(chipLabels).toEqual([...STAFF_VISIBLE_CONTACT_IMPORT_HEADERS]);
  });
});
