# Cycle 96 — row 85, the sign-in window that closed two months ago

## PR sweep at cycle start

`gh pr list --state open` returned `[]`. Nothing open, nothing to merge. Cycle 95
closed its own PR (#375) before ending, which is the behaviour the sweep exists
to enforce.

## The row was right about the defect and wrong about the evidence

Row 85 asked for one thing before any code: **measure `oauthStateExpiresAt` on
the 8 stranded rows**, because "cycle 64 only added that column recently, so the
8 existing rows probably have it NULL", and decide explicitly what NULL should
say rather than letting it fall through.

That instruction was right, and following it is what stopped this cycle building
the wrong thing. The premise behind it is backwards:

* Cycle 64 (`bdf11ea`) added the **check**, `isMailboxOAuthStateExpired`. It did
  not add the column.
* `oauthState` and `oauthStateExpiresAt` shipped **together**, on 2026-04-20, in
  `20260420120000_mailbox_oauth_connection` — a single migration, verified by
  grepping every migration in the repo for either name and finding exactly one
  file.
* `prepareMailboxOAuthConnection` has written the expiry beside the state, in the
  same update, ever since.

So every row prepared in the last four months carries a real expiry, and the 8
stranded rows are all aged 67 days or less. The prediction could not have held.

## The measurement

`gh workflow run mailbox-credential-probe.yml`, **run 33245630085**, read-only,
against production, 2026-08-29 09:30 UTC. The probe already *selected*
`oauthStateExpiresAt` and had never printed it, so the first change of the cycle
was to make it report the fact the row turns on.

**All 8 stranded rows hold a real expiry. All 8 have CLOSED. Not one is NULL.**

| workspace | provider | window closed | age |
|---|---|---|---|
| protech-roofing | MICROSOFT | 2026-06-29T11:09:26.937Z | 60 d |
| protech-roofing | MICROSOFT | 2026-06-22T09:48:01.492Z | 67 d |
| chevron-security | MICROSOFT | 2026-06-30T11:07:27.779Z | 59 d |
| chevron-security | MICROSOFT | 2026-06-30T11:07:48.882Z | 59 d |
| panda-recycling | MICROSOFT | 2026-06-29T11:03:20.023Z | 60 d |
| opensdoors | MICROSOFT | 2026-07-03T11:32:30.853Z | 56 d |
| greentheuk | GOOGLE | 2026-07-02T08:53:50.962Z | 58 d |
| greentheuk | GOOGLE | 2026-08-26T15:06:34.098Z | 2 d |

27 of 55 live mailboxes can send — unchanged from cycles 73 and 95.

Worth noting for a later cycle: the closure dates track the `updatedAt` ages
cycle 95 used as a proxy, to the day, in all eight cases. `oauthStateExpiresAt`
is the better signal of the two, because it is not a proxy at all — it is
definitionally the moment `prepare` ran, plus fifteen minutes.

## What was built

The window is open **exactly** when the shipped `isMailboxOAuthStateExpired` —
the predicate both OAuth callbacks apply before they will accept a returning
sign-in — says the callback would accept the round trip.

That shared predicate is the whole of it. It means the screen offers to finish a
sign-in precisely when the server would accept one, so it can never invite an
operator into a round trip that is already refused. A local copy of the same
arithmetic would be free to drift, and drift here means lying to an operator. A
property test drives the equivalence across a long-closed window, one
millisecond past, the inclusive boundary, an in-flight window, and NULL.

* **Open** → unchanged. "Needs approval / Finish sign-in in the Microsoft or
  Google window, or press Connect again." Correct for those fifteen minutes, and
  pinned by a must-not-change test.
* **Closed** → "Sign-in never finished", naming the date it closed and saying
  that a fresh Connect is what is needed.

### The NULL decision, made rather than defaulted

NULL reads as **closed**. Two independent grounds, both provable from shipped
code rather than assumed:

1. `isMailboxOAuthStateExpired(null)` is `true`, and both callbacks gate on it
   *first*. The server would refuse a returning sign-in on such a row outright.
   Telling an operator to go and finish it would be telling them to do something
   the product refuses.
2. Every writer of `oauthStateExpiresAt: null` in this codebase — both callbacks
   on success and on every failure, the provider-change path, the
   remove-from-workspace path, the prepare-failed paths — moves the row off
   `PENDING_CONNECTION` in the *same* update. The pairing is one the current code
   cannot produce.

So it is a **defensive** branch, not a live one, and the honest consequence is
that it must not fabricate a closure date it does not have. Its copy says there
is no sign-in in progress and to start a fresh one; a test asserts the sublabel
contains no four-digit year, so a future edit cannot quietly invent a date.

### Three call sites, not the one the row named

The row named `mailboxRowOperatorStatus`. The identical sentence also sat in
`providerConnectionHint`, and `connectActionLabel` rendered **"Complete
sign-in"** — a button promising to *resume* a flow that is gone.

Fixing the status label and leaving the same sentence one function along is the
"known identical hole in the sibling writer" that cycle 94 called a false claim.
All three now read one shared `pendingConnectionStatus`, so a row's status badge
and its expanded hint cannot tell an operator two different stories.

### Dates in UTC, deliberately

Formatted from UTC parts rather than `date-fns` or `toLocaleDateString`. This
module renders inside a client component: a timezone-dependent format produces
one date on the server (Azure runs UTC) and another in a London browser on a
late-evening timestamp — a hydration mismatch on a date the operator cannot
check. One timezone, one answer. A test pins it with 00:30 UTC on 3 July, which
is 2 July in New York.

## Red first

`src/lib/mailboxes/mailboxes-operator-model.test.ts` — **4 failed, 26 passed**
before the implementation.

The 26 that passed are the point of them: an in-flight sign-in still reading
exactly as it does today, CONNECTED and DRAFT rows unaffected by a stale expiry,
and a deleted account still outranking a closed window (there is no sign-in to
start for an account that no longer exists, so "press Connect" must not be
offered to it). All green throughout.

One pre-existing assertion had to change, and it is worth recording why rather
than burying it. `it("uses plain labels for key states")` built a
`PENDING_CONNECTION` row with **no expiry at all** and asserted "Needs approval".
That is precisely the state eight production mailboxes had been sitting in for up
to 67 days — the test was encoding the defect. It was corrected to supply a live
window for the "Needs approval" case, preserving its original intent, and a
second assertion was added for the dead-window copy so the PR #139 guard against
"mailbox owner" jargon now covers both sentences. Corrected, not weakened.

## Proven to fire, not merely to exist

The house defect this repository is worst at is machinery that is built, wired,
reports success and never fires. Unit tests prove the rule over fixtures;
fixtures cannot say what a production row will render.

So the probe now renders each real stranded row through the **shipped**
`pendingConnectionStatus` and prints the exact sentence the operator will see.
**Run 33246187533**, read-only, against production:

```
operator sees: "Sign-in never finished" — The sign-in window closed on 29 Jun 2026
and can no longer be completed. Press Connect to start a fresh sign-in — someone
who can sign in to this mailbox has to finish it.
```

All eight rows print it, each with its own true closure date — 29 Jun, 22 Jun,
30 Jun, 30 Jun, 29 Jun, 3 Jul, 2 Jul and 26 Aug 2026. Not one still reads "Finish
sign-in in the Microsoft or Google window."

## Gates

| gate | result |
|---|---|
| `npm run lint` | 0 |
| `npx tsc --noEmit` | 0 |
| `npm test` | 3626 passed, 347 files |
| `npm run build` | green (webpack) |

No schema, no migration, no client data moved, **no email sent**. Nothing in
this cycle touches the send path.

## Deliberately not done

* **Row 86** — a failed reconnect demoting a mailbox whose stored credential may
  still be good — lives in the OAuth callbacks and is a credential-lifecycle
  concern, not a labelling one. Left alone, exactly as cycle 73 left this row.
* The eight mailboxes are still off the air. Nothing here reconnects them, and
  nothing can: that needs each mailbox owner to sign in at their provider. Row 84
  is BLOCKED on Greg for that, and cycle 95 already routed it into his daily
  digest.

## Open questions for Greg

None new. The two standing ones from row 84 are unchanged and still his:
chasing the eight reconnects across five workspaces, and whether to publish the
Google OAuth app. What this cycle changed is that when somebody does go and look
at one of those rows, the screen now tells them the truth about it.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 96 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited; these files named in the brief changed on disk: src/lib/mailboxes/mailboxes-operator-model.ts.

Started 2026-08-29 10:27:19, took about 40.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: src/lib/mailboxes/mailboxes-operator-model.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 96 - queue item 85

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A MAILBOX PENDING FOR SIXTY DAYS STILL TELLS THE OPERATOR TO "FINISH SIGN-IN IN THE MICROSOFT OR GOOGLE WINDOW", AS IF SOMEBODY WERE STANDING AT IT.** Found by cycle 73 while measuring row 74, not looked for, and deliberately NOT fixed there - row 74 was a credential-lifecycle change and this is a labelling one. `mailboxRowOperatorStatus` (`src/lib/mailboxes/mailboxes-operator-model.ts`, the PENDING_CONNECTION branch) returns label "Needs approval" with sublabel "Finish sign-in in the Microsoft or Google window, or press Connect again." That is correct for the 15 minutes the OAuth state is alive and misleading afterwards. The probe found 8 rows in this state aged ~2 to ~67 days, each reading as though a sign-in window were open. **Candidate signal, and check it before building:** `oauthStateExpiresAt` in the past plus PENDING_CONNECTION means the window has definitively closed and nobody is coming back - honest, provable, already on the row. **But cycle 64 only added that column recently, so the 8 existing rows probably have it NULL** - MEASURE that first with the probe before designing round it, and decide explicitly what a NULL expiry should say rather than letting it fall through. Same defect class as the dead-mailbox labels cycle 7 corrected: telling an operator to do something impossible is worse than saying nothing.

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
  `DONE 96`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 96 - ...** |` reads correctly.
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

* Finished it -> `DONE 96 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 96 - <what is done, what is left>`. PARTIAL
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

`.bidlow/STATE.md` is updated and merged (`c650218`, PR #377, green CI). Zero open PRs.

The entry records:

- **What changed** — row 85 shipped as `d3db9f1`, deployed and verified by hash; the misleading "finish sign-in" copy fixed at three call sites, not just the one the row named.
- **What's half-done** — nothing from this cycle. Row 84 stays BLOCKED on you (the eight reconnects need each mailbox owner at their provider); rows 86 and 87 were deliberately left, with the reason and the case to prove each with.
- **Decisions** — NULL-reads-as-closed and why it must not invent a date; UTC date formatting and the hydration reason. Flagged explicitly as **not a one-way door**: copy and a view-model only, no schema, no migration, fully revertible.
- **Contradiction found** — row 85's premise was backwards. Cycle 64 added the *check*, not the column; both oauth columns shipped 2026-04-20. Measuring first is what caught it, and QUEUE.md now carries the correction inline.
- **Pick up first** — row 86, then row 87; row 84 is yours; the watcher restart is still outstanding.

One thing worth your attention beyond this cycle: **cycle 95 wrote no STATE entry, and left its log uncommitted** in the working tree. I committed it. That's the second time a cycle's record has nearly been lost this way — the same failure mode cycle 70 hit — so it may be worth a queue row of its own.

Nothing contradicts `PROJECT.json`. The hard rule was never approached: no send, no delete, no client data touched.

