// Row 125: receiving must run at any time; sending stays inside business hours.
//
// WHY THIS FILE EXISTS
//
// Greg's decision, 30 August: sending and replying stay inside the suggested
// hours, but receiving must run at any time. The measured fact was that
// `sync-replies.yml` only ran `*/15 7-18 * * 1-5` — weekday, business-hours
// only — so a reply landing after 18:00 Friday was invisible on every operator
// screen until 07:00 Monday, up to 61 hours later.
//
// This suite reads the REAL `.github/workflows/*.yml` files, not a copy of the
// cron strings, and simulates whether each schedule would actually fire at a
// sample of night/weekend instants — the same defect class QUEUE.md keeps
// finding: something built, wired, reporting success, and never firing. A test
// that only checked the string for a `*` would pass on a typo that still never
// fires at 3am Saturday; this test proves the schedule actually covers those
// clock instants using a real (if minimal) cron field matcher.
//
// It also locks down what this row must NOT touch: `process-outbound-queue.yml`
// keeps its exact business-hours-only cron. A future edit that "fixes" it
// alongside the reply sync would violate Greg's explicit decision and this test
// catches that too.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = path.resolve(__dirname, "..", ".github", "workflows");

function readWorkflowCron(fileName: string): string {
  const contents = readFileSync(path.join(WORKFLOWS_DIR, fileName), "utf8");
  const match = contents.match(/- cron:\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`No cron expression found in ${fileName}`);
  }
  return match[1];
}

// A deliberately minimal 5-field (standard POSIX) cron matcher — just enough
// to evaluate the two schedules this repo actually uses (`*`, `*/N`, `A-B`,
// and plain numbers). It is not trying to be a general cron library; it is
// trying to answer one question honestly: given this exact string, does it
// fire at this exact UTC instant?
function cronFieldMatches(field: string, value: number): boolean {
  return field.split(",").some((part) => {
    const stepMatch = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/);
    if (stepMatch) {
      const [, base, stepStr] = stepMatch;
      const step = Number(stepStr);
      const start = base === "*" ? 0 : Number(base.split("-")[0]);
      return value >= start && (value - start) % step === 0;
    }
    if (part === "*") return true;
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      return value >= Number(rangeMatch[1]) && value <= Number(rangeMatch[2]);
    }
    return Number(part) === value;
  });
}

function cronFiresAt(cron: string, utcInstant: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected a 5-field cron expression, got "${cron}"`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    cronFieldMatches(minute, utcInstant.getUTCMinutes()) &&
    cronFieldMatches(hour, utcInstant.getUTCHours()) &&
    cronFieldMatches(dayOfMonth, utcInstant.getUTCDate()) &&
    cronFieldMatches(month, utcInstant.getUTCMonth() + 1) &&
    cronFieldMatches(dayOfWeek, utcInstant.getUTCDay())
  );
}

// Sunday 2026-08-30 03:00 UTC — the night/weekend hour a reply cannot reach
// any operator screen under the old schedule (this is the actual day Greg
// replied and nothing collected it until forced by hand).
const SUNDAY_NIGHT = new Date(Date.UTC(2026, 7, 30, 3, 0, 0));
// Saturday 2026-08-29 20:00 UTC — Saturday evening.
const SATURDAY_EVENING = new Date(Date.UTC(2026, 7, 29, 20, 0, 0));
// Tuesday 2026-08-25 02:00 UTC — a weekday, but outside the 07:00-18:00 window.
const WEEKDAY_NIGHT = new Date(Date.UTC(2026, 7, 25, 2, 0, 0));
// Tuesday 2026-08-25 10:00 UTC — inside business hours, sanity control.
const WEEKDAY_BUSINESS_HOURS = new Date(Date.UTC(2026, 7, 25, 10, 0, 0));

describe("reply sync must run at any time (row 125)", () => {
  it("the live sync-replies.yml cron fires at night and at the weekend", () => {
    const cron = readWorkflowCron("sync-replies.yml");

    expect(cronFiresAt(cron, SUNDAY_NIGHT)).toBe(true);
    expect(cronFiresAt(cron, SATURDAY_EVENING)).toBe(true);
    expect(cronFiresAt(cron, WEEKDAY_NIGHT)).toBe(true);
    expect(cronFiresAt(cron, WEEKDAY_BUSINESS_HOURS)).toBe(true);
  });

  it("would have failed against the pre-row-125 expression", () => {
    // The exact string measured off `.github/workflows/sync-replies.yml`
    // before this row's change — kept here, not read from disk, precisely so
    // this assertion cannot silently start passing if the file is edited
    // again. It is the fixed point this test is proven against.
    const oldCron = "*/15 7-18 * * 1-5";

    expect(cronFiresAt(oldCron, SUNDAY_NIGHT)).toBe(false);
    expect(cronFiresAt(oldCron, SATURDAY_EVENING)).toBe(false);
    expect(cronFiresAt(oldCron, WEEKDAY_NIGHT)).toBe(false);
    // The one instant the old schedule DID cover — proves the matcher itself
    // is not just returning true unconditionally.
    expect(cronFiresAt(oldCron, WEEKDAY_BUSINESS_HOURS)).toBe(true);
  });

  it("does NOT touch process-outbound-queue.yml — sending stays business-hours-only", () => {
    // Greg's explicit decision, and this row does not revisit it: sending and
    // replying stay inside business hours. Only receiving changes.
    const sendCron = readWorkflowCron("process-outbound-queue.yml");
    expect(sendCron).toBe("*/5 7-18 * * 1-5");

    expect(cronFiresAt(sendCron, SUNDAY_NIGHT)).toBe(false);
    expect(cronFiresAt(sendCron, SATURDAY_EVENING)).toBe(false);
    expect(cronFiresAt(sendCron, WEEKDAY_NIGHT)).toBe(false);
    expect(cronFiresAt(sendCron, WEEKDAY_BUSINESS_HOURS)).toBe(true);
  });
});
