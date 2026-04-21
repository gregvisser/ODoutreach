import { describe, expect, it } from "vitest";

import {
  buildCsvImportPreview,
  type ExistingContactProjection,
  type ImportPreviewInput,
  type SuppressionLookup,
} from "./import-preview";

function baseInput(
  overrides: Partial<ImportPreviewInput> = {},
): ImportPreviewInput {
  return {
    rows: [],
    existingContacts: [],
    suppression: new Map(),
    listTarget: { name: "April prospects", kind: "new" },
    ...overrides,
  };
}

describe("buildCsvImportPreview", () => {
  it("classifies a clean email row as create / email_sendable", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            Name: "Alice Example",
            Employer: "Example Ltd",
            "A Emails": "alice@example.com",
          },
        ],
      }),
    );
    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.mappedRows).toBe(1);
    expect(preview.summary.createRows).toBe(1);
    expect(preview.summary.emailSendableRows).toBe(1);
    expect(preview.summary.skippedRows).toBe(0);
    expect(preview.summary.validRows).toBe(1);
    const row = preview.rows[0]!;
    expect(row.status).toBe("create");
    expect(row.readiness).toBe("email_sendable");
    expect(row.email).toBe("alice@example.com");
    expect(row.displayName).toBe("Alice Example");
    expect(row.company).toBe("Example Ltd");
    expect(row.reason).toMatch(/April prospects/);
  });

  it("classifies a LinkedIn-only row as skipped / valid_no_email", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            "First Name": "Bob",
            "Last Name": "Noemail",
            LinkedIn: "https://linkedin.com/in/bob",
          },
        ],
      }),
    );
    expect(preview.summary.validNoEmailRows).toBe(1);
    expect(preview.summary.skippedRows).toBe(1);
    expect(preview.summary.createRows).toBe(0);
    expect(preview.summary.validRows).toBe(1);
    const row = preview.rows[0]!;
    expect(row.status).toBe("skipped");
    expect(row.readiness).toBe("valid_no_email");
    expect(row.email).toBeNull();
    expect(row.linkedIn).toContain("linkedin.com/in/bob");
    expect(row.reason).toMatch(/email-sendable|Email is required/i);
  });

  it("classifies a row with no identifiers as skipped / missing_identifier", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            Name: "Nobody",
            Employer: "Ghost Co",
          },
        ],
      }),
    );
    expect(preview.summary.missingIdentifierRows).toBe(1);
    expect(preview.summary.skippedRows).toBe(1);
    expect(preview.summary.createRows).toBe(0);
    expect(preview.summary.validRows).toBe(0);
    const row = preview.rows[0]!;
    expect(row.status).toBe("skipped");
    expect(row.readiness).toBe("missing_identifier");
    expect(row.reason).toMatch(/No email, LinkedIn/);
  });

  it("classifies a row matching an existing contact as attachOnly / duplicate", () => {
    const existing: ExistingContactProjection[] = [
      { id: "c1", email: "alice@example.com" },
    ];
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            "A Emails": "ALICE@example.com",
            Name: "Alice Example",
          },
        ],
        existingContacts: existing,
      }),
    );
    expect(preview.summary.createRows).toBe(0);
    expect(preview.summary.attachRows).toBe(1);
    expect(preview.summary.duplicateRows).toBe(1);
    expect(preview.summary.emailSendableRows).toBe(1);
    const row = preview.rows[0]!;
    expect(row.status).toBe("attachOnly");
    expect(row.readiness).toBe("email_sendable");
    expect(row.email).toBe("alice@example.com");
    expect(row.reason).toMatch(/attached to list/);
  });

  it("classifies a suppressed email row as suppressed (new contact path)", () => {
    const suppression: SuppressionLookup = new Map([
      ["banned@example.com", { suppressed: true, reason: "domain_list" }],
    ]);
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            "A Emails": "banned@example.com",
            Name: "Blocked Person",
          },
        ],
        suppression,
      }),
    );
    expect(preview.summary.suppressedRows).toBe(1);
    expect(preview.summary.createRows).toBe(1);
    expect(preview.summary.emailSendableRows).toBe(0);
    const row = preview.rows[0]!;
    expect(row.status).toBe("create");
    expect(row.readiness).toBe("suppressed");
    expect(row.reason).toMatch(/suppressed/i);
  });

  it("marks the second occurrence of the same email in-file as skipped / duplicate", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          { "A Emails": "dup@example.com" },
          { "A Emails": "DUP@example.com" },
        ],
      }),
    );
    expect(preview.summary.createRows).toBe(1);
    expect(preview.summary.duplicateRows).toBe(1);
    expect(preview.summary.skippedRows).toBe(1);
    expect(preview.rows[0]!.status).toBe("create");
    expect(preview.rows[1]!.status).toBe("skipped");
    expect(preview.rows[1]!.reason).toMatch(/Duplicate email/);
  });

  it("maps heading aliases (Email, full_name, Mobile, Office Phone)", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            Email: "carol@example.com",
            full_name: "Carol Example",
            Mobile: "07777000000",
            "Office Phone": "01234 000000",
            Company: "Widget Co",
          },
        ],
      }),
    );
    const row = preview.rows[0]!;
    expect(row.email).toBe("carol@example.com");
    expect(row.displayName).toBe("Carol Example");
    expect(row.mobilePhone).toBe("07777000000");
    expect(row.officePhone).toBe("01234 000000");
    expect(row.company).toBe("Widget Co");
    expect(row.status).toBe("create");
    expect(row.readiness).toBe("email_sendable");
  });

  it("marks a malformed email as skipped without treating it as a valid no-email row", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          {
            "A Emails": "not-an-email",
            Name: "Junk",
            LinkedIn: "https://linkedin.com/in/junk",
          },
        ],
      }),
    );
    expect(preview.summary.skippedRows).toBe(1);
    expect(preview.summary.validNoEmailRows).toBe(1);
    // Malformed email falls back to "no email"; LinkedIn present ⇒ valid_no_email.
    const row = preview.rows[0]!;
    expect(row.email).toBeNull();
    expect(row.readiness).toBe("valid_no_email");
  });

  it("summary counts reconcile to totalRows across non-overlapping buckets", () => {
    const preview = buildCsvImportPreview(
      baseInput({
        rows: [
          { "A Emails": "a@example.com" },
          { "A Emails": "a@example.com" },
          { LinkedIn: "https://linkedin.com/in/x" },
          { Name: "blank" },
        ],
      }),
    );
    const { summary } = preview;
    expect(summary.totalRows).toBe(4);
    // createRows + attachRows + skippedRows === totalRows (no updateRows today).
    expect(
      summary.createRows + summary.attachRows + summary.skippedRows,
    ).toBe(summary.totalRows);
  });
});
