# Cycle 97 — row 86: a failed reconnect no longer takes a working mailbox off the air

## PR sweep

`gh pr list --state open` returned `[]`. Nothing to merge, nothing to leave a
comment on. The seventeen-PR landfill of 2026-08-28 is cleared and has stayed
cleared for two cycles.

## What the row asked

Both OAuth callbacks answered every failure by writing
`connectionStatus: "CONNECTION_ERROR"`. `sending-policy.ts` gates on
`connectionStatus === "CONNECTED"`, so a failed SIGN-IN ATTEMPT took a mailbox
off the air whose stored credential the attempt never went near.

This became reachable at cycle 73. Before it, `prepareMailboxOAuthConnection`
deleted the credential on the way OUT to the provider, so by the time a callback
ran there was nothing left to protect. Cycle 73 stopped that — a mailbox that
can send keeps its credential and its CONNECTED status for the whole round trip
— and left the same defect one step downstream, which it disclosed rather than
hid. Not a regression: before 73 the mailbox was dead either way.

## The judgement call, made rather than assumed

The row asked whether to defer to `classifyMailboxCredentialFailure` instead of
a blanket CONNECTION_ERROR. **I did not.**

That classifier reads errors produced by *using a stored refresh token* — the
send path and the reply-sync path — where `invalid_grant` genuinely does mean
"the stored grant is dead". A callback's errors come from exchanging a fresh
*authorization code*, where `invalid_grant` means the code was expired, already
spent, or issued for a different redirect URI. That is a fact about the code,
not about the refresh token in `MailboxIdentitySecret`. Handing it to the
classifier returns `reauth_required → CONNECTION_ERROR` and demotes a healthy
mailbox on the strength of an error about an entirely different credential —
the same blanket demotion wearing a classifier's name.

The classifier is not wrong. It is being asked a question it was not built for.
The right question is not "what does this error say about the stored credential"
— the answer is always "nothing, it never touched it" — but "does this row still
hold a credential the send path is using". Cycle 73 already wrote that predicate:
`isMailboxSendingCredentialLive`.

The send and sync paths run every five and fifteen minutes and DO exercise the
stored credential. They are the only code with evidence. Deferring the status to
them is deferring it to the evidence.

### The second half, which the row did not ask for and needed

`lastError` is preserved too, not just the status. Two reasons:

1. `mailboxRowOperatorStatus` checks `isMailboxAccountDeletedError(row.lastError)`
   **ahead of** the status branches. An `AADSTS500341` arriving inside a
   provider's `error_description` would have relabelled a live, sending mailbox
   "Cannot be reconnected" — status preserved, mailbox still sending, screen
   saying it is beyond help. There is a test for exactly this.
2. Not writing it stops the sync path's true diagnosis being clobbered by a note
   about a sign-in attempt.

Nothing is lost. The operator is standing at the screen — that is why cycle 73
judged this safe to defer — and the redirect banner names the failure in the same
words as before. The audit row keeps the provider's text permanently, and now
also carries `credentialRetained`, so the decision is checkable in production
after the fact rather than inferred.

## Correction to the brief

The queue row listed `missing_code` among the write sites. It is not one: that
branch redirects read-only and writes nothing. The real write sites are the
provider-`error` branch and the catch block. QUEUE.md now records this.

## Red-first, proven

Three new callback tests were written before the routes were touched and watched
fail:

```
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the wrong account approves
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the token exchange is refused
FAIL  google/callback/route.test.ts > leaves a sending mailbox sending when the operator declines at Google
AssertionError: expected { …(4) } to not have property "connectionStatus"
- Expected: undefined
+ Received: "CONNECTION_ERROR"

Tests  3 failed | 22 passed (25)
```

The proof case the row named is the first of those: **account_mismatch**, where
the stored credential is definitely still fine — the exchange succeeded and the
only thing wrong is who was at the keyboard.

Green after the change: 37 tests across the three files, including the other
half of the rule (a row with no stored credential still records the failure, so
a stranded mailbox does not go on reading "Connected" with no explanation).

## Files changed

- NEW `src/lib/mailboxes/mailbox-oauth-failed-attempt.ts` — the pure rule
- NEW `src/lib/mailboxes/mailbox-oauth-failed-attempt.test.ts` — 10 tests
- `src/app/api/mailbox-oauth/google/callback/route.ts`
- `src/app/api/mailbox-oauth/microsoft/callback/route.ts`
- both callback `route.test.ts`
- `.bidlow/relay/QUEUE.md`

Not touched: the success path, `classifyMailboxCredentialFailure`,
`sending-policy.ts`, `prepareMailboxOAuthConnection`, the banner copy, the
schema. No migration.

## Gates

```
npm run lint       clean
npm run typecheck  clean
npm test           3643 passed / 3644
```

The one failure is `relay/cycle-log-reaches-git.test.ts` timing out at 5000 ms
under full-suite load; run alone it passes in 2.3 s. It shells out to git, and
the 5 s budget is not enough on a contended Windows box. Unrelated to this
change, but it is a real flake that will eventually redden CI — recorded here
rather than fixed, because it is outside this cycle's declared files.

## Done, in one sentence a non-coder can check

If someone starts a mailbox reconnect and it fails — they sign in as the wrong
person, they press Deny, the provider refuses — a mailbox that was sending fine
a minute ago is still sending fine a minute later, and they are told what went
wrong on screen.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 97 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 11:08:36, took about 29.6 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: callback/route.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 97 - queue item 86

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **A FAILED RECONNECT STILL DEMOTES A MAILBOX WHOSE OLD CREDENTIAL MAY BE PERFECTLY GOOD.** Disclosed by cycle 73 as deliberately out of scope for row 74. Both OAuth callbacks (`src/app/api/mailbox-oauth/*/callback/route.ts`) write `connectionStatus: "CONNECTION_ERROR"` on provider_denied, missing_code, account_mismatch and exchange failure, without looking at whether the mailbox still holds a working credential. Since cycle 73 a CONNECTED mailbox KEEPS its credential through the round trip, so this path can now take a mailbox that could still send and mark it unable to - which the old code could not do, because the credential was already deleted by then. **This is strictly better than before cycle 73 and is NOT a regression** - before, the mailbox was dead either way - but it is the same defect class one step downstream. An operator IS present to see the banner, which is why it was not bundled in. **The judgement call to make, not to assume:** an exchange failure says the SIGN-IN attempt failed, which is not evidence about the STORED credential; but a genuinely expired token also surfaces here, and the send and sync paths already flip status correctly via `classifyMailboxCredentialFailure`. Consider deferring to that classifier rather than a blanket CONNECTION_ERROR, and prove whichever way with the account_mismatch case, where the stored credential is definitely still fine.

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
  `DONE 97`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 97 - ...** |` reads correctly.
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

* Finished it -> `DONE 97 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 97 - <what is done, what is left>`. PARTIAL
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

Cycle 97 complete. Row 86 is `DONE 97`.

**PR sweep:** zero open at start, zero at end. Two opened and merged this cycle.

**The defect.** Both OAuth callbacks answered every failure by writing `connectionStatus: "CONNECTION_ERROR"`. `sending-policy.ts` gates on `CONNECTED`, so a failed *sign-in attempt* took a mailbox off the air whose stored credential the attempt never went near. Reachable only since cycle 73 — which stopped Connect deleting the credential on the way out, and disclosed this rather than hiding it.

**The judgement the brief asked me to make, not assume: I did not defer to `classifyMailboxCredentialFailure`.** That classifier reads errors from *using* a stored refresh token, where `invalid_grant` means the grant is dead. A callback's `invalid_grant` is about the *authorization code* — spent, expired, wrong redirect URI — and says nothing about the stored token. Feeding it to the classifier returns `reauth_required → CONNECTION_ERROR`: the same blanket demotion wearing a classifier's name, decided on evidence about a different credential. The right question was "does this row still hold a credential the send path is using", and cycle 73 already wrote that predicate. The send and sync paths *do* exercise the credential every 5 and 15 minutes — deferring to them defers to the only code with evidence.

**One thing the row didn't ask for and needed:** `lastError` is preserved too. `mailboxRowOperatorStatus` scans it *ahead* of the status branches, so an `AADSTS500341` inside a provider's `error_description` would have relabelled a live, sending mailbox "Cannot be reconnected". There's a test for exactly that.

**Correction to the brief:** it listed `missing_code` as a write site. It isn't — that branch redirects read-only. QUEUE.md records this.

**Red-first, watched fail** before the routes were touched, including the proof case the row named:
```
FAIL > leaves a sending mailbox sending when the wrong account approves
AssertionError: expected { …(4) } to not have property "connectionStatus"
- Expected: undefined      + Received: "CONNECTION_ERROR"
Tests  3 failed | 22 passed (25)
```

**Gates:** lint clean, typecheck clean, `npm test` 3643 passed. No schema change, no migration. Merged as `a4eedfd`, deployed, verified by hash on the direct App Service URL (`a4eedfda49e6…`).

**Two things I am not claiming.** Production execution is unproven — the callbacks sit behind auth middleware and an anonymous probe is bounced to `/sign-in`; firing it for real needs an operator's browser round trip against a live client mailbox. That is why the audit metadata now carries `credentialRetained`: the next real failed reconnect leaves a readable record of which way the rule went. And `relay/cycle-log-reaches-git.test.ts` times out at its 5 s budget under full local suite load (2.3 s alone, green in CI) — a real flake, left alone as outside this cycle's declared files, fix is a timeout not a rewrite.

Open questions: **0**.

