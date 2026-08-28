# Cycle 73 - queue row 74, the Connect button that deleted a working mailbox's password

## In one sentence a non-coder can check

Pressing "Connect" on a mailbox that is working today used to throw away its
saved sign-in before the operator had even reached Microsoft or Google, so
walking away from a half-finished reconnect quietly stopped that mailbox
sending; it no longer does, and while checking, I found **eight live mailboxes
that cannot send right now**.

---

## The pull request sweep

`gh pr list --state open` returned `[]`. Nothing open, nothing abandoned,
nothing to merge or comment on. Cycles 71 and 72 cleared the seventeen Greg
counted and did not add to the pile. Two minutes, and the right two minutes.

---

## The four things, written before touching anything

1. **Files.** `src/lib/mailboxes/mailbox-connect-credential.ts` (new),
   `scripts/ops-mailbox-credential-probe.ts` (new),
   `.github/workflows/mailbox-credential-probe.yml` (new), `package.json`, and
   `src/app/(app)/clients/mailbox-connection-actions.ts`.
2. **The red-first test.** `mailbox-connection-actions.test.ts`, asserting the
   real server action does **not** delete the stored credential and does **not**
   flip the status for a mailbox that is sending today. Watched failing against
   the unfixed action.
3. **Done.** Pressing Connect on a mailbox that works today leaves it working
   and still sending, even if the operator never finishes the sign-in.
4. **Not touched.** The OAuth callbacks, Disconnect, the send pipeline, the
   schema. No migration.

---

## Measure before building, as the row insisted

The row's own first instruction was to check whether any live mailbox is sitting
in `PENDING_CONNECTION` with no credential *right now*, because that is an
outage already in progress and it outranks the code change.

I could not answer that from this machine - `.azure/` is empty, there is no
production database URL locally, and the production firewall allows Azure only.
So the measurement had to become a shipped thing rather than a one-off query.
That reconnaissance **was** the first half of the cycle, and it is the right
shape: the next cycle can re-run it in one command instead of rediscovering the
problem.

`scripts/ops-mailbox-credential-probe.ts` is read-only - it writes nothing,
sends nothing, deletes nothing. It imports the **shipped** rule rather than
reimplementing the condition, so a clean probe is evidence about the rule the
server action actually applies, not about a copy of it. It masks addresses,
because this output gets pasted into notes. It exits 0 either way: a stranded
mailbox is a fact to report, not a build failure.

The workflow is deliberately **not** merge-blocking, for the same reason the
signature link audit is not: CI's database is the throwaway e2e Postgres with no
clients and no mailboxes in it. A CI-gated version would pass against an empty
database and report a clean bill of health. That is a false green, and it is the
exact defect class this project keeps repeating.

### What it found

Merged as #334, dispatched against production (run `33210823162`):

```
Mailbox rows on non-deleted workspaces: 58 (55 live: active and not removed).

Live mailboxes by status and stored credential:
   27  CONNECTED + credential
    3  CONNECTION_ERROR + NO credential
    4  CONNECTION_ERROR + credential
    2  DISCONNECTED + credential
   11  DRAFT + NO credential
    8  PENDING_CONNECTION + NO credential

27 of 55 live mailboxes can send right now.

*** 8 live mailbox(es) STRANDED by an unfinished Connect - they cannot send ***
```

Two at protech-roofing, two at chevron-security, one at panda-recycling, one at
opensdoors, two at greentheuk. All active, all with the sending toggle **on**,
pending between about two and sixty-seven days.

**So the answer to the row's question is yes.** That is now queue row 84.

### The honest limit on that evidence, stated rather than rounded up

Three of the eight have inbox-sync history, so they were genuinely connected at
some point. But for all three, the **last sync predates the pending state**. In
plain terms: those mailboxes had already stopped working, somebody tried to
reconnect them, and the reconnect was abandoned.

So this does **not** prove that a click knocked a currently-sending mailbox off
the air. It proves the stranded state is real and widespread. I am not claiming
the causation, because the data does not support it, and one more caveat is
worth writing down: `updatedAt` is touched by any write to the row, so "pending
since ~60 days" is an upper bound on how long it has been pending, not a
measurement of it. The defect is real either way - the code plainly does destroy
a working credential - but the eight mailboxes on the screen this morning are
better described as the known dead-mailbox problem plus abandoned rescue
attempts.

---

## The fix, and the thing the queue row got slightly wrong

The row listed two candidate fixes and preferred: *"keep the existing secret
until the new one is proven and swap atomically in the callback (best, but needs
care so a half-finished reconnect cannot leave two credentials)"*.

That care turns out to be unnecessary, and I want to record why rather than
quietly benefit from it. **Both OAuth callbacks already write the new credential
with `mailboxIdentitySecret.upsert`, keyed on `mailboxIdentityId`, which is
`@unique` in the schema.** One mailbox can hold at most one credential, at the
database level. The swap was always atomic. The `deleteMany` at the top of
`prepareMailboxOAuthConnection` was destroying a working credential to make room
that the upsert did not need.

So the "best" fix needed no new machinery at all - it needed a deletion removed.

### The half the row did not mention, and it matters more

Deleting the credential is only one of the two things that stopped the mailbox.
`prepare` also wrote `connectionStatus: "PENDING_CONNECTION"`, and **sending
gates on `CONNECTED`** (`sending-policy.ts`, three separate checks, plus
`step-sends.ts`). Leaving the credential in place but flipping the status would
have fixed nothing. Both had to stay put.

### What actually changed

A mailbox that can send **today** - CONNECTED, active, not removed from the
workspace, and holding a credential - now keeps its credential, its status, its
`providerLinkedUserId` and its `connectedAt` for the whole round trip. Only
`oauthState` and its fifteen-minute expiry are written, so the callback still
completes normally and still replaces the credential atomically on success.

Everything else - DRAFT, DISCONNECTED, CONNECTION_ERROR, and a CONNECTED row
whose credential has already gone - clears to `PENDING_CONNECTION` exactly as
before. There are tests on that unchanged path too, because it is the regression
surface, and they passed before and after.

The authorize-URL failure path follows the same rule: our own failure to build a
sign-in URL says nothing about the credential the mailbox already holds, so it
records the error and drops the in-flight state without demoting the row.

---

## Proving it fires, not that it exists

The standing instruction is to assume the seventh instance exists.

**What is proved.** The tests drive the **real** `prepareMailboxOAuthConnection`
through mocked Prisma - not a reimplementation of it - and assert on the exact
arguments handed to `deleteMany` and `update`. And the prepare audit row now
carries `beforeStatus` and `credentialRetained`, so a preserved mailbox is
distinguishable from a cleared one **in production, after the fact**. Without
those two fields the audit log could not tell the two apart, and "we changed the
behaviour" would have been unfalsifiable.

**What is not proved, said plainly: nobody has pressed Connect on a production
mailbox since the deploy.** That needs a signed-in staff session on a real
client's workspace, this session cannot drive a browser, and doing it against a
client mailbox is not a relay decision. The next genuine reconnect will leave an
audit row saying `credentialRetained: true`, and that closes it. Until then this
is a hash-verified deployment of tested code, which is honest, and not a
firing-in-production claim, which would not be.

### Red first

The rule module is new, so both kinds of proof were used.

Deliberately breaking `shouldPreserveMailboxCredentialOnConnect` to return
today's answer:

```
FAIL  REFUSES to clear a mailbox that is sending today
- true
+ false
Tests  1 failed | 19 passed (20)
```

And the real red-first: the fix was stashed, the test kept, and run against the
unfixed action -

```
x a mailbox that is sending today > does NOT delete the stored credential before the operator has signed in
x a mailbox that is sending today > leaves the mailbox CONNECTED, so an abandoned reconnect does not stop it sending
x a mailbox that is sending today > records the retention in the audit log
x a mailbox that is sending today > does not demote the mailbox when the sign-in URL cannot be built
v a mailbox with nothing to protect > still clears and moves DISCONNECTED to PENDING_CONNECTION
v a mailbox with nothing to protect > still clears and moves CONNECTION_ERROR to PENDING_CONNECTION
v a mailbox with nothing to protect > still clears and moves DRAFT to PENDING_CONNECTION
x a mailbox with nothing to protect > clears a CONNECTED row whose credential has already gone
Tests  5 failed | 4 passed (9)
```

The three that passed on both sides are the regression guard, and they are as
important as the four that went red.

---

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors |
| `npm run typecheck` | clean |
| `npm test` | **3081 passed, 311 files** |
| CI on #334 | verify + E2E green |
| CI on #336 | verify + E2E green |
| Deploy | green, health check passed |
| Running commit | `08b8fc2` on `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info` - the **direct** App Service URL, by hash, not the CDN domain and not liveness |
| Probe re-run after deploy | identical - 55 live, 27 sendable, 8 stranded; no drift from the deploy |

No schema change, no migration, no send-path change. Nothing was sent.

---

## Two process notes worth keeping

**The stacked PR went sideways.** #335 was opened against the probe branch so it
would read as a clean stack. `gh pr merge --auto` then landed it on that branch
rather than `main`, and GitHub refuses to retarget a closed PR. Reopened as #336
against `main` and merged there. No work was lost, but next time: only stack a
PR if the base branch is genuinely going to stay open.

**The queue's own integrity test caught me.** I appended rows 84-86 to the end
of the table, which put three fresh `TODO` rows **below** row 48, which is
`BLOCKED`. The picker stops at a blocked row, so all three would have been
invisible - the same class of stall that cost seventy minutes on cycle 59.
`relay/queue-file-integrity.test.ts` failed with exactly that message. Moved
above row 48, re-ran, 32 assertions green. That test earned its keep today.

---

## What this cycle deliberately did not do

**Reconnect the eight stranded mailboxes.** Each needs the mailbox owner to sign
in at Microsoft or Google in a browser. That is the client's own action on a
paying client's workspace, and no relay cycle may do it. Recorded as row 84 with
the full list.

**Fix the sixty-day-old "finish sign-in in the window" label** (row 85). A
mailbox pending since June still tells the operator to finish a sign-in nobody
is standing at. Same defect class as the dead-mailbox labels cycle 7 corrected,
but it is a labelling change, not a credential-lifecycle one, and the obvious
signal (`oauthStateExpiresAt` in the past) is probably NULL on all eight because
that column is new - so it needs measuring first, exactly as this row did.

**Stop a failed reconnect demoting a mailbox whose old credential still works**
(row 86). Disclosed rather than hidden, because this cycle's change makes it
newly reachable: a CONNECTED mailbox now keeps its credential through the round
trip, so a callback failure can mark a still-working mailbox as failed, which
the old code could not do because the credential was already gone by then. It is
strictly better than before and it is not a regression - but it is the same
defect one step downstream, and an operator is present to see the banner, which
is why it was not bundled in.

---

## Open questions: 2

1. **Will you chase the eight reconnects?** Two clients (protech-roofing,
   chevron-security) have two dead mailboxes each, greentheuk has two, and
   panda-recycling's single mailbox is dead while the workspace is still
   ONBOARDING. Twenty-eight of fifty-five live mailboxes cannot send. Only the
   mailbox owners can fix this.
2. **The Google OAuth app, for the third time.** Two of the eight are Google, and
   Testing mode expires those refresh tokens weekly, forever. Publishing the app
   is the only thing that stops the recurrence. You have declined twice; I am
   recording the cost rather than re-arguing it.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 73 - timed-out

KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.

Started 2026-08-28 21:50:17, took about 45 minutes.
How it ended: killed at the 45 minute deadline.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: clients/mailbox-connection-actions.ts, bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 73 - queue item 74

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **PRESSING CONNECT DESTROYS A WORKING MAILBOX'S CREDENTIAL BEFORE THE OPERATOR HAS SIGNED IN, SO AN ABANDONED RECONNECT SILENTLY STOPS THAT MAILBOX SENDING.** Found by cycle 64 while doing row 50, not looked for, and NOT fixed there - row 50 was a state-expiry question and this is a credential-lifecycle question. `prepareMailboxOAuthConnection` (`src/app/(app)/clients/mailbox-connection-actions.ts`) opens its transaction with `tx.mailboxIdentitySecret.deleteMany({ where: { mailboxIdentityId: row.id } })` and then sets `connectionStatus: "PENDING_CONNECTION"`, `providerLinkedUserId: null`, `connectedAt: null`. **All of that happens before the browser is even redirected to the provider.** So a single click on Connect against a healthy CONNECTED mailbox immediately deletes its stored refresh token; if the operator then closes the tab, picks the wrong account, or simply wanders off, the mailbox cannot send until somebody completes a full reconnect. Nothing warns them, and the row just reads "Pending connection". **Cycle 64's own change makes this sharper and that is disclosed deliberately**: before row 50, an abandoned link could still be completed hours later and would restore the mailbox; now the state expires after 15 minutes, so the only route back is pressing Connect again. The new `expired_state` banner does say exactly that ("Press Connect on the row below"), which is the mitigation, but it only helps the person who actually returns to the callback - it cannot help the operator who never comes back. **Measure before building, as with row 50.** Candidate fixes, none chosen: keep the existing secret until the new one is proven and swap atomically in the callback (best, but needs care so a half-finished reconnect cannot leave two credentials); or leave the delete where it is and warn on the Connect button when the mailbox is currently CONNECTED and sending. Check first whether any live mailbox is sitting in PENDING_CONNECTION with no secret right now - if so, that is a client-visible outage already in progress and it outranks the code change.

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
  `DONE 73`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 73 - ...** |` reads correctly.
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

* Finished it -> `DONE 73 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 73 - <what is done, what is left>`. PARTIAL
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


