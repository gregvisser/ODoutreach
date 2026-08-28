# Cycle 74 — queue row 83: the seven-day Google clock now has a countdown and an alarm

Merged as **#339**, squashed to **`22f27bd`**. Row 74 (Connect no longer
destroying a working credential) landed first in `08b8fc2`, as the brief
required.

## The PR sweep, first

`gh pr list --state open` found **one** open PR, #338 (`docs(state)`), with CI
still running. Waited, confirmed both checks SUCCESS and `mergeStateStatus`
CLEAN, merged it. Auto-merge is **not enabled on this repository**
(`enablePullRequestAutoMerge` refused), so `gh pr merge --auto` is not available
to future cycles — merge manually once green.

The queue ended this cycle at **zero open PRs**.

## What was actually built

The owner's decision of 2026-08-28 keeps the Google OAuth app unpublished, so
Google expires every Google Workspace mailbox's refresh token seven days after
consent and OpensDoors reconnect by hand, weekly. Nothing warned; the way an
expiry was discovered was that outreach stopped.

* **`src/lib/mailboxes/google-refresh-token-expiry.ts`** — the countdown. A pure
  function of `connectedAt` and a clock, so nothing new is captured. Formats the
  deadline in **UTC**, because the same label is rendered in a browser and in a
  Node alert script and a local-time format would print two different deadlines
  for one mailbox.
* **`src/lib/mailboxes/google-reconnect-roster.ts`** — every Google mailbox,
  most urgent first, with the counts and per-client grouping. One roster read by
  three surfaces so the row, the screen and the email cannot disagree.
* **The mailbox row** — `Google — reconnect by 4 Sep 2026, 5 days left`, and
  `Reconnect needed — this Google login expired on 4 Sep 2026` past the
  deadline. Microsoft rows unchanged: the resolver returns null for them.
* **`/google-reconnects`** — the weekly chore on one screen instead of eighteen.
  Put in the sidebar deliberately, unlike `/operations`: all staff do the
  reconnects, and a chore nobody can find does not get done.
* **The daily digest** — a Google section: `PARTIAL` naming the client and each
  mailbox due, `FAILED` if the check itself could not run. `alerts.yml` now
  carries `PRODUCTION_DATABASE_URL`.

## Red first, which the brief demanded and which paid

The day count is pure arithmetic, so it was driven from a **fixed** consent date
against a stub before the module existed. **16 assertions failed** — including
7, 5, 1, 0 and overdue. Roster: red on 9 of 9. Alert copy: red on 9 of 11.

## Assume the seventh exists — proven to FIRE

Dry-run of `alerts.yml` on the branch, run **33214655674**, against the **real
production database**. Nothing sent. It composed:

```
  Google logins: 8 of 8 need reconnecting
      GreenTheUK
        adam@greentheuk.com — Not connected — a sign-in was started and never finished. Press Connect.
        joe@greentheuk.com  — Not connected — a sign-in was started and never finished. Press Connect.
        josh@greentheuk.com — Not connected — the last sign-in failed. Press Connect.
      Train Hugger
        alex@trainhugger.com … taylor@trainhugger.com (5 rows)
```

The subject correctly stayed with the genuinely broken job (`reply &
do-not-contact sync partly failed`) rather than being displaced by the reconnect
notice — the documented ranking, confirmed live rather than assumed.

**Honest limit, stated rather than rounded up:** none of the 8 production Google
mailboxes is CONNECTED today, so that live run exercised the *not-connected*
branch. The 7/5/1/0 countdown is proven by unit tests only, until somebody
reconnects a mailbox. It has not been demonstrated on a live row.

## A correction to the brief, as instructed

Row 83 said nothing warned at all. That is very slightly overstated. There
**was** an inline day-6 nudge at `client-mailbox-identities-panel.tsx` — one
day of notice, no deadline date, no overdue state, no test, and the arithmetic
buried in a `.tsx`. The substance of the row stands: no countdown, no deadline,
no overdue state, no alert, no cross-client screen. This replaces that nudge
rather than sitting beside it, so there is one number in one place.

## Operational finding for Tuesday 1 September

All **8** Google mailboxes across GreenTheUK and Train Hugger are off the air
**right now** — 2 stranded mid-Connect (`PENDING_CONNECTION`) and 6 with a
failed sign-in (`CONNECTION_ERROR`). Greg is on site pressing Connect; this is
the list, and `/google-reconnects` now shows it without opening 18 workspaces.

## Not touched

No schema change and no migration — the countdown is arithmetic over rows
already stored. No send path. No Microsoft behaviour. No client data moved; the
production read is read-only.

## Gates, run and shown

`npm run lint` 0 · `npm run typecheck` 0 · `npm test` **3122 passed** (314
files) · `npm run build` ok with `/google-reconnects` present in the route list.
CI on #339: `verify` pass, `E2E (Playwright)` pass.

## Open question for Greg (1)

The digest now raises to **PARTIAL** whenever any Google mailbox needs
reconnecting. With all 8 currently off the air that means a PARTIAL digest every
morning until they are reconnected, which is correct but will look noisy for a
few days. If it is still PARTIAL for Google reasons a fortnight from now, the
threshold — currently two days' notice — is the knob to turn, not the alarm to
switch off.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 74 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-28 22:36:23, took about 34.8 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: Bidlowbusiness\_odoutreach-handover\GOOGLE-7-DAY-MANUAL-POLICY.md, google/callback/route.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 74 - queue item 83

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **NOTHING WARNS BEFORE A GOOGLE MAILBOX'S SEVEN-DAY TOKEN DIES, AND THE OWNER HAS JUST MADE THAT A PERMANENT WEEKLY POLICY. Brief: `C:\Bidlowbusiness\_odoutreach-handover\GOOGLE-7-DAY-MANUAL-POLICY.md`.** Decision 2026-08-28, the owner's, and NOT to be re-argued by any cycle: the Google app stays UNPUBLISHED until the system is proven, and OpensDoors will manually reconnect every Google Workspace mailbox every seven days until then. While the app is in Testing, Google expires each test user's refresh token seven days after consent. **Measured, not assumed:** the only expiry logic in this codebase is the 15-minute OAuth STATE expiry (`mailbox-oauth-state-expiry.ts`) and the short-lived access token (`accessTokenExpiresAt`, written by both callbacks). Nothing anywhere tracks or warns about the seven-day REFRESH-token clock, so the way OpensDoors learn a mailbox has expired is that outreach stopped - a failure that reports nothing, which is this repository's worst recorded habit wearing a new hat. **Nothing new needs capturing:** `MailboxProvider` is MICROSOFT or GOOGLE on the identity and `connectedAt` is written by the Google callback at `google/callback/route.ts:167`, so the countdown is arithmetic over rows already stored. **Build, smallest useful version:** (1) on each GOOGLE mailbox row, "Google - reconnect by <date>, N days left", and past the deadline "Reconnect needed"; Microsoft rows gain nothing and must not change. (2) An alert at DAY FIVE through the path the relay already uses to email Greg, naming the client and the mailboxes due. (3) One screen listing every Google mailbox across all clients sorted by days remaining, so the weekly chore is one page and not eighteen. **Red first is easy here and is required:** the day count is a pure function of `connectedAt` and a clock, so drive it from a FIXED date and watch 7, 5, 1, 0 and overdue fail before any of it touches a screen. **Do not treat the reconnect policy as a substitute for the alarm** - a weekly manual task with no reminder is a task that gets missed, and the client finds out only after their outreach has been silently dead for days. **Row 74 is the other half of this** and must land first: with a weekly reconnect policy, a Connect button that destroys a working credential before sign-in stops being a one-off risk and becomes roughly fifty-two chances a year, per mailbox, to kill sending in silence.

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
  `DONE 74`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 74 - ...** |` reads correctly.
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

* Finished it -> `DONE 74 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 74 - <what is done, what is left>`. PARTIAL
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

Cycle 74 complete. Row 83 is `DONE 74`, merged and deployed.

## PR sweep
One open PR (#338, docs), CI running — waited, merged. **Ended at zero open PRs.** Worth recording: `gh pr merge --auto` is *refused* on this repo (`enablePullRequestAutoMerge` disabled), so future cycles must merge manually once green.

## What shipped — #339, squashed to `22f27bd`, live and verified by hash
- **The countdown** (`google-refresh-token-expiry.ts`) — pure arithmetic over `connectedAt`. Formats in UTC, because the same label renders in a browser *and* in a Node script, and local time would print two different deadlines for one mailbox.
- **The roster** (`google-reconnect-roster.ts`) — one source of truth read by all three surfaces, so the row, the screen and the email can't disagree.
- **Mailbox rows** — "Google — reconnect by 4 Sep 2026, 5 days left" / "Reconnect needed…". Microsoft rows return null and are unchanged.
- **`/google-reconnects`** — every Google mailbox across all clients, most urgent first, in the sidebar.
- **The daily digest** — PARTIAL naming the client and each mailbox due; FAILED if the check itself couldn't run.

## Red first
Driven from a fixed consent date against a stub: **16 assertions failed** before the module existed, including 7, 5, 1, 0 and overdue. Roster red 9/9, alert copy red 9/11.

## Proven to fire, not merely to exist
Dry-run of `alerts.yml` on the branch against the **real production database** (run 33214655674) — composed the section naming GreenTheUK and Train Hugger and all 8 mailboxes, sent nothing. The subject correctly stayed with the genuinely broken job rather than being displaced.

**Honest limit:** none of the 8 production Google mailboxes is CONNECTED, so that run exercised the *not-connected* branch. The 7/5/1/0 arithmetic is unit-tested only until someone reconnects one. And the new screen has not been walked signed-in — its presence rests on the build manifest plus the verified commit hash.

## Correction to the brief
Row 83 said nothing warned at all. There *was* an untested inline day-6 nudge in the mailbox panel — one day of notice, no deadline, no overdue state. The row's substance stands; this replaces the nudge so there's one number in one place. Recorded in QUEUE.md and the cycle log.

## Operational finding for Tuesday 1 September
All 8 Google mailboxes across GreenTheUK and Train Hugger are **off the air right now** — 2 stranded mid-Connect, 6 with a failed sign-in.

Gates: lint 0 · typecheck 0 · **3122 tests passed** · build ok. No schema change, no migration.

**Open questions: 1** — the digest will read PARTIAL every morning until those 8 are reconnected. That's correct, but if it's still PARTIAL for Google reasons in a fortnight, the two-day threshold is the knob to turn, not the alarm to switch off.

