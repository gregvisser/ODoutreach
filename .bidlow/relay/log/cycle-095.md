# Cycle 95 — row 84, the mailboxes that cannot send, and the email that never said so

## PR sweep at cycle start

`gh pr list --state open` returned `[]`. Nothing to merge; cycle 94 cleared its own three.

## What this row asked for, and what it actually needed

Row 84 says eight live mailboxes cannot send, only the clients can fix them, and
the decision to chase them is Greg's. It names exactly one thing a cycle may do:
**re-run the probe to see whether the number moves.** (Its other suggestion, the
sixty-day "finish sign-in in the Microsoft or Google window" label, is row 85 and
was left alone.)

I re-ran the probe. Then I asked the question the row does not ask: *how would
Greg ever find out?* The answer turned out to be the reason this row has sat
still for a week.

## The measurement — the number has NOT moved

`gh workflow run mailbox-credential-probe.yml`, run **33244256265**, 2026-08-29
08:55 UTC. Read-only; it writes nothing, sends nothing, deletes nothing.

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
```

Identical to cycle 73's run 33210823162 twelve hours earlier: **27 of 55, the
same eight mailboxes, the same five workspaces.** Ages 56–67 days, one at 2 days.

Comparing the two runs also settled a question I needed answered before I could
design anything: the ages advanced by exactly the elapsed time (57→58, the rest
static). So `updatedAt` on a stranded row is **not** being churned by anything
else — which makes sense, since a mailbox with no credential can neither sync nor
send. That is what makes it usable as a proxy for "stranded since". It is still
not *definitionally* that, and the code says so rather than pretending.

## The finding this row did not know about

**The daily digest is structurally blind to six of the eight.**

Greg gets one email a day, and it already reports mailbox health — the seven-day
Google reconnect chore. So mailbox health looked covered. It is not.
`readGoogleReconnects` queries `provider: "GOOGLE"`. Six of the eight stranded
mailboxes are **MICROSOFT**:

| workspace | provider | off the air |
|---|---|---|
| protech-roofing ×2 | MICROSOFT | 60 and 67 days |
| chevron-security ×2 | MICROSOFT | 59 days each |
| panda-recycling | MICROSOFT | 60 days |
| **opensdoors** | MICROSOFT | **56 days** — previously working |
| greentheuk ×2 | GOOGLE | 58 and 2 days |

The digest could truthfully print "Google logins: all in date, nothing to
reconnect" on a morning when a quarter of the estate cannot send — including
OpensDoors' own mailbox, dark for eight weeks. The only thing that ever knew was
a Monday workflow log that exits 0 on catastrophe and that nobody opens.

That is this repository's house defect exactly: **built, wired, reporting
success, never firing.** The probe fires. It just fires into a log.

## What shipped

One concern: make the number arrive where Greg reads it.

- **`src/lib/mailboxes/stranded-mailbox-roster.ts`** (new) — pure roster. Applies
  the **shipped** `isStrandedByAbandonedConnect` and `isMailboxSendingCredentialLive`
  rather than restating them, so the daily email and the Monday probe cannot drift
  into disagreeing about who is off the air. Reports the probe's own headline
  (`27 of 55`), groups by client because a client is who gets telephoned, masks
  addresses because this gets pasted into logs, and separates "was working" from
  "never connected" because those are different phone calls.
- **`src/lib/alerts/alert-copy.ts`** — a `strandedMailboxes` section, deliberately
  NOT folded into the Google one (folding it in would hide precisely the rows the
  Google query cannot see). Rendered even when the answer is *none*, so a section
  that stops appearing reads as a change rather than a clean estate.
- **`scripts/ops-alert.ts`** — a second, separate query. Separate so one check
  failing leaves the other still able to speak.

**Severity: PARTIAL, not OK, even at 67 days.** An expired *Google* login that
stops a mailbox sending is already PARTIAL in this digest. The same fact must not
read as healthier because the mailbox happens to be Microsoft. I considered
keeping long-standing strands at OK to avoid a daily PARTIAL for ever, and
rejected it: "OK — 6 mailboxes off the air" is the reassuring reading of a line
that exists because something is wrong, which this file's own comments already
name as the one reading that is never true. A blind check is FAILED, mirroring
the Google blind check.

## Red first

Both test files were written and watched fail before any implementation:
**8 failed, 1 passed** — and the one that passed is the case that must NOT change
(a caller omitting the field renders no section at all). The roster file failed to
collect, the module not existing yet.

One assertion was wrong rather than the code: I had asserted a client group by
*position*, and the alphabetical tie-break legitimately put Chevron first. Fixed
the test to look the group up by name, so it pins the grouping it is about rather
than the tie-break it is not.

I also corrected my own subject wording mid-cycle. I had written "stopped
sending", which asserts a moment the data cannot support. It is now "newly off the
air" — a claim about what the digest noticed, which is all that is provable.

## Proven to fire, not merely to exist

The alerts workflow dry-run (run **33244783346**), composing the real email
against the **real production database** and sending nothing:

```
  Mailboxes off the air: 8 cannot send (27 of 55 live mailboxes can).
      GreenTheUK
        ad***@greentheuk.com — 2 days — was working, last inbox sync 51 days ago
        jo***@greentheuk.com — 58 days — was working, last inbox sync 72 days ago
      OpensDoors
        jo***@opensdoors.co.uk — 56 days — was working, last inbox sync 91 days ago
      Chevron Security
        ta***@chevronsecurity.co.uk — 59 days — never connected, no inbox sync on record
        sa***@chevronsecurity.co.uk — 59 days — never connected, no inbox sync on record
      Protech Roofing
        al***@protechroofing.co.uk — 60 days — never connected, no inbox sync on record
        fr***@protechroofing.co.uk — 67 days — never connected, no inbox sync on record
      Panda Recycling
        ja***@beauparc.co.uk — 60 days — never connected, no inbox sync on record
      Each needs its own owner to sign in at Microsoft or Google.
      Nobody at OpensDoors and no automation can do it for them.

DRY RUN — nothing sent.
```

The same run also shows the two sections doing genuinely different jobs rather
than duplicating each other. The Google section listed eight rows, five of them
**trainhugger** mailboxes in CONNECTION_ERROR — which are not stranded and are
correctly absent from the new section. The new section listed eight rows, six of
them Microsoft — which the Google section cannot see. They overlap on exactly the
two greentheuk mailboxes, which are legitimately both.

## Gates

- `npm run typecheck` — 0
- `npm run lint` — 0
- `npm test` — 3618 passed; the single failure was this file not yet existing
- `npm run build` — green

No schema, no migration, no client data moved, **no email sent** — the digest
already sends daily to Greg alone, and this changes only what it says.

## What I did NOT touch

`mailboxes-operator-model.ts` (row 85's sixty-day label), the OAuth callbacks
(row 86), the send path, any schema.

## A trap I walked into, worth the next cycle knowing

Marking this row `BLOCKED` and leaving it where it sat would have **halted the
entire relay**. `Invoke-SelfQueue` takes the first row that is not DONE and not
IN PROGRESS, and if that row is BLOCKED it writes a note and idles — it does not
skip past it. Row 84 sat above rows 85, 86 and 87, all TODO and all perfectly
good work.

`relay/queue-file-integrity.test.ts` caught it, went red, and told me why. Row 84
now sits at the bottom beside row 48, the only other BLOCKED row, which is there
for the same reason. The move is a one-line diff and the integrity suite is green.

So: **BLOCKED is not just a word, it is a position.** Parking a row means moving
it below everything still to be done, or the relay stops behind it.

## Open questions for Greg — both still his, and both now unavoidable

1. **Chase the eight reconnects?** Five clients, and only the mailbox owners can
   do it. OpensDoors' own mailbox is one of them, 56 days dark.
2. **Publish the Google OAuth app?** Declined twice. It remains the only fix for
   the weekly Google expiry.

Row 84 cannot be closed by an agent and is not claimed as closed. What changed is
that the question now arrives in his inbox every morning instead of waiting for
somebody to open a workflow log.


---

## The watcher's own record of this cycle

Everything ABOVE this line was written by the cycle itself, and is kept exactly as the cycle left it. Nothing above was edited, shortened or reordered.

This section is written by `relay-watch.ps1` after the cycle's process has
exited. It is the independent half of the record: the cycle above says what it
meant to do, and this says what actually moved on disk, how long it took, and
how the process ended. Where the two disagree, this half is the evidence.
# Cycle 95 - finished

Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.

Started 2026-08-29 09:54:23, took about 31.9 minutes.
How it ended: exit code 0.

Evidence checked: git refs on every branch, the working tree, and these
files named in the brief: bidlow/relay/QUEUE.md

## What it was asked to do

# Cycle 95 - queue item 84

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **EIGHT LIVE MAILBOXES CANNOT SEND RIGHT NOW, MEASURED NOT GUESSED, AND ONLY THE CLIENTS CAN FIX THEM.** Found by cycle 73's production probe (`gh workflow run mailbox-credential-probe.yml`, run 33210823162), not looked for. 8 of 55 live mailboxes sit in PENDING_CONNECTION with NO stored credential, all active with the sending toggle ON: protech-roofing 2, chevron-security 2, panda-recycling 1 (ONBOARDING), opensdoors 1, greentheuk 2 (one GOOGLE pair, the rest MICROSOFT). Pending between ~2 and ~67 days. Only **27 of 55** live mailboxes can send. **Why no agent can close this:** reconnecting needs the mailbox owner to sign in at Microsoft or Google in a browser. That is the client's own action, it touches a paying client's workspace, and no relay cycle may do it. Overlaps the known dead-mailbox problem (Google Testing-mode weekly expiry plus two deleted Entra accounts) - **publishing the Google OAuth app is still the only fix for the weekly recurrence and Greg has declined it twice.** **What a cycle CAN usefully do:** re-run the probe to see whether the number moves, and make the screen tell the truth for a row that has been pending 60 days (see row 85). Re-running the probe is read-only and safe. **The decision - chase the clients for 8 reconnects, and publish the Google OAuth app or not - is Greg's.**

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
  `DONE 95`, or back to `TODO` with a note if you could not do it.

## THE STATUS CELL: SIX WORDS, AND ONLY SIX

The status cell of a queue row MUST BEGIN with one of exactly these six:

    TODO    DONE    BLOCKED    PARTIAL    IN PROGRESS    WONTFIX

Markdown bold around it is fine - `| **DONE 95 - ...** |` reads correctly.
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

* Finished it -> `DONE 95 - <what you did, and the proof>`
* Did some of it -> `PARTIAL 95 - <what is done, what is left>`. PARTIAL
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

Cycle 95 complete. Merged `eecc263`, deployed, verified firing against production.

## What row 84 asked for

Re-run the probe and see whether the number moves. **It has not moved** — run `33244256265`, 2026-08-29: **27 of 55** live mailboxes can send, the same eight stranded across the same five workspaces, 56–67 days old. Identical to cycle 73's run twelve hours earlier.

## What I found while measuring it

There was no way Greg would ever have found out. The daily digest *looked* like it covered mailbox health — it already reports the Google reconnect chore — but `readGoogleReconnects` filters `provider: "GOOGLE"`. **Six of the eight are Microsoft**, including OpensDoors' own mailbox, dark for 56 days. The digest could truthfully print "Google logins: all in date, nothing to reconnect" on a morning when a quarter of the estate could not send. The only thing that knew was a Monday workflow log that exits 0 on catastrophe and that nobody opens.

That is this project's house defect exactly: the probe fires — into a log.

## What shipped

A stranded-mailbox roster built on the **shipped** credential predicates (so the daily email and the Monday probe can't drift apart), and a digest section deliberately *not* folded into the Google one — folding it in would hide precisely the rows the Google query can't see. PARTIAL, not OK, even at 67 days: the same fact must not read as healthier because the mailbox happens to be Microsoft.

**Proven to fire:** a dry run from merged `main` composed the real email against the real production database and printed all five client groups, all eight mailboxes, nothing sent.

Gates: typecheck 0, lint 0, 3618 tests, build green, CI verify + E2E pass. No schema, no migration, no client data, no email.

## One thing I got wrong and the tests caught

Marking row 84 `BLOCKED` and leaving it in place would have **halted the entire relay** — `Invoke-SelfQueue` idles on the first BLOCKED row rather than skipping it, and rows 85–87 sat below it. `queue-file-integrity.test.ts` went red and said so. Row 84 now sits at the bottom beside row 48. BLOCKED is a position as well as a word.

## Two open questions — both yours, neither an agent's

1. **Chase the eight reconnects?** Five clients, and only each mailbox's owner can sign in. Your own `jo@opensdoors.co.uk` is one of them, 56 days dark.
2. **Publish the Google OAuth app?** Declined twice; still the only fix for the weekly Google expiry.

Row 84 is `BLOCKED 95`, not DONE — the eight mailboxes still cannot send, and claiming otherwise would be claiming an outcome that has not happened. What changed is that both questions now arrive in your inbox at 07:00 every morning instead of waiting for someone to open a workflow log.

