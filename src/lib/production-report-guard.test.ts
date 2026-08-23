import { describe, expect, it } from "vitest";

// Imports the REAL guard from the script, not a copy, so the two cannot drift.
import {
  assertReadOnly,
  QUERIES,
  rampCap,
} from "../../scripts/production-report.mjs";

/**
 * scripts/production-report.mjs is pointed at a LIVE CLIENT DATABASE by a
 * non-technical operator. "It only reads" has to be enforced, not promised.
 */
describe("the production report refuses anything that is not a plain SELECT", () => {
  it("allows an ordinary SELECT", () => {
    expect(() => assertReadOnly('SELECT count(*) FROM "OutboundEmail"', "ok")).not.toThrow();
  });

  it("allows leading comments and a trailing semicolon", () => {
    expect(() =>
      assertReadOnly('-- counts sends\nSELECT count(*) FROM "OutboundEmail";', "ok"),
    ).not.toThrow();
  });

  it.each([
    ['DELETE FROM "Contact"'],
    ["UPDATE \"Client\" SET name = 'x'"],
    ['INSERT INTO "Contact" (id) VALUES (\'x\')'],
    ['DROP TABLE "OutboundEmail"'],
    ['TRUNCATE "SuppressedEmail"'],
    ['ALTER TABLE "Client" ADD COLUMN x TEXT'],
    ['GRANT ALL ON "Client" TO public'],
    ["SET ROLE postgres"],
  ])("refuses %s", (sql) => {
    expect(() => assertReadOnly(sql, "bad")).toThrow(/REFUSED/);
  });

  it("refuses a second statement smuggled in after a semicolon", () => {
    expect(() => assertReadOnly('SELECT 1; DROP TABLE "Contact"', "smuggled")).toThrow(
      /more than one statement/,
    );
  });

  it("refuses a writing CTE inside an otherwise-valid SELECT", () => {
    expect(() =>
      assertReadOnly('SELECT * FROM (DELETE FROM "Contact" RETURNING *) x', "cte"),
    ).toThrow(/write or DDL keyword/);
  });

  it("every query the script actually ships passes its own guard", () => {
    for (const [name, sql] of Object.entries(QUERIES)) {
      expect(() => assertReadOnly(sql as string, name)).not.toThrow();
    }
  });
});

describe("the report's warm-up maths matches the application's", () => {
  it("mirrors mailbox-warmup.ts — 5, +5 every 5 sending days, ceilinged", () => {
    expect(rampCap(30, 0)).toBe(5);
    expect(rampCap(30, 4)).toBe(5);
    expect(rampCap(30, 5)).toBe(10);
    expect(rampCap(30, 25)).toBe(30);
    expect(rampCap(30, 999)).toBe(30);
    expect(rampCap(12, 999)).toBe(12);
  });
});
