# Cycle 75 - queue row 47, the grade record could not say WHEN a blocker was closed

## In one sentence a non-coder can check

The file that decides whether this product may be sold can now record the DATE
an obligation was met - and the signed-DPA evidence that row 47 said "should
not be thrown away" had **already been thrown away**, so this cycle dug it back
out of git and put it back.

---

## The pull request sweep

`gh pr list --state open` returned nothing. Cycles 71-74 cleared the seventeen
Greg counted and have not rebuilt the pile. Two minutes, and the right two.

---

## The four things, written before touching anything

1. **Files.** `src/lib/grade-record.ts`, `src/lib/grade-record.test.ts`,
   `.bidlow/GRADES.json`, `.bidlow/relay/QUEUE.md`.
2. **The red-first test.** `src/lib/grade-record.test.ts`, asserting the real
   `.bidlow/GRADES.json` parses. Restore CR-05 FIRST and watch the exact
   reported failure before changing any schema.
3. **Done.** The grade record can say when a blocker was closed, and CR-05
   shows the signed Sentry DPA instead of an open job.
4. **Not touched.** CR-06 or any other blocker, the scores, the sell gate,
   `cycle-074.md` (dirty before I arrived and not mine).

---

## The row's premise was stale, and that mattered

Row 47 said the grade gate was **red in the working tree** because a modified
`.bidlow/GRADES.json` was sitting there uncommitted. It was not. `git status`
showed the file clean, `npm test` on that spec was **10/10 green**, and there
was no `closed_on` anywhere in the file.

The dirty copy had been discarded at some point between cycle 55 and now. So
the content the row explicitly warned "is GOOD and should not be thrown away"
**had been thrown away**, and nobody noticed, because discarding it made the
gate go green. A red gate announces itself. A silently reverted file does not.

This is worth naming: the row was correct about the diagnosis and wrong about
the state, and the wrong half was the urgent half.

---

## Recovering it

Not in any of the five stashes. Found by walking every dangling git object for
the string `closed_on`:

```
git fsck --lost-found | grep 'dangling commit' | awk '{print $3}' \
  | while read c; do git rev-parse "$c:.bidlow/GRADES.json" ...
```

Blob `372c0dd`, reachable from dangling commit `810ab77`:

```
810ab77 2026-08-28 05:06:03 +0100 WIP on feat/privacy-terms-pages: 525d68d ...
```

That is **cycle 55's own `git stash -u`** - the one row 47 describes running to
prove the failure was pre-existing. The stash was later dropped; the commit
object survived. Provenance matches the row exactly.

---

## The trap in the recovered file

The obvious move - restore the recovered file - would have been wrong, and
quietly so.

A field-by-field diff against HEAD showed the recovered file is **older** than
HEAD on blocker **CR-06**:

| | HEAD | recovered |
|---|---|---|
| CR-06 status | `CLOSED` | `OPEN` |
| CR-06 evidence | cycle 62's Sentry fix | `null` |
| scorecard[8] | + cycle 62 note | (no note) |
| CR-05 | `OPEN`, no evidence | `CLOSED` + DPA + `closed_on` |

Restoring it wholesale would have **silently reopened a blocker cycle 62 had
fixed** and deleted its evidence, while looking like a pure recovery. HEAD is
strictly newer everywhere except CR-05, so only CR-05 was cherry-picked.

---

## Red first, properly

CR-05 was restored **before** any schema change, and reproduced the reported
failure exactly:

```
Tests  4 failed | 6 passed (10)
ZodError: unrecognized_keys, path ["customer_ready","blockers",5]
         "Unrecognized key: \"closed_on\""
```

Four failures, blocker index 5, the same message the row quotes. Then the
field was added: **16 passed (16)**.

### The two new guards were proven capable of failing

They were written green, so they were each broken on purpose. This repository's
worst defect is something that reports success and never fires.

| Break | Result |
|---|---|
| Delete the ISO regex | only *"refuses a date that is not an ISO date"* went red |
| Neuter the `.refine` | only *"refuses a closing date on a blocker that is still OPEN"* went red |

One red test apiece, no collateral - which is also evidence the tests are
testing what their names claim.

---

## The design call

`closed_on` is **optional**, not required on every CLOSED blocker. Most blockers
are closed by a commit and the commit carries its own date; demanding a
hand-typed date there invents a second source of truth for something git already
knows. It earns its place on blockers closed by something **outside this
repository** - CR-05 is a signed Art.28 DPA - where the date exists nowhere else.

It is ISO-validated so it cannot drift into prose, and refused on a blocker that
is still `OPEN`. A closing date on an open item is the same contradiction class
this module was built for: the 6.8-vs-4.0 defect was a number and a verdict that
had stopped agreeing.

Also dropped the now-answered CR-05 line from `questions_for_greg` (2 -> 1).
Leaving a "do this next" for something already done recreates the exact drift.

---

## I stashed my own work, the same way cycle 54 lost theirs

Writing the commit message in a bash heredoc, I included the literal text
`` `git stash -u` `` - inside backticks. Bash ran it. Command substitution
stashed every file I had just changed, and `git commit` reported *"nothing added
to commit"*.

Recovered in one `git stash pop`, verified intact (16/16), and committed from a
message **file** instead. But the irony is the useful part: **this is the same
mechanism that destroyed cycle 54's DPA evidence in the first place** - a
`git stash -u` whose contents nobody came back for. It is a genuinely easy
accident, which is the argument for `-F <file>` over `-m` for any message
containing backticks.

---

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean, strict |
| `npm test` | **3128 passed / 314 files** |
| CI on PR #341 | `verify` pass 5m3s, `E2E (Playwright)` pass 5m3s |

Merged as **`3a35000`**. No migration, no client data, no email - none of the
three stop-and-ask conditions. `grade-record.ts` has **no runtime importers**;
it is a CI-gate module, so the running app is unchanged by this.

Scores untouched. CR-05 is owner `greg`, which by the schema's own rule does not
count against the grade, so customer-ready stays **7.4** and the sell gate stays
**NOT SATISFIED**. Closing it moved the record's honesty, not its number.

---

## For Greg - one thing to confirm

The DPA evidence is restored **verbatim as cycle 54 wrote it**, including the
claim it was "observed on screen at the moment of signing". This cycle recovered
that text from git; it did **not** witness the signing, and it cannot.

The record now asserts a real-world compliance action - Sentry DPA v5.1.0
accepted 28 Aug 2026, org `bidlowai`, EU storage region. Worth one look at
<https://bidlowai.sentry.io/settings/legal/> to confirm the record is true
before anything relies on it. Restoring a prior cycle's observation is not the
same as verifying it, and the standing rule against claiming a real-world action
the software did not perform cuts both ways.

---

## Open questions: 1

Was the Sentry DPA actually signed as cycle 54 recorded? Everything else in
this cycle is proven by output shown above; that one line is the only claim
resting on a previous cycle's word.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 75 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: src/lib/grade-record.test.ts, src/lib/grade-record.ts.

Started 2026-08-28 23:12:12, took about 27.5 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/GRADES.json, src/lib/grade-record.test.ts, src/lib/grade-record.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 75 - queue item 47

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE GRADE GATE IS RED IN THE WORKING TREE AND IT IS ONE MISSING SCHEMA KEY.** Found by cycle 55 when `npm test` reported 4 failures that were nothing to do with its own work. `.bidlow/GRADES.json` is modified-but-uncommitted (it was already dirty at the start of cycle 55, so it is cycle 54's or an earlier cycle's work) and `src/lib/grade-record.test.ts` fails 4 tests against it with `customer_ready.blockers.5: Unrecognized key: "closed_on"`. **Proven to be pre-existing and NOT cycle 55's doing:** `git stash -u` then re-running that spec = 10/10 passing on clean HEAD; unstash = red again. The content being rejected is GOOD and should not be thrown away - blocker **CR-05** now carries real signed-DPA evidence (Sentry DPA v5.1.0 signed 28 Aug 2026 in org `bidlowai`, EU storage region confirmed; Resend and RocketReach bind via their ToS) plus a new `closed_on: "2026-08-28"` field. The zod schema simply does not allow `closed_on`. **FIX: add the optional `closed_on` field to the blocker schema in `src/lib/grade-record.ts` (or wherever the schema lives), then commit GRADES.json.** Until someone does, the next cycle that runs `git add -A` will push a red gate to CI. Cycle 55 deliberately did NOT commit that file for exactly that reason and staged only its own eight files by name.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

## FIRST, BEFORE ANY NEW WORK: CLEAR THE GREEN PULL REQUESTS

Do this at the START of every cycle, before you read the item below. It takes two
minutes and it is the difference between a queue and a landfill.

`gh pr list --state open` then, for every PR whose checks are GREEN: bring the
branch up to date if branch protection requires it, and MERGE it. Greg counted
SEVENTEEN open on 2026-08-28 and most were green - they had simply been opened and
abandoned.

**Understand WHY this happens, because it is structural and not laziness.** A
cycle finishes its work, opens a PR, and ends. CI takes about five minutes. Nobody
ever comes back. So every cycle adds one and removes none, for ever. The only
place that can be fixed is here, at the start of the NEXT cycle.

Rules for the sweep:
* RED PRs are not yours to force. Read the failure, and either fix it as part of
  this cycle or say in your log why you left it.
* Merge order matters: branch protection requires each branch to be current, so
  every merge invalidates the next one. Take the docs and `.bidlow` record PRs
  first - they cannot conflict with code - then the code ones, updating as you go.
* `gh pr merge --auto` is better than update-then-race if auto-merge is allowed.
* A DESTRUCTIVE migration is still Greg's. Additive is yours.
* If a PR is genuinely not ready, say so in a comment on it, so the next cycle
  does not have to work that out again.

## Before you touch anything, write these four things down

1. **The files you are going to change.** Name them. If you cannot yet, your
   first job is to find out, and that reconnaissance IS the cycle.
2. **The red-first test.** Name the test file and what it asserts. Watch it FAIL
   before you make it pass. If the behaviour cannot go red first, say why, and
   prove the test is capable of failing by deliberately breaking the code and
   showing the red - that is this repository's established substitute.
3. **What "done" looks like** for this item, in one sentence a non-coder can check.
4. **What you must NOT touch.** Anything outside the files in (1).

## The rules that apply to every cycle

* Do not stall on a question. Decide, record the decision and why, and continue.
  If the decision is genuinely Greg's - money, a client relationship, or one of
  the three named below - stop and write down the question instead. Note what
  changed on 2026-08-27: "an irreversible one-way door" used to sit in this list
  and was read as covering any production merge. It does not. Only (a), (b) and
  (c) below stop you now.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* **MERGING IS YOURS NOW. Greg decided this on 2026-08-27 and asked to stop being
  the bottleneck.** With green CI, MERGE AND DEPLOY WITHOUT ASKING. Do not park a
  finished, green PR and wait for him - a PR left open ROTS: #231 went from clean
  to 36 commits behind and CONFLICTING in a single day, and cost a whole cycle to
  rescue. Leaving it open is not the safe option, it is the expensive one.
* Three things still stop and ask, and they are the ONLY three:
  (a) a DESTRUCTIVE migration - anything that drops or alters an EXISTING table,
      column or type, or backfills over existing rows. Creating a NEW table, a new
      enum, or adding foreign keys to a new table is ADDITIVE and is yours to merge.
      The test is: does dropping what this adds restore today's behaviour exactly?
  (b) anything that touches or moves real CLIENT data.
  (c) anything that causes an EMAIL TO BE SENT. That one is absolute and it is on
      top of the hard rule about `bidlowai`, not instead of it.
  If it is none of those three, you do not need him. Merge it.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 75`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 75 - ...** |` reads correctly.
Anything else does not. The relay reads QUEUE.md with a regex, and a status it
cannot read STOPS THE WHOLE QUEUE, on purpose: refusing to guess is the right
behaviour, and inventing is the one thing this relay will never do.

This is not hypothetical, and it is not pedantry. Cycle 59 built, merged and
DEPLOYED half of row 40 - good work, verified by commit hash - and then wrote its
status as `PARTLY DONE 59`. Two words, one of them not on the list above. The
row stopped parsing, the picker met it first, and the relay took nothing at all
for seventy minutes while eleven jobs waited behind it. `SUPERSEDED` did exactly
the same thing to row 38 the day before.

So, plainly:

* Finished it -> `DONE 75 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 75 - <what is done, what is left>`. PARTIAL
  is TAKEN by the relay, so the next cycle picks the row straight back up. This is
  the right answer whenever you shipped part of a row.
* Could not start -> `TODO - <why>`
* Never invent a seventh word.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.


## What it did

`.bidlow/STATE.md` updated and merged (`b2076f6`, PR #343, CI green).

## What it records

**Built/changed** — `3a35000` (PR #341): `closed_on` on the blocker schema, 6 new tests, CR-05 restored in `GRADES.json`, row 47 marked `DONE 75`. Deployed and verified by hash on the direct App Service URL. Plus `aa54045` (cycle log) and `b2076f6` (STATE).

**Half-done** — nothing. Zero open PRs, all three branches merged and deleted. The only dirty file is `.bidlow/relay/log/cycle-074.md`, which was already dirty before this cycle started and was deliberately left alone.

**Decisions** — `closed_on` optional rather than mandatory on every CLOSED blocker (git already holds the date for commit-closed ones); ISO-validated; refused on a still-OPEN blocker. Scores deliberately untouched: CR-05 is owner `greg`, so customer-ready stays 7.4 and the sell gate stays NOT SATISFIED. **No one-way door touched** — no migration, no client data, no email.

**Next session picks up first** — the one unproven claim shipped: the DPA evidence is restored *verbatim as cycle 54 wrote it*, including "observed on screen at the moment of signing." I recovered that text from a dangling git object; I did not witness the signing. It needs confirming at the Sentry legal page before anything relies on it.

**Contradicts prior records** — two things:
- A previous session note claimed `.bidlow/relay/log/` is gitignored and QUEUE.md was the only durable record. It is **tracked** — `git ls-files` lists cycle-072/073/074. Corrected in STATE.md and in memory.
- STATE.md had no cycle 74 entry at all; that cycle exists only in its relay log.

I also logged the operational lesson: backticks in a bash heredoc ran `git stash -u` and stashed this cycle's work mid-flight — the same mechanism that destroyed cycle 54's evidence. `git commit -F <file>`, not `-m`, for any message containing backticks.

**Open questions: 1** — the Sentry DPA signing, as above.

