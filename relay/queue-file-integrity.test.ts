// Structural guards on the REAL .bidlow/relay/QUEUE.md.
//
// WHY THIS FILE EXISTS
//
// On 2026-08-28 QUEUE.md was found carrying TWO tables. The live one sat under a
// header at line 191; a second, HEADER-LESS block of 28 rows sat at the bottom of
// the file, underneath the closing prose, where markdown renders it as plain text
// and nobody scrolling the file would read it as a table at all. It was the
// wreckage of a reconciliation made on a branch that landed ALONGSIDE the rows it
// was meant to replace instead of on top of them.
//
// That is not a cosmetic fault, because of how the watcher writes.
// `Get-QueueRows` scans EVERY line of the file, so both tables were in the
// picker's list. `Set-QueueRowStatus` then finds rows BY NUMBER and rewrites the
// FIRST one it matches. With a number appearing twice, the relay could take the
// second row and stamp its status onto the first:
//
//   * #42 was DONE 54 at line 237 and TODO at line 363.
//   * #69 was DONE 62 at line 359 and TODO at line 380.
//
// In both cases the picker reaches the TODO row, and the write lands on the DONE
// one. That destroys a finished record AND leaves the row it actually worked on
// still TODO - so the same item is re-issued every cycle, for ever, while a real
// result is overwritten each time. Seven numbers were duplicated this way.
//
// The tests below are deliberately about the FILE, not about a fixture. A fixture
// would prove the assertions compile; only the real file proves the queue the
// relay reads tonight is sound. `relay/queue-parser.test.ts` covers the parser
// itself against fixtures; this file covers the data.
//
// The parser here is a deliberate re-implementation of the watcher's anchor - the
// LAST " | " in the line - and is kept to that one rule on purpose. It is not
// trying to be the PowerShell; it is trying to find rows the same way, so that a
// row this file counts is a row the relay would also see.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const QUEUE_PATH = path.resolve(
  __dirname,
  "..",
  ".bidlow",
  "relay",
  "QUEUE.md",
);

interface QueueRow {
  line: number;
  number: number;
  item: string;
  status: string;
}

/**
 * Split a row the way `Set-QueueRowStatus` does: the status is everything after
 * the LAST " | " boundary, so a pipe inside the item or status prose cannot
 * shift the columns. See the "NODE|20-lts" story in queue-parser.test.ts.
 */
function parseRows(text: string): QueueRow[] {
  const rows: QueueRow[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const body = raw.trimEnd();
    if (!body.startsWith("|") || !body.endsWith("|")) return;

    const inner = body.slice(0, -1);
    const cut = inner.lastIndexOf(" | ");
    if (cut < 0) return;

    const match = /^\|\s*(\d+)\s*\|([\s\S]*)$/.exec(inner.slice(0, cut));
    if (!match) return;

    rows.push({
      line: index + 1,
      number: Number(match[1]),
      item: match[2].trim(),
      status: inner.slice(cut + 3).trim(),
    });
  });

  return rows;
}

const QUEUE_TEXT = readFileSync(QUEUE_PATH, "utf8");
const ROWS = parseRows(QUEUE_TEXT);

// The six words the watcher recognises. A status is what the cell STARTS with -
// see the `-match 'BLOCKED'` story in queue-parser.test.ts.
const STATUS_WORDS = [
  "TODO",
  "DONE",
  "BLOCKED",
  "PARTIAL",
  "IN PROGRESS",
  "WONTFIX",
];

function statusWord(status: string): string | null {
  const bare = status.replace(/^\*+/, "");
  return STATUS_WORDS.find((word) => bare.startsWith(word)) ?? null;
}

describe("QUEUE.md structure", () => {
  it("has rows at all, so a parse fault cannot pass as a clean queue", () => {
    // Every assertion below is vacuously true against an empty list. This is the
    // house defect - built, wired, reporting success, never firing - and it is
    // cheap to close.
    expect(ROWS.length).toBeGreaterThan(50);
  });

  // THE DEFECT, STATED AS AN ASSERTION.
  //
  // `Set-QueueRowStatus` rewrites the FIRST row carrying the number it is given,
  // so two rows sharing a number means the relay can mark one while working on
  // the other. There is no safe duplicate.
  it("gives every row its own number", () => {
    const seen = new Map<number, QueueRow[]>();
    for (const row of ROWS) {
      const bucket = seen.get(row.number) ?? [];
      bucket.push(row);
      seen.set(row.number, bucket);
    }

    const duplicated = [...seen.entries()].filter(
      ([, bucket]) => bucket.length > 1,
    );

    expect(
      duplicated.map(
        ([number, bucket]) =>
          `#${number} appears on lines ${bucket.map((r) => r.line).join(", ")}`,
      ),
    ).toEqual([]);
  });

  // The second half of the same fault. Two rows can hold the SAME job under
  // DIFFERENT numbers, which the parser is perfectly happy with and which costs a
  // whole cycle each time a picker reaches the copy. Fifteen pairs were sitting
  // in this file, including work already shipped and marked DONE under its other
  // number.
  it("does not carry the same job twice under two numbers", () => {
    const seen = new Map<string, QueueRow[]>();
    for (const row of ROWS) {
      // Compare on the opening sentence. Later cycles append notes to an item's
      // text, so a whole-cell equality test would stop catching a pair the moment
      // one of them was annotated - which is exactly when it matters most.
      const key = row.item.replace(/[^a-z0-9]/gi, "").slice(0, 80).toLowerCase();
      if (key.length < 40) continue;
      const bucket = seen.get(key) ?? [];
      bucket.push(row);
      seen.set(key, bucket);
    }

    const duplicated = [...seen.values()].filter((bucket) => bucket.length > 1);

    expect(
      duplicated.map(
        (bucket) =>
          `rows ${bucket
            .map((r) => `#${r.number} (line ${r.line})`)
            .join(" and ")} are the same job`,
      ),
    ).toEqual([]);
  });

  // How the shadow table hid for so long: it was BELOW the closing prose, with no
  // header of its own, so it rendered as running text. One contiguous run of rows
  // means a human reading the file sees everything the relay sees.
  it("keeps every row in one contiguous table", () => {
    const lines = ROWS.map((row) => row.line);
    const first = lines[0];
    const expected = lines.map((_, index) => first + index);

    expect(lines).toEqual(expected);
  });

  it("has exactly one table header", () => {
    const headers = QUEUE_TEXT.split(/\r?\n/).filter((line) =>
      /^\|\s*#\s*\|/.test(line.trim()),
    );

    expect(headers).toHaveLength(1);
  });

  it("writes every status as one of the six words the watcher knows", () => {
    const unreadable = ROWS.filter((row) => statusWord(row.status) === null);

    expect(
      unreadable.map((row) => `#${row.number} (line ${row.line}): ${row.status}`),
    ).toEqual([]);
  });

  // FOUND WHILE MERGING THE TWO TABLES, AND IT IS LOAD-BEARING.
  //
  // `Invoke-SelfQueue` takes the FIRST row in FILE ORDER that is not DONE and not
  // IN PROGRESS, and if that row is BLOCKED it writes a note and idles. It does
  // not skip past it - "the order is the plan". So a BLOCKED row placed above a
  // TODO row stops the entire queue behind it, silently, until a human looks.
  //
  // Row 48 went BLOCKED in cycle 70 and only sat at the very bottom of the file
  // by accident. Sorting this table by number - the obvious tidy-up, and the
  // first thing a future cycle will reach for - would have moved it to the middle
  // and halted the relay. This test is here so that tidy-up goes red instead.
  it("keeps BLOCKED and WONTFIX rows below every row still to be done", () => {
    const halting = ROWS.filter((row) => {
      const word = statusWord(row.status);
      return word === "BLOCKED" || word === "WONTFIX";
    });
    if (halting.length === 0) return;

    const firstHalt = halting[0];
    const strandedBehindIt = ROWS.filter((row) => {
      if (row.line <= firstHalt.line) return false;
      const word = statusWord(row.status);
      return word === "TODO" || word === "PARTIAL";
    });

    expect(
      strandedBehindIt.map(
        (row) =>
          `#${row.number} (line ${row.line}) is ${statusWord(row.status)} but sits below #${firstHalt.number}, which is ${statusWord(firstHalt.status)} and stops the picker`,
      ),
    ).toEqual([]);
  });
});
