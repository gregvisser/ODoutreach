# The work queue — ODoutreach to a fully operational six-stage system

Shared between Claude (Cowork, on a timer) and Claude Code (via the relay).
**Both sides may edit this file.** It is the plan of record; nobody's memory is.

Greg's goal, verbatim (2026-08-26):
> *"I need the ODoutreach system fully operational with a working UX/UI
> (currently the system takes very long to load aswell)... The Operating system
> must have gone through all of the steps put in place to have a fully
> functional system ASK - CLASSIFY - CHECK - PLAN - BUILD - PROVE. The UX and UI
> must also be part of the work... if a question blocks you and claude code from
> working, use your own recommendations to move forward."*

## The one rule

**Real email may be sent, and data deleted, ONLY for the `bidlowai` client.**
Every other client may be built on, tested, measured and reported on. Nothing
leaves the building for them. Enforced in `autonomous-actor-guard.ts`, not here.

## Status key
`TODO` Â· `IN PROGRESS <cycle>` Â· `DONE <cycle>` Â· `BLOCKED — <why>`

---


## 2026-08-26 — PRIORITY OVERRIDE: the 31 August client commitments

Greg has a signed-off email to Sam and James at OpensDoors promising eight
specific things **by 31 August**. Payment depends on them. Five days remain.

Items 19-25 are those commitments and they go FIRST. **Nothing below them has
been dropped** — items 5, 7, 8, 9, 10, 11 and 12 are still in the queue and
still matter. This is an ordering change, not a cut.

**Greg did not write that email. Claude did.** The gaps below are promises made
on his behalf that were never built, and item 23 in particular is a case of
promising one mechanism and then building a different, weaker one. That is worth
stating plainly rather than presenting it to him as his oversight.

Three of the eight are genuinely done: sending from the customer's own Microsoft
365 mailbox with no DNS change on their side, volume protection active on every
new mailbox, and the tracking kill-switch existing in code.

The rest are gaps between what was promised in writing and what is in the
system. **Where something cannot be delivered by the 31st, say so clearly and
early** so Greg can tell the client himself rather than be found out in a
meeting. An honest "not yet, here is when" is survivable. A surprise is not.


## STANDING RULE added 2026-08-26 — additive migrations do not wait for Greg

Greg has granted full autonomy and asked explicitly that a blocking question be
DECIDED rather than queued. The "show Greg the migration first" rule predates
that and is now stalling finished work — item 5 sat green and unmerged waiting
for a permission he had already given.

**An additive migration may be merged without asking.** Additive means: no DROP,
no TRUNCATE, no DELETE, no column made NOT NULL on a table that has rows, and no
change to existing data. That is not a promise to be careful — a test already
reads the migration SQL and fails on any of it, and it was red-checked by
injecting a `DROP TABLE`.

**Anything NOT additive still stops and waits.** Dropping a column, changing a
type, backfilling data: those reach a client's live database in a way that
cannot be undone, and they wait for a person.

Say in the PR body which rule the migration fell under and why.

## Queue, in order

| # | Item | Status |
|---|---|---|
| 20 | **DEADLINE 31 AUG — TRACKING OFF BY DEFAULT, PER-CLIENT OPT-IN. Not an environment toggle.** Greg's requirement, and it is a better design than what exists: *"it should be off by default, and if a customer agrees that they would change their DNS for tracking then the customer will make the changes and the toggle will be switched on for that particular customer."* Today `isOpenTrackingPixelEnabled()` is global and returns TRUE unless someone remembered to set `OPEN_TRACKING_PIXEL=off` — a promise resting on somebody's memory. Build it properly: a per-client setting, **defaulting to OFF**, that can only be turned on for a client whose DNS has been verified. The env var becomes a global kill-switch backstop, never the mechanism. Red first: a client with no setting must get NO pixel and NO rewritten links. Report the live Azure value on the way past. | TODO — **still TODO: the per-client opt-in is NOT built.** Cycle 11 did the "report the live Azure value" half and hardened the backstop. **Live value is exactly `off`** (lower-case, no whitespace) on `app-opensdoors-outreach-prod`, read 2026-08-26 via `az webapp config appsettings list`; `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN` is unset. So the written promise to the client currently HOLDS. Proven beyond the config value, because a correct setting is not a pixel that stops: only two call sites embed a pixel (`execute-one.ts`, Gmail + Graph legs) and both route through `buildOpenTrackingPixelUrl`, so there is no bypass; and the compiled server bundle keeps a genuine RUNTIME read (`if("off"===process.env.OPEN_TRACKING_PIXEL)return null`), so the value is NOT inlined at build time from the GitHub Actions environment — that was the real risk of a cosmetic switch. Deployed commit `1f8a8e7` matched the inspected code. NOT verified: opens-stopped evidence from the production database — the DB firewall allows Azure services only, and opening a live client database to a workstation IP is Greg's call, not the relay's. **Defect found and FIXED (PR #235):** the backstop failed OPEN — `!== "off"` meant `OFF`, `Off`, `off ` (trailing space), `false`, `0`, `no` all silently RESUMED tracking with no error, no log and nothing on screen. Now trimmed + lower-cased, fail-closed, 11 red-first tests watched failing first. That makes the env var safe to serve as the "global kill-switch backstop" this item calls for. **What remains for this item:** the per-client setting defaulting to OFF, gated on verified DNS, plus the link-rewriting half. | 
| 19 | **TODAY — ONE COMMAND TO GO LIVE FOR THE MEETING, AND ONE TO GO BACK.** Greg has a client meeting and must NOT be flipping Azure settings by hand to prepare for it. Right now, making the system fully live for every client means unsetting `AUTONOMOUS_RELAY_ACTIVE`, which also removes the safety rail — two coupled things that should not be coupled, and a manual step before a meeting that decides whether he gets paid. Build `relay-golive.cmd` and `relay-resume.cmd`: **go-live** halts the relay cleanly after the current cycle, turns the autonomous gate off, VERIFIES against the direct App Service URL that sending is live for all clients, and prints in plain English what is now possible; **resume** puts the gate back on, confirms it, and restarts the relay. Neither may leave the system in a half state. Note for the record: a HUMAN clicking send in the app is already allowed today — the gate only stops machine-initiated sends — so a hand-driven demo works either way. This is about the SCHEDULED sending being genuinely live. | TODO |
| 21 | **DEADLINE 31 AUG — LIVE DOMAIN CHECK + INSTRUCTION PACK. NOT BUILT.** Promised verbatim: the system checks a customer's domain live and tells staff in plain English either "nothing needed — safe to send" or exactly which records are missing, with copy-paste instructions for that customer's DNS provider. No such feature exists — nothing in `src` resolves SPF/DKIM/DMARC for a client domain. This is the largest gap between the email and the system. | TODO |
| 22 | **DEADLINE 31 AUG — PACED SENDING: 4 AT A TIME WITH GAPS.** `send-pacing.ts` spreads INDIVIDUAL sends across the day with jitter. The promise was BATCHES of 4 with natural gaps between batches, configurable PER CLIENT. There is no batch size anywhere in the code or the schema, and `MAILBOX_SEND_PACING` is not set in production. Build the batch, make it per-client, switch it on. | TODO |
| 23 | **DEADLINE 31 AUG — RELATED-DOMAIN DETECTION IS WEAKER THAN PROMISED.** The email says near-certain matches are blocked AUTOMATICALLY and weaker ones flagged for the team. What exists proposes everything and blocks nothing. It also says the strongest signal is companies sharing a MICROSOFT TENANT, which we can verify directly — that signal is NOT implemented; we used DMARC/SPF instead. Assess honestly: is tenant matching feasible against Graph, and can a near-certain match auto-block safely? If auto-blocking is still the wrong call after measuring, say so plainly with evidence so Greg can correct the client rather than quietly under-deliver. | TODO |
| 24 | **DEADLINE 31 AUG — DELIVERABILITY REVIEW, AS A DOCUMENT FOR THE CLIENT.** All the findings exist across STATE.md: the quarantine root cause, the ~4-5% real bounce rate, the 426 unread bounces, the 8 dead mailboxes, the warm-up anchor defect. There is no document. Produce one Greg can send to Sam and James — plain English, no jargon, what was wrong, what was fixed, what remains. | TODO |
| 25 | **DEADLINE 31 AUG — LIST VERIFICATION + AUTOMATIC SAFETY LIMITS.** Promised. Bounce suppression and per-mailbox caps exist. Address verification before sending does not appear to. Establish what exists, what does not, and close the gap or report it honestly. | TODO |
| 1 | Relay proven end to end; commit the out-of-band watcher fixes | DONE 3 |
| 13 | **THE RELAY MUST SURVIVE ITS OWN FAILURES WITHOUT GREG.** This is now top priority — it is the difference between autonomous and "Greg watches a window". Three parts, all in `relay-watch.ps1`: (a) a per-cycle TIMEOUT — a hung `claude -p` currently blocks the watcher forever and only a human can clear it; kill the child after 45 minutes, record the cycle as `timed-out`, and CARRY ON to the next; (b) on failure or timeout, EMAIL GREG using the same Resend key and `ALERT_TO_EMAIL` the job alerting already uses — he should learn the relay died from his inbox, exactly as he learns a job failed, not by looking at a window; (c) a Windows Scheduled Task that starts the watcher at logon so a reboot does not silently end the run. Write the task registration as a small script he runs once, and explain it in `RELAY-README.md` in plain English. **All three shipped in #227 and all three were PROVEN TO FIRE, not just built:** (a) timeout kills the whole process TREE (a parent-only kill leaves `claude.exe`'s children alive and looks identical in the log) — `relay-selftest.ps1` 11/11, watched RED first by breaking the kill; (b) a real alert was sent end to end, Resend id `d6435f90`, via `relay-alert.yml` — **deviation, deliberate: `RESEND_API_KEY`/`ALERT_TO_EMAIL` are GitHub Secrets and are on NO laptop, so the watcher dispatches Actions instead of copying a production secret onto this machine; same key, same recipient, and every alert now leaves a run in the history**; (c) task registered, read back, and `-Prove` ran an inert twin → result 0. The self-test runs at EVERY start and the relay refuses to run if it fails. **GREG MUST RESTART THE RELAY ONCE** — PowerShell loaded the old script into memory at 08:30, so the running watcher keeps the old no-timeout behaviour until it is restarted. | DONE 6 |
| 2 | **Load speed — MEASURE first.** Which pages, how slow, where the time goes. Chrome extension approved. `loadClientWorkspaceBundle` (8 parallel queries) is a suspect, not a cause. Report before changing anything. | DONE 4 |
| 3 | **Load speed — fix (code side only).** Both tidy-ups done, measured before and after on the same harness: workspace page **19 → 17** round-trips, `ClientMailboxIdentity` reads **5 → 3**, whole-table `Client` scans **1 → 0**; still constant at 1/6/20 mailboxes. New `canAccessClient` (one indexed row) replaces "read every client, compare in JS" for single-client checks; the bundle now reuses the mailbox rows it already holds. The perf test asserts all three numbers and was **watched RED first** (`expected 5 to be less than or equal to 3`). **Correction: the count was 5, not the 4 this row claimed** — cycle 4 read its own grouped table and missed a third statement. **These were tidy-ups and are NOT the cause; nobody will feel them.** The cause is still the B1 CPU — see the standing finding below. | DONE 5 |
| 4 | **The eight dead mailboxes** — see `EIGHT-DEAD-MAILBOXES.md`. **SENDING ANSWER: no, none of the eight can send.** Proven read-only from the code, not guessed: `execute-one.ts:544/:714` and `mailbox-inbox-sync.ts` call the SAME two token functions, so one dead refresh-token grant breaks both. It fails CLOSED — `sendViaConnectedMailboxOrFail` has no ESP fallback, so a Train Hugger launch would queue and then fail every row rather than send from a wrong address. **Five of the eight are Train Hugger, so the ramp Greg is waiting on would not have run for the biggest client.** Shipped: reply sync now flips a mailbox out of CONNECTED when its credentials fail (new shared classifier `mailbox-credential-failure.ts`, used by BOTH the sync and send paths so they cannot drift), expired sign-ins → `CONNECTION_ERROR` ("reconnect"), the two DELETED Chevron accounts → `DISCONNECTED` + "Cannot be reconnected — this account no longer exists" (they were being told to "reconnect and complete MFA", which is impossible; `AADSTS500341` arrives wrapped in `invalid_grant`, so the check ORDER was the bug). Retrying-the-dead stops for free: the batch selects on CONNECTED. A transient Graph/Gmail 5xx deliberately does NOT flip anything. Watched RED first (4 failures), and the classifier is tested against the VERBATIM production error strings from run `32947374171`. **NOT done, deliberately: nothing was reconnected** — that needs the client's own sign-in and is Greg's call. **Publishing the Google OAuth app is still the only fix for the weekly recurrence.** | DONE 7 |
| 5 | **Reply claiming** — Part 2 of `ALERTS-AND-CLAIMING.md`. Advisory not a lock; 30-minute staleness. **BUILT IN CYCLE 8 — the "never started" this row used to say was WRONG, and that error cost the whole of cycle 10.** Cycle 8 wrote `DONE 8` into this row *on the feature branch*, which is unmerged; the relay reads `main`; so the relay re-dispatched an item that was already finished, and would have done so every cycle forever. See standing finding (10). **The feature is complete and PR #231 is open, green, and now rebased onto current `main`.** Cycle 10 stripped the two doc files off that branch so #231 is now NOTHING but the feature and its migration — one decision, not three. Gates re-run by cycle 10 on the merged tree: lint **0 errors**, typecheck **clean**, unit **2334 passed** (main's 2299 + this branch's 35), integration **100 passed against real Postgres**. **PROVEN TO FIRE, by sabotage, not by a green tick** — cycle 8's green run only proved the code passes, not that the tests can fail, which is exactly the vacuity that bit cycle 9. Four deliberate breaks: (a) let a viewer see their own claim → integration RED against a real database; (b) make `releaseReplyClaims` a no-op so acting never clears the marker → integration RED in two places; (c) delete `<ReplyClaimNotice>` from the linked-reply page → the wiring test RED, and that test reads the PAGE SOURCE, not the spec, so it is not the vacuous kind; (d) make a claim never go stale → integration stayed GREEN, but the unit suite went RED twice, including a test named "drops a stale row even if the database hands one back". (d) is correct layering, not a gap: staleness is filtered in SQL *and* in `selectVisibleClaim`, and both layers are independently tested. **NOT MERGED, and that is deliberate — it is the one thing here that is genuinely Greg's.** Merging runs DDL on the live client database (`PRODUCTION_PRISMA_MIGRATE` is true). The migration is as safe as a migration gets — ONE new table, ONE new enum, **zero ALTERs on any existing table**, nothing existing read or rewritten, and dropping the table restores today's behaviour exactly. CI already applied it to a clean Postgres and ran the feature against it (`reply-claim.integration.test.ts`, 6 tests, run `32956843118`). Nothing reads `ReplyClaim` for sending, suppression or governance — an empty or stale table degrades to "say nothing", never to a wrong send. **Residual risk cycle 10 could NOT check: whether production's migration history has drifted**, which is the only realistic way `migrate deploy` fails; that needs prod credentials. **Greg: press merge on #231 when you want it live.** | TODO — MIGRATION PRE-APPROVED, see standing rule |
| 6 | **DESIGN.json** — third PLAN artefact. **Written, and made load-bearing.** Direction proposed without waiting to be told one: **"Ledger & Rail"** — an outreach console is a record of things that have left the building and cannot be recalled, so it should read like a well-kept ledger, and anything that can leave the building should be visibly marked as such. Three principles (consequence is drawn not just confirmed · a record not a dashboard · calm chrome, loud state), full token set for both themes, typography, elevation and motion rules, six signature elements each carrying an HONEST build status, ten anti-goals, and WCAG 2.2 AA with all eleven success criteria named — including the four that are NEW in 2.2 (2.4.11, 2.5.7, 2.5.8, 3.3.8), which is the difference between claiming 2.2 and actually meaning it. Plain-English companion at `docs/DESIGN.md`. **The artefact is ENFORCED, not filed:** `src/lib/design/design-system.test.ts` (55 tests) reads `DESIGN.json` and the real `globals.css` and fails the build on drift in EITHER direction, on any declared contrast pair dropping below AA, on a violet/indigo hue, on pure black on pure white, or on a button below the 24px target minimum. Contrast is computed properly — new `src/lib/design/oklch.ts` (19 tests) does OKLCH→OKLab→LMS→linear sRGB with an in-gamut clip, because OKLCH lightness is NOT WCAG luminance and a gate comparing `L` values would wave failures through; verified against two independent known answers (black/white = exactly 21:1, and #ff0000 recovers luminance 0.21260, the WCAG red coefficient by definition). **PROVEN TO FIRE, twice over.** First on real ground: written BEFORE any fix, it went red on **five genuine pre-existing WCAG 2.2 AA failures that were already live** — `--input` at **1.21:1** against a required 3:1 (and it is the SOLE identifier of every text field, textarea and select, which are all `bg-transparent`, so form fields were near-invisible), and `--destructive` text at **4.44:1** against a required 4.5. Both fixed by token value; 34 `border-input` call sites across 15 files fixed by one line. Then by deliberate sabotage: **all five arms were broken on purpose and watched fire** — a drifted colour, an undeclared colour, a violet colour, a 20px button, pure black on white. **That exercise found a real defect IN THE GATE**: the violet and pure-black checks read `DESIGN.json` instead of the stylesheet, so they compared the document against itself and could never have caught a violet in the shipped CSS. Fixed and re-proven. **That is the ninth instance of this project's worst defect class, and it was in the gate written to prevent the ninth.** **DELIBERATELY NOT DONE, and this matters: the two signature elements that actually stop it looking generic — the send rail and live/dry banding — are SPECIFIED, NOT BUILT.** Nothing in the app looks different today except the two colour fixes. They are blocked behind item 7, which moves the surfaces they attach to. Three further real defects found, measured and left with their numbers in `open_defects` rather than rushed: the destructive BUTTON still fails at **3.72:1** (its label sits on a tint of its own colour — needs a solid-red variant, a component change), two chart series at **2.51/2.39** against 3:1 in light mode (the naive darkening collides chart-4 with chart-1, so it needs a real palette pass), and the inherited in-flow card/tab shadows. Gates: lint 0 errors, typecheck clean, **2299 tests green** (main's 2225 + 74 new), build compiled. **MERGED as #232, commit `fd97441`, DEPLOYED and VERIFIED LIVE** — `/api/build-info` on the DIRECT App Service URL returns `fd97441b64a48f076f32e780d51c806b97c5aeec`, and the served stylesheet carries `--input:oklch(62% .013 165)` / `oklch(53% .013 165)` and `--destructive:oklch(55% .245 27.325)` with **zero** occurrences of the old values. The accessibility fix is in front of real users, not merely built. (Correction: an earlier draft of this row said 2334 — that figure was measured on `feat/reply-claiming`, which carries its own 35 tests. Off `main` the number is 2299.) | DONE 9 |
| 7 | **UI consolidation** — PR #196, held because staff training names the old layout with screenshots. Update the training in the same change. | TODO |
| 8 | **ASK's seven.** Two are already answered in DATAMODEL.json and need carrying across (`entities`, `not_handling`). One is trivial (`access_level` = async). Three are real discovery gaps: three real cases traced end to end, frequency counts, an exception register. | TODO |
| 9 | **PROVE to 8/8.** Biggest single gap: no end-to-end coverage of the journey that reaches a third party's inbox (J5 — enrol, launch, send, reply, opt-out). Use `bidlowai` only. | TODO |
| 11 | **The cycle logs are written in the wrong encoding.** Every em-dash arrives as `ÔÇö`/`â€"`, so the plain-English record Greg is meant to read is corrupted. Fix it at the source in `relay-watch.ps1` — write UTF-8 explicitly (`Set-Content -Encoding UTF8`, and check `Out-File` calls too) — and repair the existing logs. `relay-status.mjs` currently patches the symptom; that workaround should become unnecessary, not permanent. | TODO |
| 12 | **`relay-status.cmd` / `relay-status.mjs` are untracked** — written directly to disk by Claude (Cowork), not committed. They are how Greg reads the relay. Review and commit them. | TODO |
| 10 | Re-grade and record. PROVE closes when engineering and customer-ready both reach 8. | TODO |

## Standing findings — do not re-derive these

* **TEN instances this week of "built, wired, reports success, never fired":**
  the cross-domain audit that was never a gate; `resolveUnsubscribeRail` with no
  production caller; `signature-link-audit.yml` never run for a missing
  variable; the watcher's em-dashes making it unparseable so it could never have
  run at all; the relay's safety check reading a CDN-cached health endpoint; a
  killed cycle leaving `STATUS.json` saying "running" forever; **(7) cycle 1
  recorded as `finished` when it did nothing, because `claude -p` exited 0 —
  the relay's own reporting layer**; **(8) Application Insights provisioned
  2026-04-16 and never connected — zero events in four months**; **(9) cycle 9's
  OWN design gate — its violet-hue and pure-black-on-white anti-goal checks read
  `DESIGN.json` instead of `globals.css`, so they compared the document against
  itself and could never have failed on a violet in the shipped stylesheet.
  Found ONLY by deliberately painting `--primary` violet and noticing that just
  the parity test went red. In the gate written to prevent the ninth.**
  **This is the defect this project is worst at. Assume the tenth exists.**
  (Corrected cycle 3: this list said five and omitted the em-dash parse failure,
  which `STATE.md` already records as the fourth instance. Corrected cycle 4:
  added 7 and 8. Cycle 9 added 9. No other defect class in
  `defect-classes.json` has more than two.)
  **The lesson from (9), which generalises: a check that reads the SPEC rather
  than the ARTEFACT is vacuous, and it looks identical to a working one in a
  green test run. The only thing that distinguishes them is deliberately
  breaking the artefact and watching the alarm go off. Do that every time.**
  Note on (8): it is the MILD kind. Sentry is genuinely live —
  `sentry.server.config.ts` hardcodes the DSN with `tracesSampleRate: 1` — so
  App Insights is a redundant resource, not a blind spot. Connect it or delete
  it so nobody mistakes it for coverage.
* **INSTANCE (10), found cycle 10, and it is the relay's OWN bookkeeping —
  a status write that reported success and never reached the plan of record.**
  Cycle 8 finished item 5 and dutifully wrote `DONE 8` into this file. But it
  wrote it **on `feat/reply-claiming`**, which is unmerged and will stay
  unmerged until Greg approves a migration. The relay reads `main`. So `main`
  still said "never started", and the relay dispatched cycle 10 to build a
  thing that was already built, green, and sitting in an open PR. Nothing
  errored. Every log said "finished". **Cycle 10 was spent entirely on
  discovering this, and cycles 11, 12, 13 would each have been spent the same
  way** — an unbounded loop with no alarm on it, because the queue and the work
  ride in the same commit and the queue can only land when the work is
  approved.
  **The same defect fired a SECOND time in the same cycle, and this one costs
  money:** the `PRIORITY OVERRIDE` block above — eight client commitments due
  **31 August**, on which payment depends — was sitting **uncommitted in the
  working tree**, written by the Cowork side and never landed on `main`. The
  relay therefore could not see it and was dispatching internal quality work
  with five days left on a paid deadline. Cycle 10 committed it.
  **The rule that follows: a status change and the work it describes must be
  able to land separately.** Never let the plan of record be a hostage of the
  thing it is describing. If a cycle's work is blocked, its *record* is not —
  push the record to `main` on its own branch, that day.
  **And the cheap check that would have caught both: does `main` agree with
  what you believe?** Neither failure was subtle. Both were invisible because
  nobody diffed the queue against the branch it was written on.
* **The web tier is the load-speed bottleneck, not the queries** (measured cycle
  4, `docs/ops/LOAD-SPEED-MEASUREMENT.md`). App Service is **Basic B1, one core**,
  at >=90% CPU in 43% of all hours. Postgres peaks 58%. `alwaysOn` is **false**.
  Do not spend cycles tuning SQL until the CPU ceiling is dealt with.
  Cycle 5 did the two named query tidy-ups (item 3) and they changed nothing a
  user can feel, exactly as predicted. **Three decisions are still Greg's and
  they are the whole of the remaining answer: turn Always On on (free, one
  checkbox), move off B1 (a cost decision, the highest-impact change
  available), and look at Sentry Performance — `tracesSampleRate: 1` means every
  production request is already traced and nobody has opened it.**
* **A running PowerShell script does not change when its file changes.** The
  watcher loads `relay-watch.ps1` into memory once, at start. Editing it, merging
  it, even deploying it does nothing to the process already running — it must be
  restarted. Cycle 6 shipped the timeout and the alerting to `main` and the
  watcher carried on without either, exactly as designed and exactly as easy to
  mistake for "it is live now". Ship a change to the relay, then RESTART it.
* **Dot-sourcing a PowerShell script RUNS it.** Cycle 6 dot-sourced
  `relay-watch.ps1` to reach one function and started a live relay: it
  self-queued item 4, marked its row `IN PROGRESS 7`, overwrote `CURRENT.md` and
  launched a real cycle. A script with no `param()` block silently swallows the
  switch meant to prevent that. `-LoadOnly` now exists and is load-bearing; do
  not remove it. (Left behind: row 4 wrongly `IN PROGRESS 7`, which would have
  made the relay skip the dead-mailboxes item permanently. Restored to `TODO`.)
* ~~Eight mailboxes read `CONNECTED` while their credentials are dead.~~
  **FIXED cycle 7 (#229) and PROVEN TO FIRE on production data**: reply sync
  now flips a mailbox out of `CONNECTED` when the credentials fail. The live
  Actions history shows `processed 35 / failed 8 / failure` on the run that did
  the flip, then `processed 27 / failed 0 / ok true / SUCCESS` on the very next
  run (`32952093501` → `32952551643`). Eight mailboxes left the batch. **None
  of the eight could SEND either** — send and reply sync share one refresh-token
  grant (`execute-one.ts:544`/`:714`), and it fails closed, so a Train Hugger
  launch would have queued and failed every row. Nothing was reconnected.
* The Google OAuth app is in Testing mode — 7-day token expiry, recurring
  weekly, until it is published.
* `PRODUCTION_PRISMA_MIGRATE` is true: merging a migration applies it to the
  live client database.
* Verify deploys against the DIRECT App Service URL, never the custom domain.

## Rules for both sides

* When a question blocks the work, **decide, record the decision and why, and
  continue.** Greg has explicitly asked for this. Do not stall.
* Commit, push, PR and deploy when confident.
* Every cycle: update this file's status column, and write a plain-English log.
* If something here is wrong, correct it here rather than working around it.
