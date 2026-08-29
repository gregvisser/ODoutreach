# Cycle 111 — queue item 92

## PR sweep at cycle start

`gh pr list --state open` returned exactly one PR: #403
(`docs(relay): row 92 re-checked - no new attempt, live re-verification
only`), on branch `docs/state-cycle-110`. Checks were green (`verify` and
`E2E (Playwright)`, both `SUCCESS`). Merged with `gh pr merge 403 --squash`
— no conflicts, branch protection satisfied. Started a fresh branch,
`docs/state-cycle-111`, off the updated `origin/main`, carrying forward two
pieces of legitimate uncommitted state already sitting in the working tree at
session start (not this cycle's own work product): the relay watcher's own
addendum to `cycle-110.md`, and a stale `IN PROGRESS 111` marker on row 92
from the relay's own dispatch — both real facts about this project's history.

The untracked `ODOUTREACH-PROJECT-INSTRUCTIONS.md` in the repo root was found
again, exactly as prior cycles found it. Left untouched — a Claude-Project
setup artefact, not part of the engineering record, out of scope for this row.

## The item

Row 92: dimension 1 (Core journeys end-to-end) held at 8 because nobody has
proved send → arrival → reply → correct-match through the real screens. This
cycle's brief carried something the last several did not: Cowork approval,
recorded 29 August, for the SEND leg specifically, for `bidlowai` only.

## Before touching anything

1. **Files to change:** none in `src/` — an operational walk against
   production plus documentation (`docs/ops/*.md`, `.bidlow/relay/QUEUE.md`,
   this log). `.bidlow/GRADES.json` explicitly NOT to be touched this cycle
   (the brief states the score holds at 8 regardless of the send's outcome).
2. **Red-first test:** not applicable — a walk, not a code change.
3. **Done looks like:** the send leg proven with a dated artefact under
   `docs/ops/`, and the row marked PARTIAL naming the reply-and-match leg as
   the remainder — unless the reply also completes and matches correctly, in
   which case dimension 1 re-scores.
4. **Must not touch:** any other GRADES.json dimension; any client other than
   `bidlowai`; the database schema; `_standards` or any sibling project
   folder; must not click Launch a second time under any circumstance.

## What was found and done

Recon hit a real, unrelated obstacle first: `npm install` of *any* package —
including zero-dependency ones — fails deterministically inside this App
Service's Kudu container this session, with `Tracker "idealTree" already
exists`. Not a stale-cache issue (reproduced after `npm cache clean --force`
and in three separate directories). Worked around by writing a
dependency-free Postgres client (TLS + SCRAM-SHA-256 via Node's own
`net`/`tls`/`crypto`, per RFC 5802) and running it through the same Kudu
command API prior cycles used for `pg`-based recon. Also found along the way:
Kudu's `/api/command` does not go through a shell (no `&&`/`|`/quoting) —
every multi-step command had to be wrapped as `sh -c "..."` explicitly.

Recon then found something that changed the shape of this cycle entirely:
**Greg had already clicked Launch himself**, for real, at 2026-08-29
22:45:54 UTC — verified from `OutboundEmail.staffUserId` resolving to his own
`greg@bidlow.co.uk` super-admin account, not a machine actor and not this
session. This landed while this session was still fighting the npm problem
above, before any staff session had been minted. So this cycle's actual work
became verifying and documenting a send it did not perform, rather than
performing one — recorded exactly that way, not smoothed into a first-person
claim. Full account: `docs/ops/SEND-PROOF-2026-08-29.md`.

Mid-cycle, row 92's own text was updated live (22:51 UTC) to say Greg had
replied for real. This cycle triggered the same `/api/internal/replies/sync`
endpoint the 15-minute weekday cron calls (outside its own window right now)
rather than wait until Monday, and it linked one new reply — but to the 26
August send, not today's, because Gmail's Reply button drops the
`+cycle109` plus-alias this walk's contact depends on for matching. Read
directly from `process-synced-replies.ts` to confirm why, not guessed. Full
account: `docs/ops/REPLY-PROOF-2026-08-29.md`.

One more finding, recorded not fixed, out of scope for this docs-only row: a
prior cycle's session-minting script wrote the literal string
`cycle110-readonly-check` into `StaffUser.entraObjectId` for
`greg@opensdoors.co.uk` in production, rather than a real Microsoft object
id. The schema's own comment says first-login matches by email and
re-attaches the real id, so this should self-heal — but it is a real write to
a real staff record that happened outside any migration, and it's written
down rather than left for someone else to trip over.

## Gates

No code changed this cycle (documentation + two live, mostly read-only
production checks — one write was triggering the reply-sync endpoint, which
is the product's own normal ingest path, not a code change), so
`npm run lint` / `npm run typecheck` / `npm test` are unaffected; not re-run
for a docs-only diff, consistent with prior docs-only cycles in this log.

## Result

`.bidlow/GRADES.json` dimension 1: **score held at 8**, exactly as
instructed — the reply exists but did not match the right send, which the
brief treats the same as not-yet-ingested. `.bidlow/relay/QUEUE.md` row 92 →
`PARTIAL 111`. No schema change, no migration, no other client's data
touched, and no second send attempted. Two dated artefacts:
`docs/ops/SEND-PROOF-2026-08-29.md`, `docs/ops/REPLY-PROOF-2026-08-29.md`.
