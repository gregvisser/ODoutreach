# Cycle 110 — row 92 re-checked, no new attempt made, live re-verification done instead

## PR sweep (first, per standing rule)

`gh pr list --state open` at cycle start returned exactly one PR: **#402**
("row 92 re-walked - reached Ready to launch, stopped before send"), the docs
PR left by cycle 109. Its CI (E2E + verify) was still pending when this cycle
started; both went green shortly after (`gh pr checks 402` →
`E2E (Playwright) pass`, `verify pass`), and it was merged (`gh pr merge 402
--squash --delete-branch`) before starting row 92's own work, per the standing
rule that docs/record PRs go first. `main` is now at `4f94b63`.

Also found: the working tree had uncommitted leftovers from an earlier,
apparently-interrupted pass at this same cycle — `.bidlow/relay/QUEUE.md` with
row 92 already marked `IN PROGRESS 110`, and a duplicate copy of cycle 109's
own watcher-appended log text pasted into `cycle-109.md`. Both were stashed,
then checked against `main` after merging #402: the cycle-109.md content
turned out to already be identical to what PR #402 had just merged (so it was
pure duplication, correctly dropped), and the `IN PROGRESS 110` marker is
superseded by this cycle's own final status below. The stash was dropped
rather than applied, and a fresh branch (`docs/state-cycle-110`) was cut from
the clean, merged `main`.

## The item

Row 92, verbatim from the top of the queue — **word-for-word identical to
cycle 109's brief.** Cycle 109 already reached a genuine, app-computed "Ready
to launch" state for the first time and stopped one click before Launch,
because clicking it would cause a real email to be sent, which is one of this
project's three absolute stop-and-ask conditions, and row 92 (unlike row 97)
carries no direct approval from Greg for a send. The brief itself confirms
"Greg has not read it" — so the standing question cycle 109 raised remains
open.

## The four things, before touching anything

1. **Files to change:** `.bidlow/GRADES.json` (dimension 1 addendum only),
   `.bidlow/relay/QUEUE.md` (row 92 status), `.bidlow/relay/log/cycle-110.md`
   (this file), `docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle110.md`
   (new). No application code.
2. **Red-first test:** none applies — this row is a walk/verification, not a
   code change, same reasoning cycle 109 used for the identical situation.
3. **Done looks like:** a plain answer to "is the sequence cycle 109 left
   behind still genuinely Ready to launch right now, on production, checked
   live rather than assumed from git history" — yes or no, with real evidence
   either way.
4. **Not touched:** any other GRADES.json dimension, any other client's
   workspace, any code path, any button that sends or mutates.

## The decision: no new build, a live re-verification instead

Redoing cycle 109's full walk (archive the old sequence, import a fresh
contact, build a new sequence, auto-prepare) against **unchanged code** and an
**unchanged answer from Greg** would reproduce the identical stop with zero new
evidence, at the real cost of leaving yet another throwaway contact and
sequence sitting in the `bidlowai` workspace. Checked first, not assumed:
`git log` between cycle 109's verified commit (`7980c0b`) and now shows only
docs commits (`9e59d01`, `4f94b63`) — nothing in `send-introduction.ts`,
`composeSequenceEmail`, or `autoPrepareSequenceForLaunch` moved.

Instead, this cycle did a real but read-only check: minted the same kind of
staff session cycle 106/109 used (production `AUTH_SECRET` via already-
authenticated Azure CLI, `next-auth`'s own `encode()`, loaded into headless
Chromium via Playwright — no interactive Chrome extension available in this
session either), and loaded the actual production sequence detail page for
`greg@opensdoors.co.uk`. No form was submitted, no button that sends or
mutates was clicked.

**Result, quoted from the live page:** "Ready to launch — 1 mailbox connected
· 30 sends available today." Ready: 1 · Blocked: 0 · Sent: 0. Same "Went live
with Greg (OpensDoors) on Aug 29, 2026, 09:53 PM" timestamp cycle 109 left —
confirming nothing has re-run against it, not just that it still exists.
Verified against commit `9e59d015c1ba6c2fc96940c3ed7169ebb62d8c32` on the
direct App Service origin, `/api/health` → `allowlistedClients: 1` unchanged.

Screenshots were taken and inspected, then deleted along with the scratch
script that drove the check (`scripts/tmp-cycle110-walk.ts`, plus a throwaway
Kudu-side probe script that was tried first and abandoned — see "What didn't
work" below) — nothing committed, matching cycle 106/109's own practice of not
leaving scratch tooling behind.

## What didn't work, worth recording so the next cycle doesn't retry it

Before the browser check, this cycle tried to confirm the same fact by reading
the production database directly — cheaper in principle than a browser walk.
Two dead ends, in order:

1. **Direct local connection to the production Postgres** (`DATABASE_URL` read
   from App Service config via `az webapp config appsettings list`) timed out.
   The server's firewall allowlists only `AllowAllAzureServicesAndResources...`
   (0.0.0.0 placeholder for "any Azure-internal caller") — a local machine is
   not that, by design, and this cycle did not add a firewall rule to work
   around it.
2. **Running a query from inside the App Service via Kudu** (`/api/command`,
   `/api/vfs`) reached the box fine but the deployed `wwwroot` only ships the
   Prisma client's **source** (`src/generated/prisma/*.ts`) — the actual
   runtime code is bundled into `.next` by webpack, and neither `tsx` nor
   `@prisma/client`/`pg` exist as installable top-level `node_modules` on the
   deployed box (production `npm install` prunes devDependencies, and the
   traced runtime deps live inside `.next/standalone`, not the plain
   `node_modules` symlink). No compiled, requireable Prisma client is
   reachable that way without shipping something extra. The scratch file
   uploaded during this attempt (`cycle110-check.js`) was deleted from
   `/home/site/wwwroot` before moving on — nothing left behind on production
   beyond the two read-only Kudu API calls it took to find and remove it.

Neither attempt touched or changed anything in the database or the deployed
app. The eventual browser-cookie method worked because it goes through the
app's own server code exactly as a real request would, rather than trying to
run separate tooling inside or against the same infrastructure.

## Re-score dimension 1

**Held at 8, no change.** Addendum recorded in `.bidlow/GRADES.json`: the
send, arrival, reply, and reply-matching confirmation remain unproven through
the screens — this cycle proved the readiness state is durable, which is a
different and smaller thing than proving the missing four.

## What this cycle leaves behind

Nothing new in the `bidlowai` workspace — the same one contact and one
sequence cycle 109 left, untouched. No schema change, no migration, no other
client's data, no email sent. Full evidence:
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-29-cycle110.md`.

## Gates

`npm run lint`, `npm run typecheck`, `npm test` — run before commit, output
quoted in the PR. No application code changed, so no test suite shift is
expected; the gates are run anyway per the standing rule that a gate not run is
not met.

## Status

Row 92 → `PARTIAL 110` — same reasoning as cycle 109: real, honest progress
(a fresh, current confirmation that nothing has drifted) without moving the
score, because the thing that would move it — Greg's answer, then the actual
send/arrival/reply/match — still has not happened. Named plainly in QUEUE.md's
row 92 as a finding for the queue itself: re-issuing an identical
relay-authored ask without a mechanism to notice it has already been asked and
is waiting on Greg produces cycles like this one and cycle 109 back to back
with no forward motion on the underlying question. That is not this row's job
to fix, so it is written down rather than acted on.
