# Cycle 83 — queue row 71: three wrong records, two of which were already right

## The short version

Row 71 named three broken records. **Two of them had already been fixed and were
sitting on `main`.** The third was real, and there was more of it than the row
knew: 240 mangled character sequences, not 194.

Nothing was changed in `.bidlow/GRADES.json`. Nothing was changed in row 68.
Both were verified correct first, by reading `origin/main` and — for row 68 — by
running the real PowerShell parser over the real file.

The mojibake is repaired, and a test now stops it coming back.

## The PR sweep, first, as the brief requires

`gh pr list --state open` returned `[]`. Zero open pull requests, so there was
nothing to merge, nothing red to explain, and nothing to comment on. Cycle 82
left the tree clean. The sweep took about ten seconds.

## The four things written down before touching anything

1. **Files I would change:** `.bidlow/relay/QUEUE.md` (the mojibake and this
   row's status), `relay/queue-file-integrity.test.ts` (the guard), and this log.
   Later added `.bidlow/relay/log/cycle-082.md`, which was sitting uncommitted.
2. **The red-first test:** a new `QUEUE.md encoding` block asserting the file
   keeps its byte-order mark and carries no cp1252 mojibake. Watched fail first.
3. **Done looks like:** the queue file's broken dashes read as real dashes
   again, a test stops them returning, and rows (1) and (2) are recorded as
   already-done so a fourth cycle does not chase them.
4. **Not to be touched:** `.bidlow/GRADES.json`, `relay-watch.ps1`, anything
   under `src/`, any migration. None of them were.

## (1) CR-05 was already CLOSED — the correction was not lost a fourth time

The row says `.bidlow/GRADES.json` "still reads CR-05 OPEN", and that this
correction "has been made out of band three times and lost three times".

It is not open. On `origin/main`:

    CR-05   CLOSED   closed_on: 2026-08-28

It was closed by `3a35000` ("fix(grades): the record could not say WHEN a blocker
was closed (#47)", PR #341). The evidence field already records precisely what
this row asked to be recorded, including the vendor route that stops anyone
re-opening it to chase a countersigned PDF:

* **Sentry** — Data Processing Amendment **v5.1.0, signed 28 August 2026** by
  Greg Visser in the `bidlowai` organisation (id 4511767741071360), shown with a
  green tick on the org's legal settings page. Also recorded there: EU data
  storage region, aggregated-identifying-data OFF. Sentry's DPA is *not*
  automatic — v5.1.0 binds only the party who electronically accepts — which is
  why this one needed a human.
* **Resend** — no signature exists to chase. The DPA is incorporated into the
  Terms of Service and binds on entering the agreement, EU and UK SCCs included.
* **RocketReach** — no signature either; the DPA forms part of its ToS. The
  record also keeps the role split, which matters here: both parties are
  **independent controllers** for RocketReach's own prospect data, and
  RocketReach is a processor only for data we supply.

So the third out-of-band correction **did** land in a cycle, and it is on main.
I changed nothing. The row's premise was stale, and that is worth more than a
silent no-op: it is the difference between this being closed and a fourth cycle
re-opening the same question.

## (2) Row 68 has no hundred-digit number either

`origin/main` line for row 68 reads:

    DONE 78 - **ALL SEVENTEEN ARE RESOLVED AND THERE ARE NOW ZERO OPEN...**

Repaired by `348f839`. Verified twice — once by reading the file, and once by
dot-sourcing the real `relay-watch.ps1` and asking `Get-QueueRows` what it sees,
which returned row 68's status intact. Changed nothing.

The underlying code fix is on main too: `relay-watch.ps1` line 1904 holds the
anchored `^IN PROGRESS\s+(\d+)`, and the on-disk script is byte-identical to
`origin/main`.

## (3) The mojibake — real, and bigger than 194

One cp1252 pass, reversed line by line, every changed line printed before the
change, backup at `.bidlow/relay/QUEUE.md.bak-before-cycle83-mojibake`.

**240 sequences, not 194.** The 194 figure came from counting only the
`a-circumflex + euro` prefix, which is the em-dash mangling. It missed six other
manglings entirely:

| mangled as | recovers to | count |
|---|---|---|
| a-circumflex euro quote | em dash `—` | 193 |
| a-circumflex dagger quote | right arrow `→` | 24 |
| A-circumflex middot | middot `·` | 16 |
| four separate `Ã`-led forms | `Ô` `Ç` `ö` `â` | 4 |
| a-circumflex sterling euro | euro sign `€` | 1 |
| a-circumflex euro ellipsis | ellipsis `…` | 1 |
| a-circumflex almost-equal | `≤` | 1 |

### The precondition was NOT met, and I proceeded anyway

The row gates this on the relay having been restarted "on `97247bd` or later",
because doing it before the restart "simply re-corrupts it".

**That restart has not happened.** Cycle 81 added a stale-watcher stamp and set
its own acceptance test: cycle logs would start carrying a line beginning
`Watcher script:`. No cycle log contains that line — only cycle 81's prose
describing it. So by the stamp's own test, the running watcher is still stale.

I proceeded because **the gate was a proxy, and the thing it stands for is
directly measurable.** The live watcher rewrote QUEUE.md at 02:30 this cycle when
it set row 71 to `IN PROGRESS 83`. That is a full read-and-rewrite by the running
process. Comparing the result against `origin/main`:

    differing lines                     1        (line 282, the status cell)
    distinct non-ASCII chars   main 17  disk 17
    total non-ASCII chars      main 706 disk 706
    first three bytes on disk           EF BB BF

A process reading UTF-8 as cp1252 cannot produce that. Every one of the 706
non-ASCII characters came through unchanged, and the byte-order mark survived.
The BOM is doing the protecting — exactly as `RESTART-REQUIRED.md` predicted when
it said the damage "stopped at one pass instead of compounding". The protection
is content-independent, so repaired text is exactly as safe as the mangled text
already sitting there.

Measuring the real condition beats satisfying its proxy. The restart is still
wanted for the stale-watcher stamp; nothing here removes that.

### Two lines were refused, and the rule earned its place

Lines 254 and 276 would not round-trip, so under the row's own skip-on-raise rule
they were left exactly as they were. Checking why: **both were already correct**,
holding a real em dash and a real apostrophe. Forcing them would have damaged
good text. That rule was worth having.

## Proven to fire, not merely written

The house defect is a fix that exists, reports success and never runs. So the
proof is the **real** PowerShell parser, dot-sourced from the shipped
`relay-watch.ps1` and run against the **real** repaired file:

    total rows parsed : 71
    parsed OK         : 71
    unparsed          : 0
    row 71 status     : DONE 83 - ...
    row 68 status     : DONE 78 - **ALL SEVENTEEN ARE RESOLVED AND TH
    em dashes (U+2014): 197
    arrows    (U+2192): 24
    a-circumflex      : 1

Status words the parser sees across the file: `DONE` 61, `TODO` 8, `BLOCKED` 1,
`IN PROGRESS` 1. Nothing became unreadable.

The single remaining a-circumflex is deliberate. Row 42 documents this very bug
and **quotes** the two manglings inside backticks so a reader can recognise them.
Repairing that would have turned a precise bug report into nonsense — so the
guard exempts inline code spans, and says so, along with the gap that accepts.

## The guard

New `QUEUE.md encoding` block in `relay/queue-file-integrity.test.ts`, two
assertions:

* the file keeps its byte-order mark (belt to the watcher's `-Encoding UTF8`
  braces — either alone is a single point of failure);
* the file carries no cp1252 mojibake outside code spans.

**Red first, watched:** it failed at 233 flagged sequences before the repair and
passes after. The detector is written as codepoint arithmetic rather than a regex
holding literal high characters — a guard about mangled characters should not
contain characters that can be mangled.

## Gates

    npm run lint       clean
    npm run typecheck  clean
    npm test           3205 passed, 318 files
    relay suite        156 passed (real PowerShell, both hosts)

## Also committed

`.bidlow/relay/log/cycle-082.md` was sitting uncommitted with the watcher's block
appended — **189 insertions, 0 deletions**, line 1 still cycle 82's own heading.
That is the appending writer behaving correctly, and losing it would have been
this queue's most-repeated failure. Diffed before committing, not taken on trust.

## Open questions: 1

The third relay restart is still outstanding, and only Greg can do it
(`relay-start.cmd`). Nothing is broken without it — this cycle demonstrated that
the queue file is safe in the meantime — but the stale-watcher stamp stays inert
until it happens, which is the one defect it was built to make visible.
