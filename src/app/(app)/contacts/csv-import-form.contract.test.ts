import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CsvImportForm — staff heading copy", () => {
  it("uses the shared staff-visible contract instead of hardcoded legacy headings", () => {
    const path = join(process.cwd(), "src/app/(app)/contacts/csv-import-form.tsx");
    const src = readFileSync(path, "utf8");
    expect(src).toContain("STAFF_VISIBLE_CONTACT_IMPORT_HEADERS.join");
    expect(src).not.toContain("Name, Employer, Title,");
    expect(src).not.toContain("Mobile Phone Number");
    expect(src).not.toContain(">LinkedIn<");
  });
});
