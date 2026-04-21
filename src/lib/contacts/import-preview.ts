/**
 * PR G — pure preview model for CSV contact imports.
 *
 * The importer (`src/server/contacts/import-csv.ts`) runs parse → validate →
 * dedupe → write in one pass. Operators have no way to see what a file will
 * do before rows land in the database. PR G splits that: callers parse the
 * CSV and load the read-only inputs (existing contacts + suppression
 * decisions), then this helper returns a structured preview — row-by-row
 * classification plus aggregate counts — that the UI renders and the
 * confirm-import action re-derives right before writing.
 *
 * Rules (must match `import-csv.ts` so the preview never disagrees with the
 * eventual write):
 *
 *   - A row is *mapped* if `mapContactRow` produced at least one non-empty
 *     canonical field.
 *   - A row is *email-sendable* when it has an email that parses as a valid
 *     format AND is not suppressed.
 *   - A row is *valid, no email* when it has no email but does have at least
 *     one other outreach identifier (LinkedIn / mobile / office) — preview
 *     captures this even though the current importer still requires email
 *     for persistence (see `EMAIL_REQUIRED_FOR_PERSISTENCE`). The preview
 *     will mark such rows as `skipped` with a clear reason so operators see
 *     them in the roll-up without being surprised by the writer later.
 *   - A row is *missing identifier* when it has no email, LinkedIn, mobile,
 *     or office phone at all.
 *   - *Duplicate* (within-file or matches existing client contact) keys on
 *     the normalized email only. Without an email we cannot dedupe, so
 *     no-email rows are never treated as duplicates.
 *   - Per PR D2: every import must attach to a named list. An existing
 *     contact routed back through import becomes an `attachOnly` row
 *     (idempotent list attachment, no contact mutation).
 *
 * This helper is intentionally synchronous and Prisma-free so it runs in
 * unit tests and can be invoked from both the preview server action and the
 * confirm-import server action.
 */

import {
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import {
  mapContactRow,
  type MappedContactRow,
} from "@/lib/contact-import-contract";

/** Raw row as papaparse returns it (header → cell). */
export type RawCsvRow = Record<string, string | null | undefined>;

/** Read-only existing-contact projection needed for dedupe. */
export type ExistingContactProjection = {
  id: string;
  email: string | null;
};

/**
 * Pre-evaluated suppression decision for a normalized email. The preview
 * helper never calls the DB itself; the server action evaluates each
 * distinct email once and passes the map here.
 */
export type SuppressionLookup = Map<string, { suppressed: boolean; reason?: string }>;

export type ImportPreviewInput = {
  rows: RawCsvRow[];
  existingContacts: readonly ExistingContactProjection[];
  suppression: SuppressionLookup;
  listTarget: {
    /** Display name for the list the operator picked or typed. */
    name: string;
    /** `existing` means routing to an existing client-scoped list; `new` means one will be created on confirm. */
    kind: "existing" | "new";
  };
};

export type ImportPreviewRowStatus =
  | "create"
  | "update"
  | "attachOnly"
  | "skipped";

export type ImportPreviewRowReadiness =
  | "email_sendable"
  | "valid_no_email"
  | "suppressed"
  | "missing_identifier";

export type ImportPreviewRow = {
  /**
   * 1-based row number in the spreadsheet (header is row 1, so first data
   * row is 2). Matches the existing importer's error messages.
   */
  rowNumber: number;
  displayName: string;
  company: string;
  /** Normalized (lowercased/trimmed) email, or null when absent/unparseable. */
  email: string | null;
  linkedIn: string;
  mobilePhone: string;
  officePhone: string;
  status: ImportPreviewRowStatus;
  readiness: ImportPreviewRowReadiness;
  /** Short human-readable reason for the status/readiness combo. */
  reason: string;
};

export type ImportPreviewSummary = {
  totalRows: number;
  mappedRows: number;
  validRows: number;
  emailSendableRows: number;
  validNoEmailRows: number;
  missingIdentifierRows: number;
  suppressedRows: number;
  duplicateRows: number;
  createRows: number;
  updateRows: number;
  attachRows: number;
  skippedRows: number;
};

export type ImportPreviewResult = {
  summary: ImportPreviewSummary;
  rows: ImportPreviewRow[];
  listTarget: ImportPreviewInput["listTarget"];
};

function cell(mapped: MappedContactRow, field: keyof MappedContactRow): string {
  const value = mapped[field];
  return typeof value === "string" ? value.trim() : "";
}

function computeDisplayName(mapped: MappedContactRow): string {
  const full = cell(mapped, "fullName");
  if (full) return full;
  const first = cell(mapped, "firstName");
  const last = cell(mapped, "lastName");
  const joined = [first, last].filter((s) => s.length > 0).join(" ");
  return joined;
}

/**
 * Build a preview of a CSV import without writing anything. Pure; side-effect
 * free. Counts derived from the per-row classification so the roll-up and
 * the table always agree.
 */
export function buildCsvImportPreview(
  input: ImportPreviewInput,
): ImportPreviewResult {
  const rows: ImportPreviewRow[] = [];

  const existingIdByEmail = new Map<string, string>();
  for (const ec of input.existingContacts) {
    if (ec.email && ec.email.length > 0) {
      existingIdByEmail.set(normalizeEmail(ec.email), ec.id);
    }
  }

  const seenInFile = new Set<string>();

  let mappedRows = 0;
  let emailSendableRows = 0;
  let validNoEmailRows = 0;
  let missingIdentifierRows = 0;
  let suppressedRows = 0;
  let duplicateRows = 0;
  let createRows = 0;
  // PR G: `updateRows` is reserved for a future email-optional persistence
  // follow-up where an existing contact could be mutated with newly
  // supplied identifiers. Today every existing-contact row becomes
  // `attachOnly` (idempotent list membership only, no mutation), so this
  // stays at 0.
  const updateRows = 0;
  let attachRows = 0;
  let skippedRows = 0;

  for (let i = 0; i < input.rows.length; i += 1) {
    const raw = input.rows[i]!;
    const rowNumber = i + 2;

    const mapped = mapContactRow(raw);
    const emailRaw = cell(mapped, "email");
    const linkedIn = cell(mapped, "linkedIn");
    const mobilePhone = cell(mapped, "mobilePhone");
    const officePhone = cell(mapped, "officePhone");
    const company = cell(mapped, "company");

    const anyField =
      emailRaw !== "" ||
      linkedIn !== "" ||
      mobilePhone !== "" ||
      officePhone !== "" ||
      cell(mapped, "fullName") !== "" ||
      cell(mapped, "firstName") !== "" ||
      cell(mapped, "lastName") !== "" ||
      company !== "" ||
      cell(mapped, "title") !== "";

    if (anyField) mappedRows += 1;

    const normalizedEmail = emailRaw ? normalizeEmail(emailRaw) : "";
    const emailLooksValid =
      normalizedEmail.length > 0 && isValidEmailFormat(normalizedEmail);
    const email = emailLooksValid ? normalizedEmail : null;

    const hasOtherIdentifier =
      linkedIn !== "" || mobilePhone !== "" || officePhone !== "";

    const displayName = computeDisplayName(mapped);

    // Classify by status (create/update/attachOnly/skipped) then readiness.
    let status: ImportPreviewRowStatus;
    let readiness: ImportPreviewRowReadiness;
    let reason: string;

    if (!anyField) {
      status = "skipped";
      readiness = "missing_identifier";
      reason = "Empty row.";
      missingIdentifierRows += 1;
      skippedRows += 1;
    } else if (!email) {
      // No valid email. Could still have identifiers, but the current
      // importer requires email for persistence, so we surface these as
      // "skipped" with a reason that matches the real write behaviour.
      if (hasOtherIdentifier) {
        status = "skipped";
        readiness = "valid_no_email";
        reason =
          "Valid, no email — not email-sendable. Email is required to create a contact today.";
        validNoEmailRows += 1;
      } else {
        status = "skipped";
        readiness = "missing_identifier";
        reason =
          "No email, LinkedIn, mobile, or office phone — row skipped.";
        missingIdentifierRows += 1;
      }
      skippedRows += 1;
    } else {
      // Has a valid email. Now check for within-file duplicates, existing
      // contact match, and suppression.
      const dupInFile = seenInFile.has(email);
      const existingId = existingIdByEmail.get(email) ?? null;
      const sup = input.suppression.get(email);

      if (dupInFile) {
        status = "skipped";
        readiness = sup?.suppressed ? "suppressed" : "email_sendable";
        reason = "Duplicate email earlier in this file — row skipped.";
        duplicateRows += 1;
        skippedRows += 1;
      } else if (existingId) {
        // Existing contact: this is an attach-only operation (no mutation).
        seenInFile.add(email);
        status = "attachOnly";
        if (sup?.suppressed) {
          readiness = "suppressed";
          suppressedRows += 1;
          reason = sup.reason
            ? `Existing contact — attached to list. Suppressed (${sup.reason}).`
            : "Existing contact — attached to list. Suppressed.";
        } else {
          readiness = "email_sendable";
          emailSendableRows += 1;
          reason = `Existing contact — attached to list “${input.listTarget.name}”.`;
        }
        duplicateRows += 1;
        attachRows += 1;
      } else {
        seenInFile.add(email);
        status = "create";
        if (sup?.suppressed) {
          readiness = "suppressed";
          suppressedRows += 1;
          reason = sup.reason
            ? `New contact — will be created, but suppressed (${sup.reason}).`
            : "New contact — will be created, but suppressed.";
        } else {
          readiness = "email_sendable";
          emailSendableRows += 1;
          reason = `New contact — will be created and attached to list “${input.listTarget.name}”.`;
        }
        createRows += 1;
      }
    }

    rows.push({
      rowNumber,
      displayName,
      company,
      email,
      linkedIn,
      mobilePhone,
      officePhone,
      status,
      readiness,
      reason,
    });
  }

  const validRows = emailSendableRows + validNoEmailRows;

  const summary: ImportPreviewSummary = {
    totalRows: input.rows.length,
    mappedRows,
    validRows,
    emailSendableRows,
    validNoEmailRows,
    missingIdentifierRows,
    suppressedRows,
    duplicateRows,
    createRows,
    updateRows,
    attachRows,
    skippedRows,
  };

  return {
    summary,
    rows,
    listTarget: input.listTarget,
  };
}
