import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// bidlow-deck.mjs is the READER dashboard shared by every BidlowAI project. It
// lives outside every git repository, at C:\Bidlowprojects\_standards, so it
// is not checked out by ANY project's CI (this repo's included — CI runs on
// ubuntu-latest and never sees a C:\ drive). There is no way to make CI
// execute the real file, so this suite is honest about what it can prove:
//
//   - On a machine where the shared tooling tree exists (Greg's machine, or a
//     relay cycle running on it), this test imports the REAL bidlow-deck.mjs
//     and calls its REAL exported estateOutOfOrder() function — real proof,
//     not a copy that could silently drift from the shipped behaviour.
//   - On CI (ubuntu-latest), the path does not exist, so the suite reports a
//     VISIBLE skip (named in the test run output), never a silent pass.
//
// Row 138 (queue cycle 169) required this headline to be provable with a
// red-first test; this is that test, run for real against the shipped file
// as part of landing the change (see docs/ops for the before/after and the
// red output).
const DECK_PATH = "C:\\Bidlowprojects\\_standards\\bidlow-deck.mjs";
const hasDeck = existsSync(DECK_PATH);

describe.skipIf(!hasDeck)("bidlow-deck.mjs — estateOutOfOrder headline (row 138)", () => {
  it("fires and names the project when it has built stages ahead of an earlier open one", async () => {
    const deck = await import(/* @vite-ignore */ pathToFileURL(DECK_PATH).href);
    const result = deck.estateOutOfOrder([
      { name: "ODoutreach", outOfOrder: ["BUILD", "PROVE"] },
      { name: "SomeOtherProject", outOfOrder: [] },
    ]);

    expect(result).not.toBeNull();
    expect(result?.count).toBe(1);
    expect(result?.total).toBe(2);
    expect(result?.projects).toEqual([{ name: "ODoutreach", stages: ["BUILD", "PROVE"] }]);
  });

  it("stays quiet — adds nothing — when every project is in order", async () => {
    const deck = await import(/* @vite-ignore */ pathToFileURL(DECK_PATH).href);
    const result = deck.estateOutOfOrder([
      { name: "InOrderProjectOne", outOfOrder: [] },
      { name: "InOrderProjectTwo", outOfOrder: [] },
    ]);

    expect(result).toBeNull();
  });
});
