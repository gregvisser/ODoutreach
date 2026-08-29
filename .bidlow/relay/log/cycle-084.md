# Cycle 84 — row 72: the privacy policy described behaviour the product no longer has

## The PR sweep, first

`gh pr list --state open` returned `[]`. Zero open pull requests, so there was
nothing to merge, nothing red to read and nothing to leave a comment on. Cycle 78
cleared the backlog of seventeen and the start-of-cycle sweep has kept it at zero
since. Recorded rather than skipped, because "there were none" and "I did not
look" are different sentences and only the first one is true here.

## What the brief asked for, and whether it was right

It was right on the first half and stale on the second, in a way it had itself
anticipated.

**First half — correct in every particular.** `/privacy` really did say "Open
tracking is on by default and can be switched off per deployment", and both
halves of that sentence had been false since `c662e1b` (#268) on 2026-08-28. I
verified the claim against the code rather than against the commit messages: the
default is off because `Client.openTrackingEnabledAt` is a nullable column with
no default and no backfill (`prisma/schema.prisma:464`), and
`decideClientOpenTracking` returns `CLIENT_NOT_OPTED_IN` for a null
(`src/lib/tracking/client-open-tracking.ts:105`).

**Second half — the premise had expired, the instruction had not.** The brief
said the Sentry sentence "understates a configuration that currently enables
request and response bodies, database query data and stack-frame variables". That
was true when the row was written; it stopped being true when row 69 landed as
`DONE 62`, which is exactly the condition the brief gated on ("only AFTER row 69
lands"). So the sentence still needed rewriting, but in the opposite direction
from the one the wording implies: the configuration is now restrictive, and the
old sentence understates how *little* is sent, not how much. No correction to
QUEUE.md is warranted — the row's own gate handled it.

**One thing the brief did not know**, found during reconnaissance and worth
recording: production *also* has the global kill-switch `OPEN_TRACKING_PIXEL=off`
engaged. So today there are two independent reasons no pixel ships to anyone. I
deliberately did **not** put that in the policy — see the judgement calls below.

## The four things, written before anything was touched

1. **Files:** `src/app/privacy/page.tsx`,
   `src/components/legal/legal-page-shell.tsx`, and a new
   `src/app/privacy/privacy-policy-accuracy.test.ts`.
2. **Red-first test:** that new file, asserting both sides of the claim.
3. **Done:** the public page says tracking is off unless a customer turns it on,
   and cannot be turned on until the system has itself checked their DNS — and a
   test fails if the page and the code ever disagree again.
4. **Not touched:** the amber draft notice, the three named placeholders, the
   `/terms` prose, and any tracking or Sentry *runtime* behaviour. All four held.

## The test is a coupling, not a spell-check

This is the part worth reading. The obvious test here greps the page for the
absence of "on by default". That test would have passed happily on 28 August
while the code underneath it said the opposite, because prose is not compiled and
a grep over prose only ever proves what the prose says.

So `privacy-policy-accuracy.test.ts` asserts **both directions**:

* the **code** half drives the real `decideClientOpenTracking` and reads the real
  `SENTRY_DATA_COLLECTION`, asserting the behaviour the page describes;
* the **prose** half asserts the page describes it.

Either side moving alone is a failure, and the failure is reported from a file
named for the privacy policy — so whoever flips a default is told, by name, that
a public legal promise has just become untrue.

**Watched red first, in both directions.**

Red on the prose, before the page was edited — and note the split, which is the
whole design working: 5 code-side assertions passed (the behaviour was already
correct) and 4 prose-side assertions failed (the page was lying). That is the
defect, isolated by the test:

```
 FAIL  src/app/privacy/privacy-policy-accuracy.test.ts
   × no longer claims tracking is on by default or a per-deployment switch
   × states the default, the per-customer opt-in and the DNS precondition
   × no longer says identifiers are incidentally included
   × names what is withheld and what is still collected
      Tests  4 failed | 5 passed (9)
```

Red on the code, *after* the page was fixed — the direction that actually matters
for the future, since the page is now correct and the risk is the code drifting
away from it. I broke two things deliberately: `stackFrameVariables: false → true`
in `sentry-data-collection.ts`, and the null check in `decideClientOpenTracking`:

```
   × is OFF for a client that nobody has opted in, even with the global backstop permitting
     AssertionError: expected { enabled: false, …(1) } to deeply equal { enabled: false, …(1) }
   × only claims data is withheld where the collection policy withholds it
     AssertionError: expected true to be false
      Tests  2 failed | 8 passed (10)
```

Both reverted; `git diff --stat src/lib/` is empty. This is the row's own "assume
the seventh exists" guard discharged: the coupling is proven to *fire*, not merely
to exist.

The prose assertions are scoped to a single `<LegalSection>` by heading rather
than run over the whole file. Two reasons, both learned from the red run: a
whole-file match prints the whole file on failure, and eight kilobytes of red is
noise people learn to skim; and "per customer" already appears in the suppression
section, so a whole-file match would have gone **green** on the tracking claim
while the tracking section still said the opposite. The scoped helper throws a
written explanation if the heading is ever renamed.

## What the page now says

The tracking section states: off by default; on only for one individual customer
at a time; that the system resolves SPF, DKIM, DMARC and the tracking host itself
and must find all four correct; that the tracking host must be a subdomain of the
sending domain; that nobody's assurance is accepted in place of the lookup; that
it re-checks daily and switches itself back off after seven days; and that the
system-wide switch can only hold tracking off, never turn it on.

The Sentry line now names what is withheld — request and response bodies, HTTP
headers, cookies, sign-in identities, URL query strings, database values, stack
frame variables — and, deliberately, what is still sent: the stack trace, the
error message, the route, timings, our own source context and the shape of a
failing query with values stripped. "We send Sentry nothing" would have been the
comfortable sentence and it would have been false.

## Three judgement calls, all arguable

1. **I did not write the live kill-switch position into the policy.** "Tracking is
   currently off for everyone" is true today and is a claim about an Azure App
   Service setting that no test in this repository can hold. Putting an untestable
   live-config assertion on a public legal page is the precise mistake this row
   exists to correct, so the page describes the *mechanism* and not the current
   setting.
2. **I added one sentence beyond the brief**, to the paragraph the brief called
   accurate: the open timestamp is stored against the recipient's contact record,
   so "a single timestamp, and nothing else" is not the same as "anonymously". The
   old sentence was true but read more reassuringly than the data model warrants.
   Scope creep, defensibly — the row is about the page telling the truth.
3. **`lastUpdated` is now a per-page prop** defaulting to the shared constant.
   The privacy text changed today and the terms text did not, and one shared date
   would either backdate the change or claim a revision that never happened.
   `/terms` renders byte-identically.

## Gates — all run, all shown

* `npm run lint` — clean, no output.
* `npm run typecheck` — clean, no output.
* `npm test` — **319 files, 3215 tests, all passed.**
* `npm run build` — run; result recorded in the PR.

No schema change, no migration, no client data touched, and nothing that causes an
email to be sent. None of the three stop-and-ask conditions applies.

## For Greg

**Your action is now unblocked and nothing is waiting on me for it.** The Google
Auth Platform Publish button needs `/privacy` and `/terms` on the custom domain;
both have been live and publicly reachable since #302 merged, and the privacy page
is now also *accurate*. Publishing is what ends the seven-day refresh-token expiry
that keeps dropping Train Hugger's mailboxes. You have declined to publish before,
so this is recorded as yours rather than actioned.

Worth knowing before you publish: Google's reviewer reads that page. It now
describes the DNS precondition and the Sentry position in specific, checkable
terms, which reads considerably better under review than the sentence it replaced.

**Open questions: 1** — whether to publish the Google OAuth app. That is a
relationship and product decision, not a code one, and it is the only thing here
that is yours.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 84 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 03:04:30, took about 11.3 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 84 - queue item 72

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE PRIVACY POLICY WENT LIVE DESCRIBING BEHAVIOUR THE PRODUCT NO LONGER HAS.** `/privacy` merged in #302 and is now serving publicly on `https://opensdoors.bidlow.co.uk/privacy`, which is the point - but it was written before the tracking work landed and it now contradicts the code by a few hours. It says open tracking is "on by default and can be switched off per deployment". Since `c662e1b` (#268) and `7250cc7` (#309) that is FALSE: tracking is OFF by default, opted in PER CLIENT, and refused outright until the system has itself resolved that client's SPF, DKIM, DMARC and tracking-host records. Correct the wording and state the DNS condition plainly, because it has stopped being an internal design note and become a promise on a public page a regulator or a prospect can read. **Second, and only AFTER row 69 lands:** the Sentry paragraph says Sentry "can incidentally include identifiers present in the failing operation", which understates a configuration that currently enables request and response bodies, database query data and stack-frame variables. Once row 69 has made those explicit, rewrite that sentence to describe what is actually sent. Keep the amber draft notice and the three named placeholders exactly as they are - they are honest and they should stay until a human answers them. **GREG'S ACTION, unblocked the moment this page went live:** the Google Auth Platform Publish button now has the two URLs it was refusing to proceed without, `/privacy` and `/terms` on the custom domain, and publishing is what ends the seven-day refresh-token expiry that keeps dropping Train Hugger's mailboxes.

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
  `DONE 84`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 84 - ...** |` reads correctly.
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

* Finished it -> `DONE 84 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 84 - <what is done, what is left>`. PARTIAL
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

PR #355 is open and CI is running. Both background jobs (local rebuild, CI watch) will notify me; I'll merge as soon as checks are green.

Summary of where this stands:

- **PR sweep:** `gh pr list --state open` returned `[]` — nothing to merge, nothing red. Recorded rather than skipped.
- **The false claim is fixed.** `/privacy` said tracking was "on by default and can be switched off per deployment"; it is off by default, per-client, and refused until the system has itself resolved SPF, DKIM, DMARC and the tracking host. I verified that against `schema.prisma:464` and `client-open-tracking.ts:105` rather than trusting the commit messages.
- **The brief's second premise had expired**, exactly as its own "only AFTER row 69" gate anticipated — the Sentry config is now restrictive, so the old sentence understates how *little* is sent, not how much. Rewritten in that direction. No queue correction needed.
- **The test couples page to code in both directions**, and I watched it red both ways: 4 prose assertions failing while 5 code assertions passed (that split *is* the defect), then breaking `stackFrameVariables` and the opt-in null check to confirm the code side fires too.

One thing I decided against and want to flag: production also has `OPEN_TRACKING_PIXEL=off` engaged, so there are currently two independent reasons no pixel ships. I deliberately kept that off the page — it's an untestable claim about live Azure config, which is this row's own defect wearing a new sentence.

