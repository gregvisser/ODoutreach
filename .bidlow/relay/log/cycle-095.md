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
