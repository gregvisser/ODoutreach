import { describe, expect, it } from "vitest";

import {
  CLIENT_ACCOUNT_GRADES,
  clientAccountGradeLabel,
  formatAccountGradeAttribution,
  formatAttributionTimestamp,
  isCorporateGrade,
  parseClientAccountGrade,
} from "./client-account-grade";

describe("client account grade", () => {
  it("offers exactly the three tiers the owner asked for", () => {
    expect(CLIENT_ACCOUNT_GRADES).toEqual(["CORPORATE", "MID", "STANDARD"]);
  });

  it("never renders a raw enum to staff", () => {
    for (const grade of CLIENT_ACCOUNT_GRADES) {
      const label = clientAccountGradeLabel(grade);
      expect(label).not.toBe(grade);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
    expect(clientAccountGradeLabel(null)).toBe("Not set");
  });

  it("treats only CORPORATE as corporate", () => {
    expect(isCorporateGrade("CORPORATE")).toBe(true);
    expect(isCorporateGrade("MID")).toBe(false);
    expect(isCorporateGrade("STANDARD")).toBe(false);
    expect(isCorporateGrade(null)).toBe(false);
    expect(isCorporateGrade(undefined)).toBe(false);
  });

  it("refuses anything that is not one of the three grades", () => {
    expect(parseClientAccountGrade("CORPORATE")).toBe("CORPORATE");
    expect(parseClientAccountGrade("  corporate  ")).toBe("CORPORATE");
    expect(parseClientAccountGrade("VIP")).toBeNull();
    expect(parseClientAccountGrade("")).toBeNull();
    expect(parseClientAccountGrade(null)).toBeNull();
    expect(parseClientAccountGrade(undefined)).toBeNull();
    expect(parseClientAccountGrade("DROP TABLE")).toBeNull();
  });

  describe("the on-screen signature", () => {
    it("reads the way the owner asked for it", () => {
      expect(
        formatAccountGradeAttribution({
          grade: "CORPORATE",
          setByName: "Sophie",
          setAt: new Date("2026-08-28T14:02:00.000Z"),
        }),
      ).toBe("Set to Corporate (VIP) by Sophie, 28 Aug 14:02");
    });

    it("says nothing at all when nobody has graded the account", () => {
      expect(
        formatAccountGradeAttribution({ grade: null, setByName: null, setAt: null }),
      ).toBeNull();
      expect(
        formatAccountGradeAttribution({
          grade: "MID",
          setByName: "Sophie",
          setAt: null,
        }),
      ).toBeNull();
    });

    it("keeps the fact of the decision when the staff user has been deleted", () => {
      // The FK is ON DELETE SET NULL, so the name can vanish while the
      // timestamp survives. Dropping the whole line would hide that a human
      // made the call.
      expect(
        formatAccountGradeAttribution({
          grade: "CORPORATE",
          setByName: null,
          setAt: new Date("2026-08-28T09:05:00.000Z"),
        }),
      ).toBe("Set to Corporate (VIP) by a former member of staff, 28 Aug 09:05");
    });

    it("formats from UTC parts so server and client markup agree", () => {
      // Midnight UTC is the case that breaks locale formatting: in any negative
      // offset it renders as the PREVIOUS day, which is a hydration mismatch.
      expect(formatAttributionTimestamp(new Date("2026-08-28T00:00:00.000Z"))).toBe(
        "28 Aug 00:00",
      );
      expect(formatAttributionTimestamp(new Date("2026-01-01T23:59:00.000Z"))).toBe(
        "1 Jan 23:59",
      );
    });
  });
});
