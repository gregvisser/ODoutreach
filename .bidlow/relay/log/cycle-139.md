# Cycle 139 - queue item 111

## Before anything else: the four things written down

1. **Files I might change:** `.bidlow/relay/QUEUE.md` (row 111's status cell
   only), `.bidlow/relay/log/cycle-139.md` (this file), a new dated artefact
   `docs/ops/2026-08-30-screen-walk-findings-row111.md`. Regenerating
   `e2e/.artifacts/screen-walk/*.json` (already gitignored, not a tracked
   file). No application code, no schema, no copy change — row 111 is
   explicitly measure-only.
2. **The red-first test:** none in the usual sense — this row is measurement,
   not a behaviour change, so there is no red/green to watch. The harness
   itself (`e2e/screen-walk.spec.ts`) already exists and already asserts the
   mechanical checks; re-running it and reading its output honestly (not
   inventing new assertions) is this repository's substitute here.
3. **What "done" looks like, in one sentence a non-coder can check:** a dated
   file exists under `docs/ops/` with a numbered, ranked list naming, for
   each finding, the screen, the exact words on it, what a new operator would
   wrongly conclude, and what is actually true — and the screen count is
   stated.
4. **What I must NOT touch:** any application/source file (no fix, per the
   row's explicit instruction — fixes belong to row 112); `.bidlow/GRADES.json`
   (no scoring, per the row — that is row 114's job); the `bidlowai`
   "Cycle 129 send-and-reply walk" sequence (must stay untouched at
   Ready: 1, Sent: 0); any other client's data beyond read-only viewing
   through the existing e2e fixture.

## Sweep: green PRs

Found the row-115 branch (`docs/row115-send-proof-cycle138`, PR #437) sitting
with two uncommitted local files from cycle 138's own working tree: the
watcher's post-exit addendum to `cycle-138.md` and the picker's own
`IN PROGRESS 139` marker on row 111 in `QUEUE.md`. Neither belonged to a new
row — both were cycle 138's own record and this cycle's own pickup marker —
so committed them to that same branch, pushed, waited for CI (green: `verify`
and `E2E (Playwright)` both `pass`, ~5.5 minutes), and squash-merged PR #437.
No other open PRs (`gh pr list --state open` returned empty after the merge).

## Row 109 gate / prerequisites

Not applicable to this row — row 111 has no dependency on row 109 being live;
it is a fresh measurement pass over the current product.

## The walk

Ran the existing, named method exactly as instructed — did not invent a new
one:

1. `E2E_DATABASE_URL=... npx prisma migrate deploy` against the already-running
   `odoutreach-e2e-postgres` container (`:5434`) — no pending migrations.
2. `npm run build` — production build, matching CI and Azure.
3. `npx playwright test e2e/screen-walk.spec.ts --reporter=list` — **32/32
   passed**, artefacts regenerated at `e2e/.artifacts/screen-walk/*.json`
   (gitignored, not committed — same as every prior run).

Then read every one of the 32 artefacts' rendered text, and for anything that
looked like a real finding, read the actual source file computing that number
or copy string before writing it down — so the artefact states causes, not
guesses. One artefact-reading mistake caught and corrected before it became a
false finding: `reporting-detail` was walked with no `metric` query
parameter (the harness's own navigation choice), which is not how any real
on-screen link reaches that page — every real link always carries a `metric`
value (`detailHref(...)` in `reporting/page.tsx`). The generic "That metric
doesn't have a row-level breakdown" text the harness captured there is a
harness artefact, not a real dead end, and is called out as such in the
findings file rather than listed as a finding.

**The one gap in the harness, named plainly:** the e2e fixture client has no
sequence in any state, so `screen-walk.spec.ts` cannot observe the Outreach
tab's Launch button, its dialog, or its post-launch state — the exact
stretch row 111 says to walk hardest. Rather than inventing a new fixture or
a new test (out of scope — no source change, and the row says use the
existing method), the highest-ranked finding was built by reading two
real-production walks of that exact screen that already exist on disk —
`docs/ops/SEQUENCE-LAUNCH-SCREEN-WALK-2026-08-30-cycle129.md` and
`docs/ops/SEND-PROOF-2026-08-30.md` — cross-referenced against the actual
source (`sequence-actions.ts`) that generates the copy those two documents
quote verbatim. No new screen interaction was performed to produce this; both
source documents already existed before this cycle started.

## Findings, in brief (full detail in the artefact)

Seven findings, ranked by damage:

1. The post-Launch banner always reads "queued," even once the send has
   already completed via the real mailbox — the literal scenario Greg
   described.
2. The Do-not-contact tab shows a "sync isn't set up" banner directly above
   two rows reading "Sheet connected" / "Last sync succeeded."
3. Client Overview says Do-not-contact is "Not configured" for a client
   whose own Do-not-contact tab shows it actively blocking 250+ addresses.
4. Client Overview's "Lists" figure is actually a contact count, and
   disagrees with the client's own Lists tab (which reads zero lists).
5. A template status "IN REVIEW" is described only as "Legacy status," with
   no statement of whether it can be used in a sequence today.
6. An outbound email's detail screen can show "Provider: mock" with no
   on-screen explanation of what that means.
7. The cross-client Operations table shows the same unexplained "Legacy
   transport: mock" as a workspace's entire sending state.

No actively dangerous mislabeled control (one that could send or delete
while its label says otherwise) was found — stated plainly at the top of the
artefact per the row's instruction.

## Hard rule and scope

No email sent, no client data mutated beyond what the existing e2e fixture
seeds when the harness runs (the same fixture every prior run of this spec
has created). `bidlowai`'s "Cycle 129 send-and-reply walk" sequence was not
opened, touched, or launched. No other client's real data was read — only
the isolated e2e fixture database. No code, schema, or copy change.
`.bidlow/GRADES.json` was not touched.

## Gates

- `npm run lint` — 0 problems.
- `npm run typecheck` — 0 errors.
- `npm test` — 353 files, 3711 tests, all green.
- `npx playwright test e2e/screen-walk.spec.ts` — 32/32 passed.

No application code changed, so these gates prove the tree is exactly as
clean as it started, not that a new behaviour works — correct for a
measure-only row.

## Status

`DONE 139` — see `docs/ops/2026-08-30-screen-walk-findings-row111.md` for
the full ranked findings list and the 32-screen count.
