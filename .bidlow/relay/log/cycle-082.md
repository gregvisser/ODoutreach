# Cycle 82 — queue item 70

## The short version

**The item was already done when I got it, and I could not have done it: there was
nothing left to close.** `gh pr list --state open` returns `[]`. Not "a few left" —
zero. All four PRs the brief names were resolved on 2026-08-28 between 07:56 and
08:27, by cycles 60 and 61.

So I did not rebase anything. Instead I did the thing the brief's own closing
section asks for and that nobody had done for this row: **I checked that the merged
work actually FIRES in production.** It does. That check is below, and it is the
only new evidence this cycle produced.

## What the brief said, and what is actually true

| The brief said | Actually |
|---|---|
| Four PRs still open | **Zero open.** `gh pr list --state open` → `[]` |
| #302 CONFLICTING, needs rebase | **MERGED** 2026-08-28 08:20 as `88588bd` |
| #301 CONFLICTING, needs rebase | **MERGED** 2026-08-28 08:27 |
| #308 waiting on CI | **MERGED** 2026-08-28 08:12 |
| #292 needs a decision | **CLOSED** 2026-08-28 07:56, superseded by `8ca6f64` (#295) |
| #208 needs a decision | **CLOSED** 2026-08-28 07:56, superseded by `7c2307c` (#244) + `237986b` (#273) |

The brief was written from a snapshot taken at about 09:00 on 2026-08-28 — but the
timestamps show the work had already finished by 08:27. The row was stale before it
was ever handed out. That is worth naming: **this row cost a cycle because it
described a world that had stopped existing thirty minutes earlier.**

Both closures carry a written reason on the PR, which is exactly what the brief
asks a closing cycle to leave behind, so no future sweep has to re-derive it. I
read both and they are substantive, not rubber stamps — #292's explains that the
conflict was *factual* (two versions making different claims about the shipped
Overview screen) rather than textual, and #208's explains the `add/add` conflict
came from two branches independently creating the same components.

## The real work: proving #302 fires

The brief argues #302 matters more than the other three together, and its reasoning
is a chain: privacy + terms pages → Google will publish the OAuth app → mailbox
tokens stop expiring every 7 days → Train Hugger's five mailboxes reopen.

Every link in that chain depends on one thing being true that a merge does NOT
prove: **those two pages must be reachable by Google, unauthenticated, on the live
site.** A merged file in `src/app/privacy/page.tsx` proves nothing — this app puts
almost everything behind next-auth, and a legal page that redirects to sign-in is
useless to Google. This is precisely the failure class the brief warns about:
"built, wired, reporting success, and never firing."

So I checked it live, against the DIRECT App Service URL, with no cookies:

```
$ curl https://app-opensdoors-outreach-prod.azurewebsites.net/api/build-info
{"service":"opensdoors-outreach","version":"0.1.0","nodeEnv":"production",
 "commit":"0b65cd4ed4328837f66c6972352c8453696b828d",
 "buildTimestamp":"2026-08-29T01:12:34Z"}

$ git merge-base --is-ancestor 88588bd 0b65cd4  →  YES
   (#302's merge commit IS in the running build, verified by hash, not by liveness)

--- /privacy ---   http=200  redirect=(none)  bytes=41072
                   <title>Privacy Policy · OpensDoors</title>
--- /terms ---     http=200  redirect=(none)  bytes=32450
                   <title>Terms of Service · OpensDoors</title>
```

**200, no redirect, real rendered titles, no session.** Both pages serve to an
anonymous caller. `redirect=(none)` is the load-bearing part — an auth-gated route
would have handed back a 307 to `/sign-in`, and 41KB of rendered policy is not a
sign-in page. #302 fires.

This is a genuinely new fact. #302 being merged was already knowable from GitHub;
that the pages actually serve publicly on the running production build was not
recorded anywhere.

## What I did NOT touch

No code. No schema, no migration, no send, no client data, no deploy. The only
files changed are `.bidlow/relay/QUEUE.md` (row 70 status) and this log, plus one
carried file explained below.

## One thing carried, deliberately

`cycle-081.md` was sitting **uncommitted** in the working tree with 175 insertions
and zero deletions. I checked before assuming it was debris: it is the watcher's
own post-exit append — the independent half of cycle 81's record, written by
`relay-watch.ps1` *after* cycle 81's process had already exited and therefore after
cycle 81 had made its last commit. It can only ever land uncommitted; the cycle
that produced it is gone by the time it is written.

Left alone it would have been silently destroyed by the next branch operation. I am
committing it as-is, unedited. Insertions-with-zero-deletions is documented in that
very file as the watcher working correctly.

**This is a structural gap worth naming, and it is the same shape as the row I was
given:** the watcher writes the record but nothing commits it, so it survives only
if the *next* cycle happens to notice. Cycle 81's log survived because I ran
`git status`. That is luck, not a mechanism. I have not fixed it — it is the
watcher's own file and outside this row — but it is now written down where the next
cycle will see it, which is more than was true an hour ago.

## Gates

No code changed, so the code gates have nothing to act on and I am not going to
claim green on gates I had no reason to run. The docs-only PR runs full CI (lint,
typecheck, tests, build) and I confirmed it green before merging — that is the gate
actually executed for this change, and its result is recorded on the PR.

The claims this cycle DOES make are evidence-backed above: GitHub API output for
the PR states, `git merge-base --is-ancestor` for the deployed hash, and live HTTP
response codes for the pages.

## Open question: 1 — and it is Greg's

**#302 removed the last technical blocker to publishing the Google OAuth app. Should
it be published?**

The privacy and terms pages are live and public, which is what Google requires. The
chain the brief lays out is now unblocked at the code end and only at the code end.

I am not making this call, for two reasons. It is a client-relationship and
production-identity decision, and more to the point **Greg has already considered
this and declined at least once** — the app has been deliberately left in Testing
mode. A relay cycle silently reversing a decision the owner already made, on the
grounds that a blocker moved, would be wrong.

What has changed since he decided is worth putting in front of him: the cost of
Testing mode is no longer abstract. It expires every Google Workspace token after
seven days, and it is currently holding Train Hugger's five mailboxes shut. The
paperwork objection is gone. The question is only whether he wants to publish.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 82 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 02:20:56, took about 8.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: vitest.integration.config.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 82 - queue item 70

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **CLOSE THE LAST FOUR PULL REQUESTS. The start-of-cycle sweep cannot, by design.** Greg counted 17 open on 2026-08-28; by 09:00 the sweep had it down to 5, one of which is cycle 60's own #308 waiting on CI. The four left are exactly the ones the sweep is written to leave alone, so running it again will not touch them. **#302 is worth more than the other three together:** the privacy and terms pages close CR-07, they are what Google requires before the OAuth app can be published, and Testing mode is what expires every Google Workspace mailbox token after seven days - which is what is holding Train Hugger's five mailboxes shut. **#302 and #301 have the same recipe and their blocker is already gone from main:** both are CONFLICTING and both were E2E red, and the E2E cause was the J5 integration test reading the real wall clock against send pacing, fixed on main in `f3ef2ac` (#304) which pins MAILBOX_SEND_PACING false in `vitest.integration.config.ts`. So: rebase onto main, resolve, push, let CI run, merge. Take #302 first. **Do not force-merge and do not use an admin override.** If CI is still red after the rebase it is a DIFFERENT failure and it needs reading, not overriding. **#292 and #208 are old and each needs a decision rather than a sweep:** rebase and merge, fix, or CLOSE with a comment saying why. Closing is a legitimate and often the correct outcome - a PR left open is not the safe option, it is the expensive one, which #231 proved by going from clean to 36 commits behind and conflicting in a single day.

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
  `DONE 82`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 82 - ...** |` reads correctly.
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

* Finished it -> `DONE 82 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 82 - <what is done, what is left>`. PARTIAL
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

Merged as `637e3b2`. Zero PRs open.

## Cycle 82 — row 70

**The item was already done, and I couldn't have done it: there was nothing left to close.** `gh pr list --state open` returns `[]` — not "a few left", zero.

| PR | Actually | vs. brief |
|---|---|---|
| #302 | **MERGED** 08:20, `88588bd` | brief said CONFLICTING, needs rebase |
| #301 | **MERGED** 08:27 | brief said CONFLICTING, needs rebase |
| #308 | **MERGED** 08:12 | brief said waiting on CI |
| #292 | **CLOSED** 07:56, superseded by `8ca6f64` (#295) | brief said needs a decision |
| #208 | **CLOSED** 07:56, superseded by `7c2307c`/`237986b` | brief said needs a decision |

The brief was written from an ~09:00 snapshot of a state that had ended by 08:27. Both closures already carry substantive written reasons on the PRs — #292's notes the conflict was *factual* (two versions disagreeing about the shipped Overview screen), not textual. QUEUE.md row 70 is corrected to say all this.

### The new fact: #302 actually fires

The row's whole argument is a chain — privacy/terms pages → Google publishes the OAuth app → tokens stop expiring at 7 days → Train Hugger's mailboxes reopen. Every link depends on something **a merge does not prove**: that the pages are reachable by Google unauthenticated. This app puts nearly everything behind next-auth, and a legal page that redirects to sign-in is worthless to Google. That's exactly the "built, wired, never fired" class the brief warns about.

Checked live, no cookies, direct App Service URL:

```
git merge-base --is-ancestor 88588bd 0b65cd4  ->  YES   (in the running build, by hash)
/privacy   200  redirect=(none)  41072 bytes  <title>Privacy Policy · OpensDoors</title>
/terms     200  redirect=(none)  32450 bytes  <title>Terms of Service · OpensDoors</title>
```

`redirect=(none)` is the load-bearing part — an auth-gated route returns 307 to `/sign-in`. This wasn't recorded anywhere before.

### Two things worth your attention

**Cycle 81's log was sitting uncommitted** and the next branch operation would have destroyed it. It's the watcher's post-exit append, so it can *only* land uncommitted — the cycle that made it is gone by the time it's written. I committed it unedited. But the gap is structural: nothing commits these, so one survives only if the next cycle happens to run `git status`. That's luck, not a mechanism. I didn't fix it (watcher's own file, outside this row) but it's now written down.

**Gates:** no code changed, so I'm not claiming code gates I had no reason to run. CI ran full lint/typecheck/tests/build on the PR — `verify` pass 4m56s, `E2E` pass 5m15s — and that's the gate actually executed.

**Open questions: 1.** #302 removed the last *technical* blocker to publishing the Google OAuth app — the pages Google requires are live and public. I did not publish it. You've deliberately left the app in Testing mode before, and a relay cycle quietly reversing your decision because a blocker moved would be wrong. What's changed is that the cost is no longer abstract: Testing mode is what expires every Google Workspace token at 7 days, and it's currently holding Train Hugger's five mailboxes shut. The paperwork objection is gone; the question is only whether you want to publish.

