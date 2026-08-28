# Cycle 63 — row 51: the thing overwriting the logs was the log-writer

**Outcome: cause confirmed, fixed, held by a red-first test on both PowerShell
hosts, and one already-committed casualty found on `main` and restored.**

The brief asked me to treat the mechanism as UNKNOWN and confirm it before
changing code. That was the right instruction and I want to record that the
suspicion in it — "a watcher post-run hook is the obvious suspect" — was half
right and half wrong in a way that mattered. It is the watcher. There is no hook.

## It reproduced before I went looking for it

`git status` at the start of this cycle showed `.bidlow/relay/log/cycle-062.md`
MODIFIED. Not by me. The 227-line log cycle 62 wrote was sitting on disk as a
177-line file beginning:

```
# Cycle 62 - finished

Work happened. Evidence: a git ref moved, so something was committed; ...
Started 2026-08-28 09:11:56, took about 38.9 minutes.
How it ended: exit code 0.
```

So the very first thing this cycle did was watch the bug happen to the previous
cycle's log. I copied both versions aside before touching anything, then restored
the real one from HEAD.

## The mechanism

`relay-watch.ps1` picks the filename at the START of a cycle:

```powershell
$logFile = Join-Path $LogDir ("cycle-{0:d3}.md" -f $cycle)   # line 1556
```

and writes it at the END:

```powershell
@( ... ) | Set-Content -Path $logFile -Encoding utf8          # was line 1746
```

`Set-Content` truncates. **Two writers, one filename.** A cycle also writes its
own account of itself to that exact path while it runs — that is the document
Greg actually reads, and the last nine run to 130–230 lines. The watcher's write
happens after the agent's process has exited, so the watcher always wins.

**What replaced the log was never a copy of it.** The stub is boilerplate + the
brief + `$output`, and `$output` is only the agent's LAST message on stdout, not
the file it wrote. When that last message was short, the whole record collapsed
to the 101-line "Work happened."

## The row's open question, answered

The brief flagged that "the 04:23:44 timestamp does not cleanly match cycle 56's
own start, so do not assume it". It does not need to. That value is `$started`
(line 1733) — **cycle 55's own start time**, written into cycle 55's own log. The
brief was comparing it against cycle 56. There is no third process, no hook, and
no timestamp anomaly to explain.

## It is not a near miss any more

The brief was written believing only the working tree had been clobbered. I
audited every `cycle-*.md` blob on every local and `origin` branch — 65 blobs.
Exactly one path carries two shapes:

| | `main` | `feat/privacy-terms-pages` |
|---|---|---|
| `cycle-056.md` | **119-line stub** | **145-line real log** (`72977429`) |

**`cycle-056.md` on `main` is a stub.** And cycle 56 is the cycle that *found*
this bug: it caught 054 and 055 being clobbered in its working tree, rescued
both, and lost its own log to the same defect on the way out. Nobody noticed for
seven cycles.

Restored in this PR as both halves — the real log first, the watcher's record
underneath, and a note in the file saying plainly that cycle 63 repaired it and
where the content came from.

Cycles 1–53 being watcher-shaped is legitimate: agents did not write their own
logs before cycle 54, so for those the watcher's record is the only record and
nothing was lost. Cycles 4/22/38/42 are the seven-line "interrupted" notes, and
that path was already append-safe.

## The part I did not expect: a green test was pushing the loss into git

`relay/cycle-log-reaches-git.test.ts` deliberately fails cycle N+1 until it
commits cycle N's log, with the comment "nothing inside cycle N can ever commit
it". That belief is what made committing the stub look correct — the test goes
red naming the file, and the obvious way to make it green is `git add` on
whatever is on disk. So the loss was not merely tolerated, it was **driven by a
passing gate**. That comment now says so.

## The fix

New `Write-CycleLog`. The rule is one sentence: **it never shortens a file.**

- content present → the cycle's words are kept byte for byte, the watcher's
  evidence is appended under a separator
- absent or blank → writes normally, with no misleading "preserved" note
- **unreadable → treated as having content**, because the alternative is
  overwriting something merely unread

I kept the watcher's half rather than skipping the write. It is the part nobody
can fake — exit code, timing, and an evidence verdict derived from what moved on
disk rather than from what the cycle claims about itself. Preserving one record
by discarding the other would just move the loss somewhere quieter.

## Red first, on both hosts

`relay/cycle-log-preserved.test.ts` dot-sources the REAL shipped script with
`-LoadOnly` and drives the REAL function under `pwsh` and `powershell` 5.1 — not
a TypeScript re-implementation, and not a check that the source text no longer
says `Set-Content`, either of which would be this repository's house defect in a
lab coat.

Proven capable of failing by restoring the old truncating write:

```
× keeps a log the cycle already wrote, byte for byte
  → the cycle's own log lost the line "# Cycle 62 — queue row 69"

- # Cycle 62 — queue row 69
+ # Cycle 62 - finished
+ Work happened. Evidence: a git ref moved, so something was committed.
```

11 red → 15 green.

## The test earned its keep on its first run

It caught a defect I had just introduced. A **mandatory** `[string[]]` parameter
applies `ValidateNotNullOrEmpty` to each ELEMENT, so PowerShell refused to bind
the blank lines the real call site passes:

```
Write-CycleLog : Cannot bind argument to parameter 'Lines' because it is an empty string.
```

Shipped without `[AllowEmptyString()]`, the watcher would have **thrown instead
of writing any log at all** — a worse version of the bug I was fixing. Lint,
typecheck and any source-text assertion would all have passed it. Only running
the real function under a real host caught it, and it failed under both.

## Assume the seventh exists

Not "it exists" — it fires:

- `relay-watch.ps1` parses clean, 6601 tokens, under both hosts
- the exact real call-site array shape (blank lines and all) round-trips both
  halves under `pwsh` and `powershell` 5.1
- row 51 checked with the relay's **own** `Get-QueueRows`: parses, 0 unreadable
  rows in the whole 76-row queue, picker advances to #50

This log is itself the next proof. With the fix in, the watcher should append its
record underneath these words rather than replacing them — if cycle 64 opens and
`cycle-063.md` still starts with this heading, the fix held in production.

## Gates

lint 0 · typecheck 0 · **2932 tests / 296 files green** (up 15).

`relay/powershell-timeout-budget.test.ts` went red until I registered the new
spec in its explicit list. That is that guard working exactly as designed, and I
added the file rather than loosening the check.

No app code, no schema, no migration, nothing that sends.

## The PR sweep

`gh pr list --state open` returned **nothing**. Cycle 62 cleared all four and
none have been opened since, so there was no sweep to do this cycle.

## Not done, and deliberately

`cycle-057.md` is watcher-shaped with no agent version on any branch. That cycle
**timed out** — killed at the 45-minute deadline — so it most likely never got as
far as writing its own log. But I cannot prove that, and if it did write one, that
log is unrecoverable. I am recording it as an unproven possible loss rather than
rounding it to "clean".

## Open questions for Greg: 0
