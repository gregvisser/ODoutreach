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
