# Cycle 17 - timed-out



KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.



Started 2026-08-26 18:57:35, took about 45 minutes.

How it ended: killed at the 45 minute deadline.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/UX-WALK-2026-08-26.md, src/server/queries/clients.ts, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 17 - queue item 27

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
  `DONE 17`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did





