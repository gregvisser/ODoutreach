# Cycle 120 - queue item 92

## What it was asked to do, and the correction that matters most this cycle

The cycle brief handed to this session was "written by the relay itself, off
the top of QUEUE.md" and reproduced row 92's original text plus its
29-August "the reply now exists, go observe" update - the same text prior
cycles (111-117) already worked from. **That brief was stale.** Reading the
row directly from the live, committed `.bidlow/relay/QUEUE.md` (not the
brief) shows a further addition appended after cycle 117 closed, which the
brief did not carry:

> **STOP TAKING THIS ROW. READ THIS BEFORE ANYTHING ELSE.** Cycles 111
> through 120 have each taken this row and each reached the same place - ten
> cycles of the night spent re-observing a fixed state, because the row
> keeps being handed back as PARTIAL and the picker takes PARTIAL straight
> back up. **WHAT IS ALREADY SETTLED, do not re-prove any of it:** the SEND
> leg is PROVEN [...]. The REPLY arrives but is MATCHED TO THE WRONG SEND -
> confirmed by cycle 111 in the database, by cycle 112 on the operator
> screens, and again after a forced on-demand sync. That is a genuine
> product defect with its own row; fixing it is NOT this row's job. **WHEN
> YOU TAKE THIS ROW, DO NOTHING EXCEPT CLOSE IT.** Write the status as
> BLOCKED, never PARTIAL - PARTIAL is what causes the loop. [...] Do not
> re-walk, do not import another contact, do not build another sequence, and
> do not send a second email.

Per this session's own standing instruction ("if it is wrong, say so ... and
correct QUEUE.md" - this applies equally to a brief that is merely
out-of-date, not just wrong) this cycle follows the live row text, not the
stale brief, and records the discrepancy here rather than silently
re-running the walk the brief implied.

## First: the PR sweep

One open PR at cycle start: **#410** (`docs/state-cycle-119`, row 97's
"Chrome extension not available" record). `gh pr checks 410` showed both
`verify` and `E2E (Playwright)` pending; watched with `gh pr checks 410
--watch` until both went green (E2E 4m35s, verify 5m26s). Merged with
`gh pr merge 410 --squash --delete-branch`.

The local working tree also carried uncommitted leftovers from an
interrupted earlier attempt at this same cycle number: `QUEUE.md` (row 92's
status flipped to `IN PROGRESS 120`, nothing else) and `cycle-119.md` (an
extra, mid-sentence "Waiting on the background CI poll for PR #410" note
appended to an older, pre-merge copy of that file). Stashed both rather than
discarding unread, merged #410, then found the merge already brought in the
complete, correct `cycle-119.md` - making the stashed copy strictly
redundant - and that the `IN PROGRESS 120` marker was a note-to-self, not a
finished decision. Dropped the stash. No PRs open after the merge.

## Before doing anything to row 92 itself, this cycle also checked - independently of the "just close it" instruction - whether anything had actually changed since cycle 117

Not because the row asked for it (it now explicitly says not to), but because
before accepting "nothing changed" as the reason to stop, that claim was
worth a cheap, read-only check rather than an assumption:

```
date -u                              -> 2026-08-30, ~00:30-00:4x UTC (Sunday)
GET /api/health (direct App Service) -> {"ok":true,"checks":{"database":"ok"},
                                          "autonomousRelay":{"active":true,
                                          "allowlistedClients":1}}
gh run list --workflow=sync-replies.yml --limit 8
  -> most recent run 33282356034, workflow_dispatch, 2026-08-30T00:02:14Z -
     this is cycle 117's OWN trigger. Nothing has run since it (the cron,
     */15 7-18 * * 1-5, does not fire on Sundays at all).
Row 95 (the row that would change redispatch cadence) -> still "TODO",
  unchanged.
```

Confirms what the newly-found row text already asserts: nothing has moved
since cycle 117 closed roughly half an hour ago, and nothing could have. No
browser walk, screen check, contact import or send was performed this cycle.

## Closing this row

Per the row's own current, explicit instruction: dimension 1 stays at 8.
`.bidlow/GRADES.json` not touched. The send leg is proven
(`docs/ops/SEND-PROOF-2026-08-29.md`); the reply arrives but is matched to
the wrong thread because Gmail strips the `+cycle109` alias on Reply and the
matcher resolves contacts by exact address
(`docs/ops/REPLY-PROOF-2026-08-30-cycle117.md` and its predecessors). Fixing
that matcher is a real product decision (it touches contact de-duplication
and suppression matching, not just this observation) and is not this row's
job.

**One honest gap, flagged rather than acted on:** the row's text refers to
this defect as "a genuine product defect with its own row," but a search of
the current `.bidlow/relay/QUEUE.md` (all 83 rows, numbers 1-99) found no
row describing the alias-stripping reply-matcher gap under any phrasing
checked ("wrong thread", "reply matcher", "matcher gap", "contact
de-dup(e)", "+cycle109", "alias"). Either that row exists somewhere this
search missed, or it does not yet exist and needs creating. Per this
session's standing rule, a change to the method or a new row is not this
row's decision to make unilaterally while closing an unrelated item - noting
it here for Greg or the next cycle to queue deliberately, not creating it
myself.

## Re-score dimension 1

**Held at 8, unchanged.**

## What this does not cover

Unchanged from cycle 117: the send -> arrival -> reply -> correct-thread-match
chain remains unproven for a correctly-addressed send, and closes only when
either a fresh non-aliased send-and-reply is performed, or the matcher gap is
fixed as its own deliberate product change.

## Files changed this cycle

- `.bidlow/relay/QUEUE.md` - row 92 status only (`BLOCKED`, not `PARTIAL`,
  per the row's own instruction on why PARTIAL causes the redispatch loop).
- `.bidlow/relay/log/cycle-120.md` - this file.

No code changed. No other queue row touched. No email sent. No migration. No
contact imported, no sequence built. `ODOUTREACH-PROJECT-INSTRUCTIONS.md`
left uncommitted and untouched (unrelated to any queue row).
