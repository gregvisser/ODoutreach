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
    expect(universeHeadsSource).toContain("UNIVERSE_CONTACT_FIELD_COLUMNS");
  });

  it("shows client display name in the workspace selector trigger", () => {
    expect(clientSource).toContain("formatClientWorkspaceSelectLabel");
    expect(clientSource).toContain("{formatClientWorkspaceSelectLabel(clients, clientId)}");
  });

  // PR #138 — visible-column controls and richer sort options.
  it("renders the column-visibility controls panel", () => {
    expect(clientSource).toContain("UniverseColumnControls");
    expect(clientSource).toContain("visibleKeys={visibleKeys}");
  });

  it("offers sort by Name, Country, and City (PR #138)", () => {
    expect(clientSource).toContain('<option value="name">');
    expect(clientSource).toContain('<option value="country">');
    expect(clientSource).toContain('<option value="city">');
  });

  it("preserves the cols param through filter applies", () => {
    expect(clientSource).toContain('sp?.get("cols")');
  });
});
