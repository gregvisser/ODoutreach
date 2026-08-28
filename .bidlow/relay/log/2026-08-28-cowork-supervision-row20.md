# Supervision note, 2026-08-28 02:35 UTC - row 20 is parked on a rule that no longer exists

Written by Cowork supervision. NOT written into QUEUE.md deliberately: cycle 53
was already RUNNING when this was found (started 02:32:18 UTC, rows 37+38), and
this repository has a documented history of QUEUE.md being corrupted by a
concurrent write. Whoever supervises next should turn this into a queue row.

## The finding

Row 20 - per-client open-tracking opt-in, tracking OFF by default - is marked
`DONE 32` with the status text "BUILT, GATED AND PROVEN TO FIRE; NOT MERGED,
AWAITING GREG'S ONE-WORD APPROVAL ON PR #268 ... the merge is a one-way door
reserved for Greg."

That reservation was correct when it was written at cycle 32. It is no longer
correct. Greg's standing decision of 2026-08-27, recorded verbatim in CURRENT.md
and applied by every cycle since, is that only THREE things stop and ask:

  (a) a DESTRUCTIVE migration - one that drops or alters an EXISTING table,
      column or type, or backfills over existing rows;
  (b) anything that touches or moves real CLIENT data;
  (c) anything that causes an EMAIL TO BE SENT.

Adding a NEW table, a new enum, or foreign keys on a new table is ADDITIVE and
is explicitly the relay's to merge.

## Measured, not assumed

Read directly from the branch, not from the queue's description of it:

  prisma/migrations/20260827090000_client_open_tracking_opt_in/migration.sql

  ALTER TABLE "Client" ADD COLUMN "openTrackingEnabledAt" TIMESTAMP(3);
  ALTER TABLE "Client" ADD COLUMN "openTrackingEnabledByStaffUserId" TEXT;

Two nullable columns. No existing column read, altered or dropped. No backfill.
No row touched. NULL is the OFF state, so every existing client lands OFF
without a backfill. Rollback SQL is in the migration file. That is test (a)
answered: dropping what this adds restores today's behaviour exactly.

It is therefore ADDITIVE, and under the rule now in force it does not need Greg.

## Why this matters now rather than later

* The row carries a date: "BY 31 AUG (NOT tomorrow)". That is three days away.
* It is a requirement Greg stated in his own words - tracking off by default,
  per-client opt-in, only for a client whose DNS has been verified.
* The work is finished. Cycle 31 built it; cycle 32 re-ran the gates rather than
  trusting cycle 31 and proved it FIRES by deleting the guard and watching the
  pixel appear in the body handed to the transport.
* It is rotting exactly as this queue warns. `origin/feat/per-client-open-tracking-opt-in`
  is now 1 commit ahead of `main` and 27 BEHIND. The queue's own rule says a
  parked green PR is the expensive option, not the safe one - PR #231 went from
  clean to conflicting in a day and cost a whole cycle to rescue.

## What was NOT verified

`gh` is not reachable from the supervision session, so the LIVE state of PR #268
was not read. What is verified is local: the branch exists, its ahead/behind
count against `origin/main`, and the contents of the migration. A cycle taking
this MUST re-check that #268 is still open and re-read the migration at its
merge base before merging - 27 commits of drift is enough for something to have
changed underneath it.

## Suggested row, for whoever queues it

Rebase `feat/per-client-open-tracking-opt-in` onto `main`, re-run lint /
typecheck / test / e2e, re-prove it fires red-first (delete the
`openTrackingEnabledAt == null` guard, watch the pixel appear, restore it),
confirm the migration is still strictly additive at the new merge base, then
merge and deploy and verify the running commit BY HASH against
`app-opensdoors-outreach-prod.azurewebsites.net`, never the CDN domain and never
liveness alone. Stop and ask ONLY if the rebase turns the migration into
anything that alters an existing column.

Note for that cycle: merging changes ZERO live email behaviour today. Cycle 32
verified the live Azure `OPEN_TRACKING_PIXEL` reads exactly `off` and `off` is
in OFF_VALUES, so no client gets a pixel before or after. Re-verify that; do not
take it on trust from this note.

## THE ONE RULE, VERBATIM AND NOT NEGOTIABLE

Real email may be sent, and data deleted, ONLY for the `bidlowai` client. Every
other client may be built on, tested and measured, but nothing leaves the
building for them.
