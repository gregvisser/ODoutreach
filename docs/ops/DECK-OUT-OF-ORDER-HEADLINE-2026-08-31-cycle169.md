# The deck now leads with out-of-order work — 2026-08-31 (cycle 169, row 138)

## The brief

Row 138 of the relay queue: the estate is building ahead of its own questions
(31 August regeneration: BUILD 7 of 8, ASK 2 of 8), and the command deck
(`C:\Bidlowprojects\_standards\bidlow-deck.mjs`) only reported that fact as a
per-project footnote (the small "done out of order" tag inside each project's
stage track). Greg's words: this is becoming a needle in a haystack. The ask
was to raise it to a headline, beside the existing top-line counts (the
"can build now / blocked / sellable / …" tiles), in plain English, computed
from the same `p.outOfOrder` value the deck already carries — no new measure,
no new state, no gating, no grading, nothing written to any `.bidlow/` file.

Greg named exactly one file this row was authorised to touch under
`_standards`: `bidlow-deck.mjs`. Nothing else there was touched.

## What actually changed

**`C:\Bidlowprojects\_standards\bidlow-deck.mjs`** (the only file touched
under `_standards`; dated backup taken first at
`bidlow-deck.mjs.bak-2026-08-31`, following the existing convention of the
other `.bak-*` files already in that folder):

- Added `export function estateOutOfOrder(live)` — a pure aggregation over
  the array of already-assessed projects. It does not compute a single new
  fact: `p.outOfOrder` is produced exactly as before, inside `assess()`,
  which this change does not touch. `estateOutOfOrder` only filters the live
  projects down to the ones with at least one out-of-order stage and counts
  them. Returns `null` when nothing qualifies, so the caller renders nothing.
- Added `outOfOrderHeadline(ooo)` — turns that into the HTML banner, wording
  the row asked for ("building ahead of its own questions", not "out of
  order"), naming every affected project and which stages it built early.
- Wired `estateOutOfOrder(live)` and `outOfOrderHeadline(ooo)` into `render()`,
  placed directly above the existing `.tiles` row — the first thing on the
  page after the title, beside the existing headline counts.
- Added CSS for `.headline-ooo` only. No existing selector, stage-track
  markup, card, or rail was touched — the per-project "done out of order" tag
  inside each card is byte-for-byte unchanged.

No other file under `_standards` was created, edited, or deleted.
`deck-plain.mjs`, `bidlow-intake.mjs`, `lib.mjs`, the checklists, and
`deck.cmd` are untouched. No `.bidlow/` file in any project was written. No
grade, score, or gate behaviour changed anywhere — this is a reader reading
the same facts it already read, surfaced one level higher.

## Before / after, rendered from the real estate

Ran the real script (not a mock) against the real `C:\Bidlowprojects` tree,
once before the change (from the dated backup) and once after.

**Before** — nothing between the title and the tiles:
```html
dark'">theme</button>
</div>

<div class="tiles">
  <div class="tile t-warn">...
```

**After** — the headline fires, names every affected project, and stays out
of the way of everything already there:
```html
<div class="headline-ooo">
    <div class="ho-n">5<span>/8</span></div>
    <div class="ho-body">
      <b>5 of 8 projects are building ahead of their own questions</b>
      <ul><li><b>Kepak</b> — BUILD already built, before an earlier question closed</li>
      <li><b>ODoutreach</b> — CLASSIFY, CHECK, PLAN, BUILD, PROVE already built, before an earlier question closed</li>
      <li><b>Papaya</b> — CHECK, BUILD already built, before an earlier question closed</li>
      <li><b>bidlow-invoices</b> — BUILD already built, before an earlier question closed</li>
      <li><b>bidlow-website</b> — BUILD already built, before an earlier question closed</li></ul>
    </div>
  </div>
<div class="tiles">
  <div class="tile t-warn">...
```

5 of the 8 live projects in the estate are currently flagged — matching the
"BUILD 7 of 8, ASK 2 of 8" shape the row described (not every project with an
open ASK also has a later stage marked done, so the two counts are related
but not identical, which is correct — `outOfOrder` is a stricter, sequence-
aware measure than a raw stage tally).

## The test harness question — answered plainly

`bidlow-deck.mjs` has **no test harness of its own**. There is no
`package.json`, no test runner, and no existing test file anywhere under
`C:\Bidlowprojects\_standards`. The only thing that superficially resembles
one, `bidlow-standards/test-hooks.sh`, tests the enforcement *hooks*
(`gate-build.mjs` etc.), not the deck.

Per the row's own instruction, the two required tests do **not** live under
`_standards` (forbidden explicitly) and are not invented as a duplicate of
the deck's logic living somewhere else — a hand-copied mirror could drift
from the real file silently, which is exactly the failure class this project
is most worried about ("built, wired, reporting success, and never firing").
Instead:

- **`standards/bidlow-deck-out-of-order-headline.test.ts`** (new, in this
  repo — the "project" this cycle runs against) imports the *real*
  `C:\Bidlowprojects\_standards\bidlow-deck.mjs` from its fixed path on disk
  and calls its real, exported `estateOutOfOrder()` — no copy, no mock.
- **`vitest.config.ts`** — added `"standards/**/*.test.ts"` to `test.include`,
  with a comment explaining why, mirroring the existing precedent comment for
  `relay/**/*.test.ts` (which already drives a real external script,
  `relay-watch.ps1`, the same way).

**Why this can't run the same way in every environment, and why that's
honest rather than a shortcut:** `_standards` sits outside every project's
git repository. ODoutreach's own CI (`ubuntu-latest`, GitHub Actions) checks
out only this repo — there is no `C:\` drive, no `_standards` folder, and no
way for any CI, on any project, to reach that file. The test therefore reads
its own environment at run time: on a machine where the shared tooling tree
exists (this one — where every relay cycle actually runs), it imports and
exercises the real file, and gives real proof. On `ubuntu-latest` CI it
reports a **visible skip** (named in the run output as skipped, never
silently passed as if it had verified something it could not reach). This is
stated in full in the test file's own header comment.

### Proving it fires, and proving it stays quiet — the actual run

Watched red, before the change, on this machine, against the real file:

```
❯ standards/bidlow-deck-out-of-order-headline.test.ts (2 tests | 2 failed)
   × fires and names the project when it has built stages ahead of an earlier open one
     → deck.estateOutOfOrder is not a function
   × stays quiet — adds nothing — when every project is in order
     → deck.estateOutOfOrder is not a function
```

Green after the change, same file, same machine, same real import:

```
✓ standards/bidlow-deck-out-of-order-headline.test.ts (2 tests) 183ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- Test 1 asserts a fixture where one project (`ODoutreach`, `outOfOrder:
  ["BUILD", "PROVE"]`) is out of order and another is not: `estateOutOfOrder`
  returns a non-null result, `count: 1`, and names `ODoutreach` with its
  exact out-of-order stages.
- Test 2 asserts a fixture where every project's `outOfOrder` array is empty:
  `estateOutOfOrder` returns `null` — nothing rendered, matching "a project
  that is genuinely in order must show nothing new at all."

## Gates run (this repo, ODoutreach — the change also touches `standards/`
and `vitest.config.ts` here)

- `npm run lint` — 0 problems.
- `npx tsc --noEmit` — 0 errors.
- `npm test` — 367 files / 3815 tests passing (up from 366 files / 3813
  tests before this row; +1 file, +2 tests, matching the new test file
  exactly).

## Files touched, named in full

- `C:\Bidlowprojects\_standards\bidlow-deck.mjs` (edited — the only file
  authorised under `_standards`)
- `C:\Bidlowprojects\_standards\bidlow-deck.mjs.bak-2026-08-31` (new — dated
  backup taken before editing, per the row's instruction)
- `standards/bidlow-deck-out-of-order-headline.test.ts` (new, this repo)
- `vitest.config.ts` (edited, this repo — added `standards/**/*.test.ts` to
  `test.include`)
- `docs/ops/DECK-OUT-OF-ORDER-HEADLINE-2026-08-31-cycle169.md` (this file)

No other project's `.bidlow/` files, grades, or generated deck output were
regenerated or committed by this row (row 137 owns automatic regeneration
separately, per the brief).

## Hard rule

No email sent, no data deleted, for any client. This row touched a local
read-only reporting script and this repo's own test suite only.
