import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `src/` — test file lives in `src/server/contacts/`. */
const srcRoot = join(__dirname, "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), "utf8");
}

describe("Universe contact model (source invariants)", () => {
  it("lists individual ContactUniverse rows, not imported list batches", () => {
    const q = readSrc("server/queries/contact-universe-list.ts");
    expect(q).toContain("prisma.contactUniverse.findMany");
    expect(q).not.toContain("contactList.findMany");
  });

  it("upserts ContactUniverse from CSV import", () => {
    const imp = readSrc("server/contacts/import-csv.ts");
    expect(imp).toContain("upsertContactUniverseAndRecordSource");
  });

  it("upserts ContactUniverse from RocketReach import", () => {
    const rr = readSrc("server/integrations/rocketreach/person-import.ts");
    expect(rr).toContain("upsertContactUniverseAndRecordSource");
  });

  it("materializes client lists from Universe picks without deleting Universe rows", () => {
    const u2l = readSrc("server/contacts/universe-to-client-list.ts");
    expect(u2l).toContain("contactUniverse.findUnique");
    expect(u2l).toContain("findOrCreateClientContactListByName");
    expect(u2l).not.toContain("contactUniverse.delete");
  });

  it("does not delete ContactUniverse from list delete/archive helpers", () => {
    const lists = readSrc("server/contacts/contact-lists.ts");
    expect(lists).not.toContain("contactUniverse.delete");
  });
});
