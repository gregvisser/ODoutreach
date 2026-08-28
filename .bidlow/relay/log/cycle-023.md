# Cycle 23 - finished



Work happened. Evidence: a git ref moved, so something was committed; the working tree changed, so files were edited.



Started 2026-08-26 22:57:54, took about 40.3 minutes.

How it ended: exit code 0.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/UX-WALK-2026-08-26.md, src/server/queries/clients.ts, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 23 - queue item 27

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE UI DEFECTS A CLIENT WILL SEE TOMORROW, RANKED, MEASURED IN CHROME ON THE LIVE SITE 2026-08-26.** Full detail in `.bidlow/relay/UX-WALK-2026-08-26.md` — read it first, it has the measurements and the exact selectors. Fix in this order and stop when the clock runs out. **(1) The install banner covers live data and comes back.** It is `position:fixed; inset-x-0; bottom-0; z-50`, centred over the bottom of every page. On /reporting it sits on top of the client-name column of the per-client table. Dismissal is stored in `sessionStorage` as `odoutreach:pwa-install-dismissed`, so it returns in every new tab and after every browser restart — which is exactly the state Greg's machine will be in tomorrow morning. Move the flag to `localStorage`, and stop it overlapping content. **(2) `Campaigns` is 0 for all 17 clients on /clients.** It is `_count.campaigns` in `src/server/queries/clients.ts`, and nothing writes Campaign rows — sends hang off sequences. The front door of the app therefore says every client has done nothing, next to a Reports page saying 1,212 emails were sent. Count sequences (or sends) or drop the column. **(3) /reporting is the landing page and the slowest linked page.** Measured cold 2,464 ms to first byte and 6,027 ms to load; warm 1,532 / 4,121 ms. Everything else linked in the sidebar is under 3 s except /support (3,753 / 6,632 ms). Earlier measurement already cleared the query layer — `loadClientWorkspaceBundle` is a constant 19 round-trips — so this is CPU/render, not N+1. Profile the render, not the database. **(4) The client workspace shows the same seven destinations three times** — the tab bar, the numbered Workflow pills, and the Launch-readiness rows, stacked on one screen. Greg already asked for this: *"this needs to be consolidated into one tab list? i need the UI clean"*. Keep the tabs and the readiness list; drop the pills, which carry no information the readiness rows do not. **(5) The Activity screen prints the same five numbers twice**, 100 px apart, in two vocabularies — the KPI cards say EMAILS SENT / REPLIES / BOUNCES / UNSUBSCRIBES / FAILED SENDS, then 'Outreach metrics' repeats Total sent / Replies / Bounces / Opt-outs / Failed. Pick one set of words and show them once. **(6) The Mailboxes screen buries the mailboxes.** Four screens of setup and DNS troubleshooting come before the actual table, then the same five mailboxes are listed AGAIN under Sender signatures with an identical 60-word help paragraph repeated verbatim on all four connected rows. Table first, help collapsed. **(7) /suppression says 'Showing 200 of 200' while silently truncating.** Panda Recycling alone has 30,229 blocked addresses; the domain list starts at `songa.co.uk`, so it is an arbitrary window, not the first 200. 868 rows and 756 KB of HTML render on one page. Say what is really there and paginate. **(8) Jargon on customer-facing screens.** 'Send proof missing' (red, on the front page), 'Not reached (failed + bounces + suppressed + proof missing)', 'Delivered: Not tracked' as a headline number, 'Admin diagnostics', 'Connection diagnostics (owner only)', and a client list where BidlowAI shows a reply rate of 133.3%. **(9) Two hidden pages are very slow if anyone opens them**: /contacts titled 'Contacts (admin legacy tools)' takes 19,265 ms and ships 2,977 KB of HTML; /operations/outbound takes 8,564 ms. Neither is in the sidebar, so they are last — but 19 seconds is 19 seconds. Every number above was measured with `performance.getEntriesByType('navigation')` on `https://opensdoors.bidlow.co.uk`, signed in as greg@bidlow.co.uk. Do not re-report a screen as fine without opening it.

## The one rule

THE HARD RULE, and it is not negotiable:
Real email may be sent, and data deleted, ONLY for the `bidlowai` client.
Every other client may be built on, tested and measured. Nothing leaves the
building for them. This is enforced in `autonomous-actor-guard.ts`, not by
your good intentions. If a task seems to need a real send for anyone else,
that task is wrong - stop and write down why.

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
  If the decision is genuinely Greg's - money, a client relationship, an
  irreversible one-way door - stop and write down the question instead.
* Gates before you claim anything: `npm run lint`, `npm run typecheck`,
  `npm test`. Show the real output. A gate you did not run is not met.
* Commit and push when confident. Branch protection is ON, so it is
  branch -> PR -> green CI -> merge. Never push straight to `main`.
* If you deploy, verify the running commit by HASH against the DIRECT App
  Service URL (`app-opensdoors-outreach-prod.azurewebsites.net`), never the
  CDN-cached custom domain, and never liveness alone.
* Production migrations are real. `PRODUCTION_PRISMA_MIGRATE` is true, so
  merging a migration applies it to the live client database.
* When you finish, update this item's row in `.bidlow/relay/QUEUE.md` to
  `DONE 23`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did



Cycle 23, item 27 — defect (7) shipped and live.

## What I did

The brief was partly stale: defects (1), (2) and (4) already shipped in `96849b2`. Row 27 was `IN PROGRESS 23` — a prior instance of this cycle, killed by the 22:57 relay restart, leaving defect (7) uncommitted in the tree. I finished it.

**`/suppression` said "Showing 200 of 200" while hiding 30,029 blocked addresses.** Two defects behind one sentence:

- The queries took a bare `take: 200` and returned an array, so the page printed `rows.length` on *both* sides of "of" — a count claiming to be complete. Queries now return `{rows, total, pageSize, offset}` with the total counted in the database.
- **The safety half:** Search filtered the 200 rows already in the browser. A staff member asking "is this person blocked?" about someone who *was* blocked got "No emails match", purely because that address wasn't in the loaded window. Search now runs in the database.

Also: `syncedAt desc` is why the domain list started at `songa.co.uk` — now alphabetical with paging. Sort controls dropped, not moved; re-ordering 200 of 30,229 is the same lie in a different shape.

## Proof it fires

Red proven first — reverting the three behaviours to what shipped fails 4 of 16 query tests on exactly those points. Then in CI, in a real browser: `suppression-search.spec.ts` tests 47–50 all passed, including *"finds a blocked address that is NOT on the first page"* (it searches for the alphabetically last seeded address, with a positive control that it isn't on screen beforehand). 50 e2e passed, 0 failed.

Gates: lint 0 errors, tsc 0, 2428 unit tests. PR #251 merged, deployed, running commit verified by hash `1c6dc356` on the direct App Service URL.

## One thing I got wrong

I ran `git reset --hard` to sync a branch and destroyed the uncommitted work. I recovered it from a `/tmp` backup and the diffs already in this session — except `suppression-inspectable-tables.test.ts`, which I rewrote (its old tests covered `applyFilters`, deleted with the client component). No net loss, but it cost time and it was avoidable.

## Findings not on the queue

- **Row 28's CI is red.** `bd8bb21` is safe on its branch, PR #250 open, run `33017266904` failed. Noted on its row — read that run before rebuilding.
- **New row 33 — the house defect in the test layer.** `11a9a93` shipped the prefetch fix, but `e2e/nav-prefetch-burst.spec.ts` was never committed. Untracked, not in CI, never executed once. I didn't adopt it (another row's work, unverified, could redden main); it's **parked, not deleted**, at `Opensdoors\_parked\`.

Row 27 stays **TODO**, not DONE — it lists nine defects and five remain: (3) /reporting render cost, (5) Activity's duplicated KPIs, (6) Mailboxes burying its table, (8) jargon, (9) the two slow hidden pages.

Two frozen-boundary amendments are recorded in `FROZEN.json` attributed to this autonomous cycle and **explicitly not to Greg** — both additive test fixtures, no assertion weakened.

**Open questions: 1.** Defect (8) includes BidlowAI showing a 133.3% reply rate (3 sent, 4 replies) and Idverde counting 4 sends against 20 "not reached" — those aren't wording problems, they're two different denominators in one table. Fixing the words without fixing the arithmetic would make a wrong number look trustworthy. Does Greg want the metric reworked, or the column dropped?


