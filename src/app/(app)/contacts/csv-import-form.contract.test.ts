import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CsvImportForm — staff heading copy", () => {
  it("uses the shared staff-visible contract for heading chips", () => {
    const path = join(process.cwd(), "src/app/(app)/contacts/csv-import-form.tsx");
    const src = readFileSync(path, "utf8");
    expect(src).toContain("STAFF_VISIBLE_CONTACT_IMPORT_HEADERS.map");
    expect(src).not.toContain("Name, Employer, Title,");
    expect(src).not.toContain("Mobile Phone Number");
    expect(src).not.toContain(">LinkedIn<");
    expect(src).not.toContain("exact labels");
    expect(src).not.toContain("parser");
    expect(src).not.toMatch(/Legacy column names still map/i);
  });
});
