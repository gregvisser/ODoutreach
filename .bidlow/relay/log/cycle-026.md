# Cycle 26 - timed-out



KILLED. This cycle was still running after 45 minutes, so it
was stopped, along with every process it had started (6 in
total). The relay did NOT wait for it and has carried on to the next item.

Anything it had already written to disk is still there - a kill does not undo
work - so read the evidence below before assuming this item is untouched.



Started 2026-08-27 01:04:46, took about 45 minutes.

How it ended: killed at the 45 minute deadline.



Evidence checked: git refs on every branch, the working tree, and these

files named in the brief: bidlow/relay/UX-WALK-2026-08-26.md, src/server/queries/clients.ts, e2e/suppression-search.spec.ts, src/server/queries/outreach-metrics.perf.integration.test.ts, activity/page.tsx, src/lib/ux-copy-policy.test.ts, src/lib/mailboxes/signature-row-guidance.ts, e2e/mailboxes-table-first.spec.ts, e2e/fixtures.ts, e2e/seed-e2e.ts, bidlow/FROZEN.json, e2e/env.ts, bidlow/relay/QUEUE.md



## What it was asked to do



# Cycle 26 - queue item 27

This brief was written by the relay itself, off the top of QUEUE.md. Greg has
not read it. If it is wrong, say so in your log rather than working around it,
and correct QUEUE.md.

## The item, verbatim from the queue

> **THE UI DEFECTS A CLIENT WILL SEE TOMORROW, RANKED, MEASURED IN CHROME ON THE LIVE SITE 2026-08-26.** Full detail in `.bidlow/relay/UX-WALK-2026-08-26.md` — read it first, it has the measurements and the exact selectors. Fix in this order and stop when the clock runs out. **(1) The install banner covers live data and comes back.** It is `position:fixed; inset-x-0; bottom-0; z-50`, centred over the bottom of every page. On /reporting it sits on top of the client-name column of the per-client table. Dismissal is stored in `sessionStorage` as `odoutreach:pwa-install-dismissed`, so it returns in every new tab and after every browser restart — which is exactly the state Greg's machine will be in tomorrow morning. Move the flag to `localStorage`, and stop it overlapping content. **(2) `Campaigns` is 0 for all 17 clients on /clients.** It is `_count.campaigns` in `src/server/queries/clients.ts`, and nothing writes Campaign rows — sends hang off sequences. The front door of the app therefore says every client has done nothing, next to a Reports page saying 1,212 emails were sent. Count sequences (or sends) or drop the column. **(3) /reporting is the landing page and the slowest linked page.** Measured cold 2,464 ms to first byte and 6,027 ms to load; warm 1,532 / 4,121 ms. Everything else linked in the sidebar is under 3 s except /support (3,753 / 6,632 ms). Earlier measurement already cleared the query layer — `loadClientWorkspaceBundle` is a constant 19 round-trips — so this is CPU/render, not N+1. Profile the render, not the database. **(4) The client workspace shows the same seven destinations three times** — the tab bar, the numbered Workflow pills, and the Launch-readiness rows, stacked on one screen. Greg already asked for this: *"this needs to be consolidated into one tab list? i need the UI clean"*. Keep the tabs and the readiness list; drop the pills, which carry no information the readiness rows do not. **(5) The Activity screen prints the same five numbers twice**, 100 px apart, in two vocabularies — the KPI cards say EMAILS SENT / REPLIES / BOUNCES / UNSUBSCRIBES / FAILED SENDS, then 'Outreach metrics' repeats Total sent / Replies / Bounces / Opt-outs / Failed. Pick one set of words and show them once. **(6) The Mailboxes screen buries the mailboxes.** Four screens of setup and DNS troubleshooting come before the actual table, then the same five mailboxes are listed AGAIN under Sender signatures with an identical 60-word help paragraph repeated verbatim on all four connected rows. Table first, help collapsed. **(7) /suppression says 'Showing 200 of 200' while silently truncating.** Panda Recycling alone has 30,229 blocked addresses; the domain list starts at `songa.co.uk`, so it is an arbitrary window, not the first 200. 868 rows and 756 KB of HTML render on one page. Say what is really there and paginate. **(8) Jargon on customer-facing screens.** 'Send proof missing' (red, on the front page), 'Not reached (failed + bounces + suppressed + proof missing)', 'Delivered: Not tracked' as a headline number, 'Admin diagnostics', 'Connection diagnostics (owner only)', and a client list where BidlowAI shows a reply rate of 133.3%. **(9) Two hidden pages are very slow if anyone opens them**: /contacts titled 'Contacts (admin legacy tools)' takes 19,265 ms and ships 2,977 KB of HTML; /operations/outbound takes 8,564 ms. Neither is in the sidebar, so they are last — but 19 seconds is 19 seconds. Every number above was measured with `performance.getEntriesByType('navigation')` on `https://opensdoors.bidlow.co.uk`, signed in as greg@bidlow.co.uk. Do not re-report a screen as fine without opening it. **CYCLE 23 PROGRESS — 4 of the 9 defects are shipped, 5 remain, so this row stays TODO.** DONE: **(1) install banner** + **(2) Campaigns column** + **(4) triplicated workspace nav** all landed in commit `96849b2` (#247) — do NOT redo them. **(7) "Showing 200 of 200"** landed in cycle 23 as PR **#251** (branch `fix/suppression-honest-counts`): row queries now return {rows,total,pageSize,offset} with the total counted in the DB, search pushed down into the DB (it used to filter only the 200 rows already in the browser — a staff member asking "is this person blocked?" got "no matches" for someone who WAS blocked), alphabetical ordering replacing the arbitrary `syncedAt desc` window that started at songa.co.uk, and Previous/Next paging. Proven red-first (4 of 16 query tests fail when the shipped behaviour is restored) plus `e2e/suppression-search.spec.ts`, which searches for the alphabetically LAST seeded address — provably absent from page one — with a positive control. STILL TODO, in the brief's order: **(3)** /reporting is the landing page and the slowest linked page (2,464 ms TTFB / 6,027 ms cold — profile the RENDER, the query layer was already cleared: `loadClientWorkspaceBundle` is a constant 19 round-trips), **(5)** Activity prints the same five numbers twice in two vocabularies, **(6)** Mailboxes buries the table under four screens of setup help, **(8)** jargon on customer-facing screens ("Send proof missing", "Not reached (failed + bounces + suppressed + proof missing)", "Delivered: Not tracked", "Admin diagnostics", BidlowAI showing a 133.3% reply rate), **(9)** /contacts 19,265 ms and /operations/outbound 8,564 ms. **CYCLE 24 PROGRESS - defect (3) shipped, defect (5) was ALREADY FIXED and the brief was wrong about it, 3 remain.** **(3) /reporting SHIPPED as PR #253** (branch `perf/reporting-landing-page-fanout`, merged as `c51b06a`, LIVE on production - verified by hash against the DIRECT App Service URL `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info` returning `c51b06a06fc63427f764fb6e04337c713d8e64d9`, not the CDN domain and not liveness alone). **The brief's diagnosis was WRONG, and acting on it would have burned the cycle:** it said "profile the render, not the database - `loadClientWorkspaceBundle` is a constant 19 round-trips, so this is CPU/render, not N+1". That is a true fact about a DIFFERENT page. **/reporting never calls `loadClientWorkspaceBundle`.** It calls `loadGlobalOutreachMetrics`, which fanned **13 `count()` queries out PER CLIENT**, and production runs 17 clients. Measured on the real e2e Postgres by instrumenting the `pg` driver, at 1 / 5 / 17 clients: **15 / 71 / 239 round-trips** (556.6 ms of DB time at 17 clients, on EMPTY tables - production adds row scanning on top of every one of those 239 queries). The 13 predicates now run once each as `GROUP BY "clientId"` aggregates over the whole scope, and the internal-seed allowlist read - previously once per client whenever its flag is on - is hoisted out of the loop. After: **15 / 15 / 15 round-trips, 37.5 ms at 17 clients.** Seventeen clients now cost what one client costs. **Every predicate is byte-for-byte unchanged** - this changes how many times the database is asked, never the answer. **PROVED IT FIRES:** `src/server/queries/outreach-metrics.perf.integration.test.ts` was watched RED first (`expected 239 to be less than or equal to 15`) and green after, and it fails if the round-trip count ever grows with the scope again; the driver patch covers `pg.Pool.prototype`, not just `pg.Client.prototype`, which is the exact mistake that once made the sibling perf test report a triumphant zero. A second test seeds a workspace where all fourteen raw counts are non-zero AND DISTINCT (a seed where everything is 1 passes under almost any wrong GROUP BY), asserts every number the Reports card shows, asserts a neighbouring workspace never bleeds in, and asserts the global total is the sum rather than one client repeated. **HONEST LIMIT: the live page was NOT re-measured - this relay has no browser.** What is proven is the mechanism and its size in the lab. Someone with Chrome should re-measure /reporting on the live site to confirm the 2,464 ms TTFB actually moved. **(5) IS ALREADY FIXED - THE BRIEF IS WRONG, do NOT spend a cycle on it.** The brief says Activity's KPI cards are followed by an "Outreach metrics" card repeating Total sent / Replies / Bounces / Opt-outs / Failed. That card was renamed **"Rates and delivery detail"** and stripped of every repeated count in commit **`a93ec19` (#241)**, which landed at **15:36 on 2026-08-26 - AFTER the UX walk was performed the same day**. The walk was honest; it recorded a real defect against a build that was superseded hours later. Verified at HEAD rather than assumed: in `src/app/(app)/clients/[clientId]/activity/page.tsx` the strip carries the five counts and the card carries only rates + Queued + Send proof missing + Not reached + Suppressed, and `src/lib/ux-copy-policy.test.ts` compares the two label sets and fails on any overlap, so it cannot silently regress. The string "Outreach metrics" now survives only on **/reporting**, where it appears ONCE and repeats nothing. **STILL TODO, in the brief's order: (6)** Mailboxes buries the table under four screens of setup help, and repeats a 60-word help paragraph verbatim on all four connected signature rows - table first, help collapsed; **(8)** jargon on customer-facing screens ("Send proof missing", "Not reached (failed + bounces + suppressed + proof missing)", "Delivered: Not tracked" as a headline, "Admin diagnostics", "Connection diagnostics (owner only)") **plus one item that is a real ARITHMETIC defect and not wording: BidlowAI shows a reply rate of 133.3% because `replyRate` divides raw InboundReply rows by sends, so two replies to one email exceed 100%** - decide whether the honest denominator is distinct contacts who replied; and note Idverde showing "4 sent, 20 not reached" because sends and contacts are counted into the same row; **(9)** /contacts 19,265 ms / 2,977 KB and /operations/outbound 8,564 ms - neither is in the sidebar, so they stay last. **CYCLE 25 PROGRESS - defect (6) shipped, 2 remain.** **(6) Mailboxes SHIPPED.** Two halves, both measured in a real Chrome against a real build before and after. FIRST: the page opened with four blocks of setup/DNS documentation - the 'what happens when you connect' explainer, the Microsoft admin-consent card, the SPF/DKIM/DMARC block and the verification-send form - and the table the page is named after came fifth. The table is now first; all four help blocks moved BELOW it, intact, inside one CLOSED <details> called 'Setup, deliverability and test sends'. Nothing was deleted, and a test asserts it can still be opened, so the fix cannot quietly become content loss. SECOND: the Sender-signatures table printed getOperatorSignatureState().recommendedAction on every row. That string comes from six fixed templates, so mailboxes in the same state printed the SAME ~50-word paragraph once each - four times on the live opensdoors workspace. New pure module src/lib/mailboxes/signature-row-guidance.ts applies one rule: a sentence identical on more than one row is not row data, so it is hoisted above the table once, NAMED with the rows it came from ('Next step for 4 mailboxes: ...'), while advice unique to one row stays on that row. **PROVED IT FIRES, IN A BROWSER, BOTH WAYS.** The unit tests assert source order and the dedupe rule - neither of those is the defect, which is what a person sees on a screen. So e2e/mailboxes-table-first.spec.ts measures the rendered document: boundingBox().y of a mailbox vs the setup disclosure, whether the help is hidden on arrival, and how many times the repeated sentence is actually painted. Run against the SHIPPED build with the fix stashed out and rebuilt, it fails with 'Confirm it looks right with Preview signature. appears 4 times; 4 connected mailboxes share it, so it must appear once' - the UX walk's defect, reproduced in Chrome - plus the two ordering failures; the fourth test stayed GREEN in both runs, so the spec is not simply failing everything. With the fix: 4/4 green, and the FULL e2e suite is 54/54 with no regression to screen-walk or cross-tenant. Unit gates: lint 0 errors, typecheck 0, 2441 tests in 255 files. Required seeding five mailbox fixtures (four CONNECTED sharing one signature state + one never-connected, mirroring the live shape); e2e/fixtures.ts and e2e/seed-e2e.ts are FROZEN, so both carry amendments in .bidlow/FROZEN.json recorded as 'relay cycle 25 (autonomous) - NOT Greg-authorised'. SEND-SAFE: no MailboxIdentitySecret is seeded, so the CONNECTED rows hold no token and fail closed; provider credentials are blanked in e2e/env.ts; no spec submits a send. NOTE: the working copy of this QUEUE.md had AGAIN been re-encoded with a BOM and mojibake across 60 untouched lines - the exact damage commit 1cedd29 repaired - so that uncommitted change was discarded, and this edit was written by a byte-checked script rather than an editor. **STILL TODO, in the brief's order: (8)** jargon on customer-facing screens ('Send proof missing', 'Not reached (failed + bounces + suppressed + proof missing)', 'Delivered: Not tracked', 'Admin diagnostics', 'Connection diagnostics (owner only)') **plus the real ARITHMETIC defect: BidlowAI shows a reply rate of 133.3% because replyRate divides raw InboundReply rows by sends, so two replies to one email exceed 100%** - decide whether the honest denominator is distinct contacts who replied; and Idverde's '4 sent, 20 not reached', where sends and contacts are counted into one row; **(9)** /contacts 19,265 ms / 2,977 KB and /operations/outbound 8,564 ms - neither is in the sidebar, so they stay last. SHIPPED as PR **#257**, merged as `1af0ac4`, and LIVE on production - verified by HASH against the DIRECT App Service URL `app-opensdoors-outreach-prod.azurewebsites.net/api/build-info` returning `1af0ac4cff1b00091fbc4459ff9323afab82a453`, not the CDN domain and not liveness alone. CI ran Playwright on Linux green as well as locally. **HONEST LIMIT: the live page was NOT re-opened in a browser - this relay has no browser against production.** What is proven is that the fix renders correctly in a real Chrome against a real production build, and that the old build fails the same spec.

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
  `DONE 26`, or back to `TODO` with a note if you could not do it.
* Do NOT write the next NEXT.md. The watcher does that. One cycle, one item.

## Assume the seventh exists

QUEUE.md records six instances this week of something built, wired, reporting
success, and never firing. It is the defect this project is worst at by a wide
margin. Whatever you build this cycle, prove it FIRES - not that it exists.





## What it did





