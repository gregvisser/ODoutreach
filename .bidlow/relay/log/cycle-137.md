# Cycle 137 - queue item 110

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 110's status cell
   only), `.bidlow/relay/log/cycle-137.md` (this file). No application code
   file is named yet, because whether any Graph code gets touched at all
   depends entirely on the gate check below.
2. **The red-first test:** none yet. Row 110 forbids starting the Microsoft
   Graph work - draft-then-send, the `rfc822MessageId` capture, the
   `BY_THREAD_REF` test, the step-2-failure cleanup test - until row 108's
   Gmail fix is observed working in production. Until that gate is met there
   is nothing to write a red test against; writing one anyway would be
   scaffolding for code the row says not to start.
3. **What "done" looks like today:** either the gate is met and I start the
   Graph work for real (three red-first tests, then green), or the gate is
   still not met and this row stays `TODO` with a fresh, dated confirmation
   of why - a non-coder can check this by reading whether any Google mailbox
   shows `CONNECTED` in the probe output below.
4. **What I must not touch:** the Microsoft Graph send path, `execute-one.ts`'s
   Gmail branch, `process-synced-replies.ts` legs 2/3, any row 111-116 content
   already sitting in `QUEUE.md` (added by the supervisor this morning - see
   row 110's own text about not losing them), and `.bidlow/GRADES.json`.

## PR sweep

`gh pr list --state open` showed one PR: #434 (cycle 136's own docs commit,
"row 108 gate not met, leave TODO"), checks green, mergeable. Merged it
(squash, `f266746`). No other open PRs. No RED PRs to leave a comment on.

## Row 110 - re-checking the gate, not assuming yesterday's answer still holds

Cycle 136 (about an hour before this cycle started) measured the same gate
and found it not met: row 108's Gmail fix is merged and deployed
(`d083bfc`), but never observed working, because every Google mailbox was
disconnected. Rather than assume nothing changed in an hour, I re-ran the
check - using the repo's own official read-only tool
(`.github/workflows/mailbox-credential-probe.yml`, `scripts/ops-mailbox-credential-probe.ts`)
instead of repeating cycle 136's ad-hoc firewall-rule-plus-raw-SQL approach,
since a lower-risk path to the same evidence was already sitting in the repo.

Triggered fresh: `gh workflow run mailbox-credential-probe.yml` -> run
[33300432912](https://github.com/gregvisser/ODoutreach/actions/runs/33300432912),
completed 2026-08-30T07:59Z, exit success.

Result, verbatim from the run log:

```
Live mailboxes by status and stored credential:
   27  CONNECTED + credential
    3  CONNECTION_ERROR + NO credential
    4  CONNECTION_ERROR + credential
    2  DISCONNECTED + credential
   11  DRAFT + NO credential
    8  PENDING_CONNECTION + NO credential

27 of 55 live mailboxes can send right now (CONNECTED and holding a credential).
```

Cross-referencing the per-mailbox detail in that same run against provider:
every `GOOGLE` mailbox listed (adam@greentheuk.com, joe@greentheuk.com, and
the others cycle 136 named) appears under the stranded/pending/error groups,
none under `CONNECTED`. **Zero of the system's Google mailboxes can send
right now** - the same structural finding as cycle 136, confirmed fresh
rather than assumed stale. Today is still Sunday 2026-08-30, so
`process-outbound-queue.yml` (weekdays only) will not fire regardless.

So the gate - "row 108's fix merged, deployed AND OBSERVED WORKING IN
PRODUCTION" - is still not met, for the same structural reason: there is no
live Gmail mailbox capable of sending a test through the fixed code path.
This is not a new finding; it is today's confirmation that yesterday's
finding has not changed, obtained without re-opening a firewall rule or
touching the database directly.

Per row 110's own instruction, the row stays `TODO`. No Microsoft Graph
code, test, or send-path file was touched this cycle. No schema change. No
migration. No email sent. No client data written or read directly - the
only production contact this cycle was triggering the repo's existing
read-only GitHub Actions probe, which itself runs a read-only Prisma query
against production and returns aggregate counts, not row contents.

## Row 110's own note about rows 111-116

Row 110's current text (added by the supervisor, not by this cycle) says
`QUEUE.md` on disk carries six new rows - 111 through 116 - that have been
silently lost twice by cycles that committed an older version of the file.
Checked: all six (111, 112, 113, 114, 115, 116) are present in the working
tree right now, all status `TODO`. Row 115 in particular (Greg's written
authorisation for the relay to send one real email, to himself, for
`bidlowai`, once row 109 is confirmed deployed) is intact. This cycle's
commit includes `QUEUE.md` exactly as found on disk, with only row 110's own
status cell edited - nothing in 111-116 was reordered, reworded, or
renumbered.

## What it did

- Merged PR #434 (green, cycle 136's docs).
- Re-ran the mailbox credential probe fresh rather than trusting yesterday's
  reading; confirmed the same structural block (0 Google mailboxes
  `CONNECTED`).
- Confirmed rows 111-116 are present and untouched in the working `QUEUE.md`.
- Updated `.bidlow/relay/QUEUE.md` row 110's status cell to record this
  cycle's re-confirmation.
- No gates to run (lint/typecheck/test) - no application code was changed.
