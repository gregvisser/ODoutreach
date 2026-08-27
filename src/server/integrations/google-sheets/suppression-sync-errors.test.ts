import { describe, expect, it } from "vitest";

import {
  formatSuppressionSyncUserError,
  isRangeInvalidMessage,
  withSheetTabNames,
} from "./suppression-sync-errors";

describe("formatSuppressionSyncUserError", () => {
  const sa = "reader@p.iam.gserviceaccount.com";

  it("maps permission errors to share instruction", () => {
    const r = formatSuppressionSyncUserError("PERMISSION_DENIED: The caller does not have permission", sa);
    expect(r).toContain(sa);
    expect(r.toLowerCase()).toContain("viewer");
    expect(r.toLowerCase()).toContain("sync again");
  });

  it("uses generic share text when service account email is null", () => {
    const r = formatSuppressionSyncUserError("403 Forbidden", null);
    expect(r).toContain("service account");
  });

  it("maps not found to spreadsheet hint", () => {
    const r = formatSuppressionSyncUserError("Requested entity was not found.", sa);
    expect(r.toLowerCase()).toContain("sheet");
  });

  it("maps range parse errors", () => {
    const r = formatSuppressionSyncUserError("Unable to parse range: Sheet99!A1", sa);
    expect(r.toLowerCase()).toContain("tab");
  });

  it("passes through short unknown messages", () => {
    const r = formatSuppressionSyncUserError("Short error.");
    expect(r).toBe("Short error.");
  });
});

/**
 * Live on 2026-08-26 two do-not-contact sheets — Train Hugger and Pareto FM,
 * both whole-domain lists — had been failing every 15 minutes with nothing but
 * "Check the Sheet tab name and range (e.g. Sheet1!A:Z)". That sentence names
 * neither the range we actually tried nor the tabs the Sheet actually has, so
 * it cannot be acted on without opening the Sheet and guessing.
 *
 * Both facts are already in our hands: the range comes off the source row and
 * the tab titles are one `spreadsheets.get` away on a Sheet we can plainly
 * read (a sharing problem answers 403, not a parse error). So the message says
 * them.
 */
describe("withSheetTabNames — say which range we tried and which tabs exist", () => {
  const base = formatSuppressionSyncUserError("Unable to parse range: Sheet1!A1:Z50000");

  it("names the attempted range and the real tabs", () => {
    const r = withSheetTabNames(base, "Sheet1!A1:Z50000", ["Do Not Contact", "Notes"]);
    expect(r).toContain("Sheet1!A1:Z50000");
    expect(r).toContain('"Do Not Contact"');
    expect(r).toContain('"Notes"');
    // The original instruction must survive — this appends, never replaces.
    expect(r).toContain("Check the Sheet tab name and range");
  });

  it("returns the message unchanged when no tab titles could be read", () => {
    expect(withSheetTabNames(base, "Sheet1!A1:Z50000", [])).toBe(base);
  });

  it("never lets a long tab list crowd out the instruction", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Tab number ${i}`);
    const r = withSheetTabNames(base, "Sheet1!A1:Z", many);
    expect(r).toContain("Check the Sheet tab name and range");
    expect(r.length).toBeLessThanOrEqual(2000);
  });

  it("only claims a range problem for a range problem", () => {
    expect(isRangeInvalidMessage(base)).toBe(true);
    expect(
      isRangeInvalidMessage(formatSuppressionSyncUserError("403 Forbidden", null)),
    ).toBe(false);
  });
});
