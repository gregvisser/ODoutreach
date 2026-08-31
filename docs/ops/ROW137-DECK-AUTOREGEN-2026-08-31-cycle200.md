# Row 137 — the cross-project deck now regenerates itself, at the end of every relay cycle

Date: 2026-08-31 (cycle 200)

## The problem, verbatim

On 31 August, `C:\Bidlowprojects\bidlow-deck.html` was last written on 27 August.
It knew nothing of the previous hundred queue rows, of the sell gate being
satisfied, or of any of 30 August's work. Greg's instruction: the deck must be
up to date and current at all times. Nothing regenerated it but a human
remembering to run `node _standards\bidlow-deck.mjs` by hand.

## What changed

Two files, both inside this repository, neither inside `_standards`:

- **`relay-watch.ps1`** — added:
  - `$ProjectsRoot`, `$DeckScriptPath`, `$DeckOutputPath`, three path
    variables derived from this repo's own location (never hard-coded), sat
    beside the other path variables at the top of the file.
  - `Invoke-DeckRegeneration` — a function that runs
    `node _standards\bidlow-deck.mjs --root <ProjectsRoot> --out <temp file>`
    and, only on success, renames the temp file onto the real deck path.
    Every failure path (script missing, `node` missing, non-zero exit, a
    syntax error, an empty output, a locked destination) is caught internally
    and returned as data (`Ok` / `Note`) — the function never throws.
  - A call to `Invoke-DeckRegeneration` wired into the end of the main cycle
    loop, after the cycle's own log is written (which is itself after
    `Invoke-CycleAgent` — the cycle's own commit — has already returned), and
    wrapped in its own try/catch as a second line of defence on top of the
    function's internal handling. The outcome (success or the plain-English
    reason it did not happen) is written both to `Write-Line` (the watcher's
    own console/alert channel) and appended to that cycle's own log file
    under a `## Cross-project deck` heading.
- **`relay-selftest.ps1`** — a new numbered section, **15**, with eight cases
  (15a–15h) proving:
  1. a working deck script actually writes the file, and the `--root`
     argument the real call site would pass is genuinely forwarded to it;
  2. running it a second time with different content **replaces** the old
     content — this is a live regeneration, not a one-shot that gets trusted
     forever;
  3. no temp file is left behind after a successful run;
  4. **the one that matters** — a deck script that exits non-zero does not
     throw past `Invoke-DeckRegeneration`, is reported as `Ok = $false` with
     the real exit code in the note, and the *existing* deck file survives
     byte-for-byte untouched;
  5. a deck script containing a genuine JavaScript syntax error is caught the
     same way, and the existing deck survives;
  6. a missing deck script file is caught the same way;
  7. a missing `node` executable is caught the same way;
  8. replaying the exact try/catch shape of the real call site in
     `relay-watch.ps1` proves execution reaches the line after the deck block
     even when the deck script fails — the cycle is not stopped or delayed —
     and that the plain-English failure line matches what the real call site
     actually writes;
  9. a **locked** destination file (opened exclusively, `FileShare.None`) is
     caught rather than thrown, and its original content survives.

Nothing under `_standards` was touched — `bidlow-deck.mjs`, `deck.cmd`, and
`deck-plain.mjs` are unmodified. No sibling project folder was touched. No
grade, stage, or `.bidlow/GRADES.json` was touched.

## Housekeeping picked up this cycle (unrelated to row 137, found during the PR sweep)

`.bidlow/relay/log/cycle-199.md` existed on disk but was never committed by
cycle 199 before it ended — the same "leftover log" pattern recorded in
several earlier cycle logs. `npm test` caught this directly:
`relay/cycle-log-reaches-git.test.ts` failed, expecting zero untracked files
under `.bidlow/relay/log/` and finding `cycle-199.md`. Committed alongside
this row's own changes so the test suite is genuinely green, not because row
137 required it.

## A real bug CI caught, and the fix

The first push (PR #516) failed CI's `verify` job on
`relay/stale-watcher-visible.test.ts`, which dot-sources a **copy** of
`relay-watch.ps1` from a shallow scratch directory to exercise the
stale-watcher check in isolation. At that shallow depth, the naive
three-level `Split-Path` walk used to compute `$ProjectsRoot` genuinely runs
out and returns an empty string, and `Join-Path` refuses an empty `-Path`
under `$ErrorActionPreference = "Stop"` — which crashed the **entire script
load**, not just deck regeneration, because that computation sat at the top
of the file and ran unconditionally.

Fixed by wrapping the walk in try/catch and falling back to `$RepoRoot`
itself if it produces an empty path or throws. The fallback deck paths
simply will not exist in that shape, and `Invoke-DeckRegeneration`'s own
`Test-Path` guard already turns "does not exist" into a normal, logged
no-op — so the fallback is safe by construction, not just convenient.
Reproduced locally with a scratch copy of the script one level under a
drive root (`C:\rwsc\relay-watch.ps1`, the same shape the CI harness hits)
before the fix threw and after the fix loaded cleanly with
`$ProjectsRoot=[C:\rwsc]`. Re-ran `relay/stale-watcher-visible.test.ts`
directly (14/14 passed) and the full suite (369 files / 3827 tests, all
green) after the fix.

## Red-first proof

The new self-test section calls a function, `Invoke-DeckRegeneration`, that
did not exist before this change. Proven red by stashing only the
`relay-watch.ps1` half of this change and running `relay-selftest.ps1` with
the new section 15 already in place:

```
15. The cross-project deck regenerates after a cycle; a broken deck script never stops the relay or corrupts the deck

SELF-TEST HARNESS ERROR - 91 check(s) passed before the harness itself crashed; none of them failed.
The term 'Invoke-DeckRegeneration' is not recognized as the name of a cmdlet, function, script file, or operable program.
```

Restoring `relay-watch.ps1` and re-running: all 15 cases passed on the first
full run except five, all failing for the same reason — an exact-string
comparison against `Get-Content -Raw` that did not account for `Set-Content`'s
trailing line ending, not a defect in the regeneration logic itself:

```
FAIL  the existing deck is left BYTE-FOR-BYTE untouched by a failed regeneration - this is the atomic-write guarantee proving itself
FAIL  a syntax error leaves the existing deck untouched, same as any other failure
FAIL  a missing script leaves the existing deck untouched
FAIL  a missing node executable leaves the existing deck untouched too
FAIL  a locked destination file's original content survives a failed regeneration attempt against it

SELF-TEST FAILED - 5 of 113 checks
```

Fixed by trimming the trailing newline before comparison (`.TrimEnd()`), which
is a test-fixture fix, not a change to `Invoke-DeckRegeneration` itself. Full
suite after the fix:

```
SELF-TEST PASSED - 113 checks.
```

**113 is above both the 91 this suite passed at immediately before this row,
and the 74 the brief cites from 31 August.**

## Live proof it actually fires against the real script

Beyond the self-test's scratch fixtures, `Invoke-DeckRegeneration` was run
once against the **real** `_standards\bidlow-deck.mjs` and the **real**
`--root C:\Bidlowprojects`, writing to a scratch temp path (never the real
`bidlow-deck.html`):

```
Ok=True
Note=regenerated C:\Users\...\Temp\relay-livecheck-deck.html
OutputBytes=50805
MentionsODoutreach=True
```

## Gates run and shown

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 369 files / 3827 tests, all green (the one pre-existing
  failure was the untracked `cycle-199.md` log noted above, fixed by
  committing it).
- PowerShell parser (`[System.Management.Automation.Language.Parser]::ParseFile`)
  against both `relay-watch.ps1` and `relay-selftest.ps1` — no syntax errors.
- `relay-selftest.ps1` itself — 113/113 checks passed (see above).

## The one sentence a non-coder can check

After every relay cycle finishes, `C:\Bidlowprojects\bidlow-deck.html` is
rewritten with current data automatically — check its "last written" time
against the clock next time the relay has just run a cycle — and if that
rewrite fails for any reason, the relay's own log for that cycle says so in
plain English under "Cross-project deck" and the relay carries on to the next
item regardless.

## This change is inert until the running watcher restarts

Per the standing project rule: PowerShell reads `relay-watch.ps1` once, at
launch, and runs from memory. Merging this change does **not** make the deck
start regenerating — the acceptance test is a cycle log line beginning
`Watcher script:` naming this change's commit hash. Until Greg runs
`relay-start.cmd`, the currently-running watcher process is executing the
pre-row-137 code and the deck will keep going stale exactly as before. **Do
not restart the watcher from inside a cycle — that is Greg's action.**

## The finding asked for: is the deck right to show "ASK still open" next to "clear to sell" at the same time?

Read live against the actual generated HTML for the ODoutreach card:

- The deck already carries a dedicated, prominent callout — a
  `headline-ooo` banner at the very top — reading **"5 of 8 projects are
  building ahead of their own questions"**, and it names ODoutreach
  specifically: *"ODoutreach — CLASSIFY, CHECK, PLAN, BUILD, PROVE already
  built, before an earlier question closed."*
- On ODoutreach's own card, the ASK stage tile is marked `s-partial is-here`
  with `◐` and "you are here", and every downstream stage (CLASSIFY through
  PROVE) carries its own `done out of order` tag with a tooltip explaining
  why. The "clear to sell" verdict on PROVE (`Built 8.5/10, customer-ready
  8.1/10 — clear to sell`) sits directly beside those out-of-order tags, not
  hidden from them.
- The one thing keeping ASK from reading "done" is recorded in
  `.bidlow/BLUEPRINT.json` under `compensating_checks_outstanding`:
  `exception_checklist_sent` and `phased_commercials`, both explicitly
  `"owner": "greg"`. `phased_commercials` is tied to open question `OQ-05`,
  whose own record says plainly: *"a commercial decision about a client
  relationship and about money, so it is not the agent's to record as
  done."*

**Verdict: the deck is right to show both at once, and this is not a
reporting gap worth its own row.** It is not silently contradicting itself —
it is doing the opposite: surfacing, in two independent places on the same
card, that this project was built ahead of its own paperwork, while
accurately reporting that the evidence behind the sell gate (a real,
measured 8.5 engineering / 8.1 customer-ready score) is genuine and
unaffected by that paperwork gap. The one open item is already correctly
attributed to Greg as a commercial decision in `BLUEPRINT.json`'s own
records, not something a cycle should invent a row to chase. Raising a row
here would just duplicate `OQ-05`, which already exists, is already owned,
and is explicitly marked as not a discovery task.

## Not touched, on purpose

- `_standards\bidlow-deck.mjs`, `_standards\deck.cmd`, `_standards\deck-plain.mjs`
- Any sibling project folder (`Kepak`, `Papaya`, `BidlowTools\*`)
- `.bidlow/GRADES.json`, any grade, any stage
- No email sent, no data deleted, for any client
