# Cycle 79 — queue row 38: cycle logs, git, and the precondition that stopped being checked

## Sweep first

`gh pr list --state open` found **one** PR: **#347** (`docs/cycle-078-row-37`,
cycle 78's record of row 37), sitting at `BLOCKED` with both checks
`IN_PROGRESS`. Not red — just not finished yet. Left it running, did the
reconnaissance, came back: `verify` **pass 5m11s**, `E2E (Playwright)`
**pass 5m38s** (run `33222410969`). Merged it — squash **`348f839`**.

That merge matters to this row rather than being incidental housekeeping: #347
was carrying `cycle-077.md` and `cycle-078.md`, so until it landed, two cycle
logs existed only on a branch. **Zero PRs open at the end of this cycle.**

## The row was stale by about a day

Row 38 describes `.gitignore:107` as ignoring `/.bidlow/relay/log/`. It does not.
**Cycle 53 already resolved this**, in PR **#300** (`fix/cycle-logs-reach-git`),
squash **`d7989be`**, merged **2026-08-28 06:11:44Z**.

The decision it recorded, for the record, since the row asked for WHICH and WHY:

* **Chosen: TRACK the logs.** Not "enforce QUEUE.md as the only durable channel".
* **The ignore rule was narrowed, not deleted:** `/.bidlow/relay/log/*` plus
  `!/.bidlow/relay/log/*.md`. Only the markdown record is kept; anything else
  dropped in that folder is scratch and stays ignored. The point of the narrowing
  is that the fix for a red test becomes *"commit the log"* and can never be
  *"add another ignore rule"*.
* **Why not a glob over `.bidlow/**`:** it would sweep in every
  `QUEUE.md.bak-before-*` the relay drops. Same reasoning
  `tracked-artefacts.test.ts` already gives.
* **Guard:** `relay/cycle-log-reaches-git.test.ts`.

## The row's real demand: proved to FIRE, not proved to exist

So I measured it rather than reading the test and believing it. For every log
from `cycle-054.md` to `cycle-078.md`, which commit **added** it:

**25 consecutive logs, every one committed by a LATER cycle, never by its own.**

| log | added by |
|---|---|
| cycle-054 | `d7989be` (#300) — the fix itself |
| cycle-063 | `3d7fef6` (#313) |
| cycle-071 | `a0439a9` (#331) |
| cycle-076 | `7ceeae3` (#344) |
| cycle-077, cycle-078 | `53e49d1`, merged this cycle as `348f839` |

The mechanism is that the newest log is **deliberately not exempt**. The watcher
writes cycle N's log after that agent has exited, so nothing inside cycle N can
commit it; `npm test` is a mandatory gate, so cycle N+1 opens with a RED test
naming cycle N's log. Exempting the newest would have made the test unable to
fire at all. That is a guard with 25 receipts.

## The three measurements, re-run at 77 logs (cycle 53 measured 55)

* **(a) Credential-shaped strings: ZERO**, across all 77 logs, over 12 distinct
  shape patterns. Before trusting that, I proved the scan *can* match — three
  planted credentials, three hits. A clean result from a scanner that cannot
  match anything is exactly this repo's signature defect.
* **(c) Volume: 688,239 bytes**, ~8.9 KB per log. Still negligible. The ~2×
  growth since cycle 53 is longer logs, not more of them.
* **(b) Findings never mirrored into QUEUE.md: not re-derived.** It existed to
  choose between the cheap and the expensive fix; that choice is made and
  shipped. The genuine residual — tracking a log does not make anyone *read* it —
  is held open on purpose as **row 40**, and folding it in here would be quietly
  calling it fixed.

## What was actually wrong, and what this cycle built

Precondition (a) of this row — *scan before tracking, because the object store is
irreversible* — was done **once, by hand, over 55 files**. Then the checking
stopped and the thing it authorised kept running. **Another 26 logs went into the
object store permanently, scanned by nothing.**

And the exposure is worse than merely unguarded, because of what the tracking
test does. It goes RED until the previous cycle's log is committed. So if a cycle
ever pastes a live token into its log while narrating a gate failure, the guard
does not *permit* that token into git — it **forces** it there, and a push makes
it unrecallable. **The safety mechanism was also the delivery mechanism.**

**Fix:** `relay/cycle-log-reaches-git.test.ts` gains
`describe("cycle logs carry no credentials")` — 12 shape patterns: GitHub token,
GitHub fine-grained PAT, AWS access key id, Google API key, Anthropic key,
OpenAI-style key, Slack token, PEM private key, JWT, connection string with an
inline password, Sentry DSN including its key, and a secret env var assigned a
real value.

**Shape-based, never name-based, and that is the whole design.** A cycle log is
prose about the build; it names `DATABASE_URL` and `GOOGLE_CLIENT_SECRET`
constantly and must stay free to. It is barred only from carrying the **value**.
Every pattern was run against all 77 real logs *before* being encoded, and
returned zero, so the gate starts green on true history rather than being
switched on over a pile of exceptions.

## Proved it fires, both directions

**RED first.** Appended a `DATABASE_URL` assignment holding a Postgres
connection string with an inline password (not reproduced here — see the next
section for why) to a real cycle log, and watched it fail, naming the exact spot:

```
.bidlow/relay/log/cycle-078.md:297 — connection string with an inline password
```

Then restored the file byte-for-byte and watched **6/6 green**.

### The gate's first real firing was on this log

Worth recording, because it is the strongest evidence in this cycle and it was
not planned. The first draft of *this file* quoted the probe string verbatim, to
document what had been tested. Running the suite went **red**:

```
.bidlow/relay/log/cycle-079.md:99 — connection string with an inline password
```

So the gate caught a credential-shaped string in a real cycle log, written by a
real cycle, on the first cycle it existed — and it caught it **before** the log
was committed, which is the only point at which catching it is worth anything.
The string was redacted to prose and the suite went green.

Note also what did *not* work as an escape: writing the placeholder form with
`<user>` and `<password>` still matches, and should. A pattern that waved through
anything with angle brackets in it would be trivially defeated by a real
credential that happened to sit next to one. The right move is to describe the
shape in words, which is what this file now does.

It also carries a companion assertion that the pattern set matches a synthetic
all-credentials sample, so the scan can never report "clean" because a regex was
mistyped. The failure message says **redact AND rotate**, because deleting the
line is not a fix once it has been committed.

## Gates

* `npm run lint` — **0**
* `npm run typecheck` — **0**
* `npm test` — **3162 passed / 316 files**
* `npx vitest run relay/` — **113 passed / 8 files** (confirms the queue parser
  still reads row 38's new status cell)

## Honest limits, stated rather than rounded up

The **tracking** assertion can only fire **locally**. CI checks out tracked files,
so an untracked log does not exist there to be caught. The **credential scan**
does run in CI, but only over logs already committed — which is one push too
late to help. Both therefore rest on `npm test` being run inside the cycle. That
is the mandatory gate, and the 25 receipts above are evidence it is genuinely
happening rather than assumed.

Nothing here touches the send pipeline, any client data, or any migration. No
email was sent.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 79 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 01:06:25, took about 12.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: relay/tracked-artefacts.test.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 79 - queue item 38

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **CYCLE LOGS ARE GITIGNORED, SO ANY FINDING WRITTEN ONLY TO A LOG IS LOST - AND ONE ALREADY WAS.** `.gitignore:107` ignores `/.bidlow/relay/log/`. Cycle 52 handed this up as a structural finding rather than a nuisance: cycle 50 reported a hard E2E failure as a side finding, wrote it only to its own cycle log, and the report existed nowhere durable - so cycle 52 had to re-derive the whole thing from scratch. That is a full cycle of rework caused by the file layout, not by anyone's mistake. **This is contested design, not an obvious bug: the ignore rule sits deliberately in the "local and transient" block beside `NEXT.md`, `CURRENT.md` and `STATUS.json`, and `relay/tracked-artefacts.test.ts` documents at length why a glob over `.bidlow/**` was rejected.** So MEASURE BEFORE CHANGING: (a) scan all 53 existing logs for credential-shaped strings before putting any of them in git - a gate log can contain a token, and tracking is irreversible in the object store; (b) count how many existing logs contain a finding that was never mirrored into QUEUE.md, because if the honest answer is one, the cheap fix wins and the expensive one is not justified; (c) measure the total size of the log directory. Then decide between tracking the logs and enforcing QUEUE.md as the only durable channel, and record WHICH and WHY. **The trap in this row is the project's worst defect class: deleting the ignore line makes logs trackable, it does not make them tracked.** A log the watcher never commits is still invisible to a rebase and still `git clean -fd`-able. Whatever is chosen must be proved to FIRE on a real cycle, not proved to exist.

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
  `DONE 79`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 79 - ...** |` reads correctly.
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

* Finished it -> `DONE 79 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 79 - <what is done, what is left>`. PARTIAL
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

Correcting my earlier report: PR #348 is **not** resolved. The first poll returned "no checks reported" — a transient gap while my STATE.md push superseded the original run — and my loop treated that as a resolution. It wasn't one.

Actual state: run `33223148754` is pending on the STATE.md commit (`800f946`). I'm polling again, this time requiring an explicit `pass` or `fail` rather than merely the absence of `pending`, so a reporting gap can't be mistaken for a verdict.

That misread is worth noting for the record, because it's the same defect class this cycle's whole finding is about: a check that reported success without having observed the thing it was checking. I'll merge once CI genuinely returns green.

