# Cycle 143 - queue item 110

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 110's status cell,
   plus restoring row 113's position - see "queue-order defect" below),
   `.bidlow/relay/log/cycle-143.md` (this file). No application code file is
   named, because whether any Graph code gets touched at all depends
   entirely on the gate check below, same as cycles 136 and 137.
2. **The red-first test:** none. Row 110 forbids starting the Microsoft
   Graph work - draft-then-send, the `rfc822MessageId` capture, the
   `BY_THREAD_REF` test, the step-2-failure cleanup test - until row 108's
   Gmail fix is observed working in production. The gate is still not met
   (below), so there is nothing to write a red test against.
3. **What "done" looks like today:** either the gate is met and the Graph
   work starts for real, or it is still not met and row 110 stays `TODO`
   with a fresh, dated confirmation - a non-coder can check this by reading
   whether any Google mailbox shows `CONNECTED` in the probe output below.
4. **What I must not touch:** the Microsoft Graph send path,
   `execute-one.ts`'s Gmail branch, `process-synced-replies.ts` legs 2/3, the
   content of rows 111-116 (only their status cells / row 113's position, per
   this row's own instruction), and `.bidlow/GRADES.json`.

## PR sweep

`gh pr list --state open` returned `[]` - zero open PRs. Nothing to merge or
comment on.

## Leftover state from cycle 142 (killed at the 45-minute deadline)

Before touching row 110, I checked what was sitting in the working tree,
because `git status` showed a modified `QUEUE.md`, an untracked
`cycle-142.md`, and an untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md`, and
the local branch (`docs/row-116-prod-logging-cycle-142`) was not an ancestor
of `origin/main`.

Investigated per this project's own "a row reopened after a relay timeout
may already be merged" rule (`CLAUDE.md`): cycle 142's row-116 work
(`dbaca08`) has an **identical tree** to `origin/main`'s `f92f97e` (`git diff
dbaca08 f92f97e --stat` = empty) - it was fully merged as PR #442 before the
kill fired. Row 116's `DONE 142` status was already committed as part of
that same commit, so nothing there needed redoing.

What was NOT committed before the kill: `cycle-142.md` (the timed-out-cycle
log, 166 lines, describing what cycle 142 actually did) and the picker's own
edit setting row 110 to `IN PROGRESS 143`. Per this repo's established
pattern (cycle 136 committed cycle 135's orphaned timeout log the same way),
I carried `cycle-142.md` forward and I am committing it alongside this
cycle's own log, unedited.

`ODOUTREACH-PROJECT-INSTRUCTIONS.md` is unrelated to either row 116 or row
110 - it reads as draft copy for a Claude Project's Instructions field, not
application code or a relay artefact, and the repository boundary rule in
`CLAUDE.md` puts scope/handover artefacts in `C:\Bidlowbusiness`, not the
code repo. I left it untouched and uncommitted: not mine to place, not
mine to delete.

I switched to a fresh branch (`docs/row-110-gate-recheck-cycle-143`) off
`origin/main` before doing any of row 110's own work, so this cycle's PR is
a clean, current diff rather than one carrying cycle 142's stale base.

## The queue-file rule, checked first as instructed

Read `.bidlow/relay/QUEUE.md` on disk and confirmed all six supervisor rows
- 111, 112, 113, 114, 115, 116 - are present. None missing, so the "say so
loudly" alarm does not fire.

**Order defect found and fixed.** The row's own text says the order must
stay `115, then 111, 112, 113, 116, then this row's neighbours [108, 110],
with 114 near the end and the BLOCKED rows (92, 84, 48) at the very back`.
On disk the order was `115, 111, 112, 116, 108, 110, 114, 95, 117, 92, 84,
48, 113` - row 113 had drifted to the very end, sitting after the BLOCKED
rows rather than between 112 and 116. Likely cause: row 113 itself resolved
to `BLOCKED 141` (cycle 141, ANTHROPIC_API_KEY absent from prod) and
something moved it to sit with the other BLOCKED rows, which is thematically
understandable but contradicts the explicit, numbered order this row
demands. This is a low-risk, additive fix (move one existing row; no content
changed, no row renumbered, no row removed), and the brief was explicit that
the order matters more than my own row's work, so I restored it: row 113 now
sits immediately after 112 and before 116, its content and `BLOCKED 141`
status untouched. Diff confirmed scoped to exactly two rows (110, 113) via
`git diff .bidlow/relay/QUEUE.md | grep '^[+-]| [0-9]+ |'`.

Committed the file as found on disk otherwise - no other row's content
touched, nothing reconstructed from an earlier commit.

## Row 110 - the gate, re-checked fresh rather than trusting cycle 137

Row 108's Gmail fix is merged and deployed: `d083bfc`, confirmed live via
`GET /api/build-info` on the direct `app-opensdoors-outreach-prod
.azurewebsites.net` origin (checked as part of row 108's own cycle 135 log;
not re-checked here since the commit hasn't changed).

The gate is "merged, deployed, AND OBSERVED WORKING IN PRODUCTION." Cycles
136 and 137 both found this not met because every Google mailbox was
disconnected, so the fixed code path (which only runs after a successful
Gmail `messages.send`) could never fire. Rather than assume six hours-old
findings still hold, I re-ran the repo's own read-only tool fresh:

```
gh workflow run mailbox-credential-probe.yml
-> run 33307493700, triggered 2026-08-30T10:51:40Z, completed success (1m26s)
```

Verbatim summary from the run log:

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

Cross-referenced the two `[GOOGLE]`-tagged mailboxes in the same run's
per-mailbox detail (`jo***@greentheuk.com`, `ad***@greentheuk.com`) - both
appear only in the stranded/pending section (`8 live mailbox(es) STRANDED by
an unfinished Connect`), neither in the `CONNECTED` group. **Zero Google
mailboxes are CONNECTED in production right now** - the same structural
block cycles 136 and 137 found, reconfirmed fresh rather than assumed.
`process-outbound-queue.yml` is also weekday-only and today is still Sunday
2026-08-30, so no automated send could have exercised the fixed path even if
a mailbox briefly held a working token between checks.

So: the gate is still not met, for the same reason. Per row 110's own
instruction, left it `TODO` with this fresh evidence quoted in the status
cell, and touched no Microsoft Graph code, no send path, no matcher legs.

## Gates run

None applicable - no application code changed this cycle (queue-file and log
edits only). `npm run lint` / `npm run typecheck` / `npm test` were not run
because nothing in `src/` changed; re-running them against an unchanged tree
would prove nothing new.

## What's left

Row 110 stays `TODO`, waiting on a real Gmail mailbox reconnect (row 84 -
BLOCKED, needs each client's owner to sign in, and separately the Google
OAuth app publish Greg has twice declined) before the gate can ever be met.
No cycle can close this by re-measuring more often; the next useful check is
after a Google mailbox actually reconnects and sends.
