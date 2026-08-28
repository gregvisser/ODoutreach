import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateSellGate,
  gradeRecordSchema,
  openBlockersOwnedByUs,
  SELL_GATE_MINIMUM,
  type GradeRecord,
} from "./grade-record";

/**
 * These run against the REAL `.bidlow/GRADES.json`, not a fixture. A schema
 * that only ever sees hand-made objects would have let the 6.8-vs-4.0
 * contradiction through, because the contradiction was in the file.
 */
const GRADES_PATH = path.join(process.cwd(), ".bidlow", "GRADES.json");

function readRecordedGrades(): unknown {
  return JSON.parse(readFileSync(GRADES_PATH, "utf8"));
}

describe("the recorded grades are a machine-checkable record, not prose", () => {
  it("parses against the schema", () => {
    const parsed = gradeRecordSchema.safeParse(readRecordedGrades());
    expect(
      parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    ).toBeNull();
  });

  it("records the verdict the scores actually imply", () => {
    const record = gradeRecordSchema.parse(readRecordedGrades());
    expect(record.sell_gate.result).toBe(evaluateSellGate(record).result);
  });

  it("never claims a blocker is closed without naming the evidence that closed it", () => {
    const record = gradeRecordSchema.parse(readRecordedGrades());
    const closedWithNothingToCheck = record.customer_ready.blockers
      .filter((b) => b.status === "CLOSED" && (b.evidence ?? "").trim() === "")
      .map((b) => b.id);
    expect(closedWithNothingToCheck).toEqual([]);
  });

  it("is graded against a commit that exists in this repository's history", () => {
    const record = gradeRecordSchema.parse(readRecordedGrades());
    expect(record.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

/**
 * A blocker closed by a commit carries its date in the commit. A blocker closed
 * by something OUTSIDE this repository - CR-05 is a signed Art.28 DPA - has no
 * such date anywhere, so the record has to hold it. The schema is `.strict()`,
 * which meant writing that date down was rejected outright: the four failures
 * above were the whole grade gate refusing a file that had become MORE truthful.
 */
describe("a blocker can record WHEN it was closed", () => {
  const blockerOf = (record: GradeRecord, id: string) =>
    record.customer_ready.blockers.find((b) => b.id === id);

  const withBlocker = (blocker: Record<string, unknown>) => ({
    graded_at: "2026-08-27",
    commit: "42d7f60",
    tier: "P",
    target_band: "8.5-9.5",
    engineering: { score: 8 },
    customer_ready: { score: 8, blockers: [blocker] },
    sell_gate: { minimum: SELL_GATE_MINIMUM, result: "SATISFIED" },
  });

  const closed = {
    id: "X-01",
    summary: "example",
    owner: "us",
    status: "CLOSED",
    evidence: "commit abc1234",
  };

  it("accepts an ISO closing date on a CLOSED blocker", () => {
    const parsed = gradeRecordSchema.safeParse(withBlocker({ ...closed, closed_on: "2026-08-28" }));
    expect(parsed.success).toBe(true);
  });

  it("stays optional, so blockers closed by a commit need no date", () => {
    expect(gradeRecordSchema.safeParse(withBlocker(closed)).success).toBe(true);
  });

  it("refuses a date that is not an ISO date, so it cannot drift into prose", () => {
    const parsed = gradeRecordSchema.safeParse(
      withBlocker({ ...closed, closed_on: "28 August 2026" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuses a closing date on a blocker that is still OPEN", () => {
    const parsed = gradeRecordSchema.safeParse(
      withBlocker({ id: "X-02", summary: "e", owner: "us", status: "OPEN", evidence: null, closed_on: "2026-08-28" }),
    );
    expect(parsed.success).toBe(false);
  });

  it("still refuses a key nobody has defined, so this did not open the gate up", () => {
    const parsed = gradeRecordSchema.safeParse(withBlocker({ ...closed, closed_at: "2026-08-28" }));
    expect(parsed.success).toBe(false);
  });

  it("records CR-05 as closed by a signed DPA, with the date that is recorded nowhere else", () => {
    const record = gradeRecordSchema.parse(readRecordedGrades());
    const cr05 = blockerOf(record, "CR-05");
    expect(cr05?.status).toBe("CLOSED");
    expect(cr05?.closed_on).toBe("2026-08-28");
    expect(cr05?.evidence).toContain("5.1.0");
  });
});

describe("the sell gate is computed from both scores", () => {
  const base: GradeRecord = {
    graded_at: "2026-08-27",
    commit: "42d7f60",
    tier: "P",
    target_band: "8.5-9.5",
    engineering: { score: 8 },
    customer_ready: {
      score: 8,
      blockers: [
        { id: "X-01", summary: "example", owner: "us", status: "CLOSED", evidence: "commit abc1234" },
      ],
    },
    sell_gate: { minimum: SELL_GATE_MINIMUM, result: "SATISFIED" },
  };

  const withScores = (engineering: number, customerReady: number): GradeRecord => ({
    ...base,
    engineering: { score: engineering },
    customer_ready: { ...base.customer_ready, score: customerReady },
  });

  it("opens only when BOTH grades reach the minimum", () => {
    expect(evaluateSellGate(withScores(8, 8)).satisfied).toBe(true);
  });

  it("stays shut when engineering alone reaches it", () => {
    const verdict = evaluateSellGate(withScores(9, 6.8));
    expect(verdict.satisfied).toBe(false);
    expect(verdict.blockedBy).toEqual(["customer_ready"]);
  });

  it("stays shut when customer-ready alone reaches it", () => {
    const verdict = evaluateSellGate(withScores(7, 9));
    expect(verdict.satisfied).toBe(false);
    expect(verdict.blockedBy).toEqual(["engineering"]);
  });

  it("names both when both fall short, so the lower one can be fixed first", () => {
    expect(evaluateSellGate(withScores(6, 5)).blockedBy).toEqual([
      "engineering",
      "customer_ready",
    ]);
  });

  it("does not round 7.9 up into a pass", () => {
    expect(evaluateSellGate(withScores(7.9, 9)).satisfied).toBe(false);
  });

  it("counts only the blockers that are ours and still open", () => {
    const record: GradeRecord = {
      ...base,
      customer_ready: {
        ...base.customer_ready,
        blockers: [
          { id: "A", summary: "ours, open", owner: "us", status: "OPEN", evidence: null },
          { id: "B", summary: "ours, closed", owner: "us", status: "CLOSED", evidence: "commit abc1234" },
          { id: "C", summary: "Greg's", owner: "greg", status: "OPEN", evidence: null },
        ],
      },
    };
    expect(openBlockersOwnedByUs(record).map((b) => b.id)).toEqual(["A"]);
  });
});
