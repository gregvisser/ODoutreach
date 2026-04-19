import { describe, expect, it } from "vitest";

import { formatSuppressionSyncUserError } from "./suppression-sync-errors";

describe("formatSuppressionSyncUserError", () => {
  const sa = "reader@p.iam.gserviceaccount.com";

  it("maps permission errors to share instruction", () => {
    const r = formatSuppressionSyncUserError("PERMISSION_DENIED: The caller does not have permission", sa);
    expect(r).toContain(sa);
    expect(r.toLowerCase()).toContain("viewer");
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
