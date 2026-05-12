import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");
const clientSource = readFileSync(
  join(__dirname, "../../../components/universe/universe-page-client.tsx"),
  "utf8",
);
const universeHeadsSource = readFileSync(
  join(__dirname, "../../../components/universe/universe-contact-field-table-heads.tsx"),
  "utf8",
);

describe("Universe page copy (operator)", () => {
  it("avoids developer-style jargon in the server page shell", () => {
    const banned = ["global warehouse", "attribution", "materializes", "deduplicated"];
    const lower = pageSource.toLowerCase();
    for (const w of banned) {
      expect(lower).not.toContain(w);
    }
    expect(pageSource).toContain("All imported contacts are stored here for reuse");
  });

  it("renders contact table heads from the shared twelve-label contract", () => {
    expect(clientSource).toContain("UniverseContactFieldTableHeads");
    expect(clientSource).not.toMatch(/<TableHead>Name<\/TableHead>/);
    expect(universeHeadsSource).toContain("STAFF_VISIBLE_CONTACT_IMPORT_HEADERS");
  });
});
