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

## 2026-08-26 — WHAT THE CLIENT ACTUALLY ASKED FOR (Greg, this morning)

> *"the main thing they want is, does the system send real emails, does it do so
> safely without damaging reputations and does it receive replies etc. and the
> system UX/UI must flow perfectly."*

Four things. Everything is now ordered against them:

1. **Does it send?** — item 18
2. **Does it receive replies?** — item 17
3. **Is it safe?** — the guards are built; item 16 must SHOW them working
4. **Does the UX flow?** — item 16

The DNS checker has been demoted. It is still owed by 31 August and still not
built, but the client did not ask for it and Greg is being judged on the four
above.

## THE REAL DEADLINE IS TOMORROW MORNING — corrected 2026-08-26 12:40

Greg: *"all deadlines are for tomorrow mornings meeting, not the 31st of august."*

He is demonstrating this to the owner of OpensDoors, and payment depends on it.
Roughly 18 hours, of which most are overnight.

**Only four items matter before that meeting: 18, 17, 16, 19 — in that order.**
Everything else in this queue, including every 31 August commitment, waits.
If you find yourself starting item 20 or below while any of those four is open,
you have gone wrong.

Two hard constraints:

* **Cycles take 30-40 minutes.** There is time for roughly twenty overnight,
  and only if nothing hangs. Do not spend a whole cycle on polish while a
  question the client will actually ask is unanswered.
* **The relay dies if Greg's machine sleeps.** Flag that in your log if a cycle
  starts after a long gap — it means hours were lost and the plan needs cutting
  further, not catching up.

**An early honest "this will not be ready" is worth more than a late surprise.**
If by cycle 20 something in the four is clearly not going to land, say so in the
log in plain English so Greg can prepare what he says in the room.

## Queue, in order

| # | Item | Status |
|---|---|---|
| 18 | **BEFORE TOMORROW MORNING, BEFORE ANYTHING ELSE — CAN GREG ACTUALLY SEND TONIGHT? Prove it, do not predict it.** He has a client meeting and wants to send real email from the system himself this evening. Nothing has been sent from this system since 3 July — seven weeks — so "it should work" is worth nothing. Answer these IN ORDER and report each plainly, because an early no is far more useful than a late surprise: (1) Does the `bidlowai` client have a mailbox that is genuinely CONNECTED with live credentials? Eight mailboxes across other clients are dead; do not assume Bidlow's is not. If it is dead or missing, STOP and say so immediately — Greg needs the whole afternoon to reconnect it, not the last ten minutes. (2) Is open tracking off for that send path, and is there any rewritten link or pixel in the body? (3) Send ONE real email from the Bidlow mailbox to an address Greg controls. This is explicitly permitted — `bidlowai` is the allowlisted client. (4) Fetch the RAW source of what arrived and check every link and image host against the sending domain. A link on the app domain is the exact defect that caused the quarantine. (5) Report: did it arrive, in the inbox or spam, and what did the raw source contain. If any step fails, that failure IS the finding and it outranks every other item in this queue. | DONE 12 — **YES, THE SYSTEM SENDS. One real email left it at 12:16:36 UTC on 26 August**, from `greg@bidlow.co.uk` to `greg.visser64@gmail.com`, through the real queue worker. Full evidence, including the raw MIME, in [docs/ops/SEND-PROOF-2026-08-26.md](../../docs/ops/SEND-PROOF-2026-08-26.md). **(1) Credentials LIVE, proved against Microsoft rather than read off a status column** — the stored credential was decrypted and used to call Graph `GET /users/greg@bidlow.co.uk` → **200 OK**, scopes include `Mail.Send`. (The refresh token was deliberately NOT spent out of band; the already-stored access token was used, so the test could not break the thing it was testing.) **(2) Tracking off and no pixel** — `OPEN_TRACKING_PIXEL` reads exactly `off`, BidlowAI has no aligned link domain, and the delivered raw source contains no pixel and no rewritten href. **(3) Sent through the REAL path** — one `OutboundEmail` row (the only QUEUED row in the whole system, so nothing else could ride along), then `POST /api/internal/outbound/process-queue`, the same endpoint the 5-minute cron calls → `{"claimed":1,"completed":1,"errors":[],"ok":true}`. Row left with **no staffUserId on purpose**, so it was attributed to a MACHINE and had to PASS the autonomous allowlist gate rather than bypass it — that gate is now proven to allow `bidlowai` and nothing else. **(4) Every host aligned**: signature logo `www.bidlow.co.uk`, website link `www.bidlow.co.uk`, `mailto:` (no host). **ZERO** references to `opensdoors.bidlow.co.uk` or `azurewebsites.net` — the quarantine defect is absent. Opt-out is the mailto rail ("reply STOP"), no link, by design. **(5) No NDR came back**, so Gmail accepted it; **inbox-vs-spam is Greg's to confirm in Gmail and is NOT claimed here.** Two honest notes: no `List-Unsubscribe` header (fine now, required by Gmail/Yahoo above 5k/day), and it went out `multipart/alternative` — Exchange added the text part itself, so the "HTML-only scores as spam" worry does not apply to the Microsoft path. **THE ONE THING THAT IS NOT READY, and Greg must read it before the meeting: the BidlowAI workspace has ZERO templates and ZERO sequences.** Sending from the screens starts at a sequence and a sequence needs a template, so "open the app and send from BidlowAI myself tonight" means writing a template first. Workspaces already able to send: quirk-solutions-limited, thomas-franks, opensdoors, idverde, morson-fm, octavian-security, paratus-365, renewable-temporary-power. Workspaces that would FAIL IN THE ROOM: **train-hugger (463 contacts, 5 mailboxes in CONNECTION_ERROR) and greentheuk (233 contacts)**, plus chevron-security and protech-roofing. Estate: 27 CONNECTED, 8 CONNECTION_ERROR, 2 DISCONNECTED (deleted Entra accounts), 18 never connected — the 8 are the same 8, still not reconnected. Method note for whoever repeats this: the prod DB firewall allows Azure only, so every query ran INSIDE the App Service container via the Kudu command API under `BEGIN READ ONLY` — **no firewall rule was added and no credential left Azure**; scratch scripts deleted afterwards. Gates: lint **0 errors**, typecheck **clean**, **2312 tests passed**. Also fixed on the way past: `npm run lint` was walking into the gitignored `.tmp/` scratch directory, so a throwaway diagnostic script turned the lint gate red — `.tmp/**` is now in `globalIgnores`. |
| 17 | **BEFORE TOMORROW MORNING — PROVE A REPLY COMES BACK. The round trip, not half of it.** Greg: the client's main questions are *"does the system send real emails, does it do so safely without damaging reputations and does it receive replies."* Item 18 proves the sending half. This proves the other half, and it is the half with a known history: reply sync was silently failing on 9 of 35 mailboxes behind a green tick. Using `bidlowai` only: send from the Bidlow mailbox to an address Greg controls, REPLY to it from that address, then prove the reply is picked up, matched to the right contact, and shown on the client's Activity screen. Then reply again with the word STOP and prove that suppresses the contact automatically. Report how long each leg took — a reply that lands in forty minutes is a different product from one that lands in two. If any leg fails, that is the finding and it outranks everything below. | DONE 13 — **YES, REPLIES COME BACK, and in about a minute and a half, not forty.** Full evidence with every leg timed in [docs/ops/REPLY-PROOF-2026-08-26.md](../../docs/ops/REPLY-PROOF-2026-08-26.md). **TWO complete round trips on live production, and one of them was a real human** — Greg replied "I am replying" from his own Gmail on Outlook for Android at 12:50:34; it landed in `greg@bidlow.co.uk`, the real sync endpoint ingested it, and **38 seconds after the sync began** it was stored, matched to the RIGHT contact (`greg.visser64@gmail.com`) and linked to the RIGHT send (the 12:16:36 one), which flipped `SENT` → `REPLIED`. Round trip B was machine-driven end to end against a real external counterparty (`onboarding@resend.dev` — a genuine external domain the system can both mail AND be mailed from, chosen because Greg cannot be woken up to press reply): **send → reply on screen in 85 seconds**, **STOP → contact suppressed in 48 seconds**, and a further send to that contact came back `BLOCKED_SUPPRESSION` / `sentAt=null` — so STOP does not merely record, it **stops mail leaving**. **Activity screen PROVEN BY LOADING IT**, signed in, on the DIRECT App Service URL, not by reading the query: HTTP 200, `totalReplies:3, shownReplies:3`, with the reply text, sender and match method in the markup. **THE HONEST LATENCY NUMBER GREG SHOULD QUOTE IS 15-16 MINUTES, not 85 seconds** — the sync itself is 37-43s for all 27 mailboxes, but the cron only runs every 15 min, weekdays 07:00-18:00 UK, and NOT AT ALL overnight or at weekends. The mailbox screen's "Fetch replies" button runs the same sync on demand. **THE DEFECT THIS FOUND, and it is instance ELEVEN of this project's worst class: our own opt-out instruction did nothing.** Every email we send on the mailto rail ends "To opt out, reply STOP to this email and we'll remove you" — and the classifier's ten patterns matched **no bare `STOP`** (`stop-emailing` needs STOP followed by email/contact/messag/sending/reaching). On that rail there is no unsubscribe link, so replying STOP is the ENTIRE opt-out mechanism, which makes it a PECR compliance defect, not a cosmetic one. The round trip only passed because the test reply ALSO said "take me off this list" and a different pattern caught that. **FIXED in PR #238** (one line-anchored pattern, optional `Re:` prefix for subject-line STOPs, explicit `
` because Graph delivers CRLF), **5 tests watched RED first** (`"STOP": expected false to be true`, 2 failed | 9 passed) and the three false-positive guards passed before AND after, so it did not buy its win by loosening the classifier. Gates: lint **0 errors**, typecheck **clean**, **2317 tests passed**. **SECOND FINDING, NOT FIXED — reply sync reads the Inbox folder ONLY, so a prospect reply that Exchange junks is never ingested, with no error and no warning.** Found by accident: a probe at 12:41:27 vanished and was sitting in `JunkEmail`, while the same sender's other mail went to the Inbox. Ingesting Junk would be reasonably safe (a message is only matched when it comes from an address we actually emailed) but it is a mailbox-ingestion change and this repo requires those behind a flag, proven separately. **Next cycle's strongest candidate.** Two more things worth knowing: (a) **`rfc822MessageId` is NULL on every Microsoft Graph send**, so the `BY_THREAD_REF` matching leg is INERT on the Microsoft path — matching rests entirely on "from the address we emailed" + a "Re:" subject; both held on all three replies, but the belt-and-braces leg is not there. (b) An attempt to inject a message into the mailbox via Graph returned **403 `ErrorAccessDenied`** — the grant is `Mail.Send`+`Mail.Read` with no `Mail.ReadWrite`, so the app genuinely cannot write into a customer's mailbox, which is the right answer and is why a real external counterparty was used instead. Writes to production were 1 Contact + 2 OutboundEmail rows, `bidlowai` only, both sends left with NO staffUserId so they had to PASS the autonomous allowlist gate rather than bypass it. |
| 16 | **BEFORE TOMORROW MORNING — WALK EVERY SCREEN AS A HUMAN AND FIND THE BUGS BEFORE THE CLIENT DOES.** Greg: *"the system UX/UI must flow perfectly."* He is demonstrating this to the person who decides whether he gets paid. Use Chrome, signed in, and actually click through it: the client list, a client workspace, mailboxes, contacts, sequences, activity, replies, suppression, the do-not-contact proposals screen, launch readiness. For each: does it load in a reasonable time, does anything error, is any wording jargon a non-technical person would not understand, is any screen showing the same thing twice, and does anything read as broken or half-finished. Record page load times as measured, not as impressions. Produce a ranked list — worst first — of what a client would notice in a live demo, then FIX the top ones. Do not report a screen as fine without having opened it. | TODO |
| 19 | **TODAY — ONE COMMAND TO GO LIVE FOR THE MEETING, AND ONE TO GO BACK.** Greg has a client meeting and must NOT be flipping Azure settings by hand to prepare for it. Right now, making the system fully live for every client means unsetting `AUTONOMOUS_RELAY_ACTIVE`, which also removes the safety rail — two coupled things that should not be coupled, and a manual step before a meeting that decides whether he gets paid. Build `relay-golive.cmd` and `relay-resume.cmd`: **go-live** halts the relay cleanly after the current cycle, turns the autonomous gate off, VERIFIES against the direct App Service URL that sending is live for all clients, and prints in plain English what is now possible; **resume** puts the gate back on, confirms it, and restarts the relay. Neither may leave the system in a half state. Note for the record: a HUMAN clicking send in the app is already allowed today — the gate only stops machine-initiated sends — so a hand-driven demo works either way. This is about the SCHEDULED sending being genuinely live. | TODO |
| 20 | **BY 31 AUG (NOT tomorrow) — TRACKING OFF BY DEFAULT, PER-CLIENT OPT-IN. Not an environment toggle.** Greg's requirement, and it is a better design than what exists: *"it should be off by default, and if a customer agrees that they would change their DNS for tracking then the customer will make the changes and the toggle will be switched on for that particular customer."* Today `isOpenTrackingPixelEnabled()` is global and returns TRUE unless someone remembered to set `OPEN_TRACKING_PIXEL=off` — a promise resting on somebody's memory. Build it properly: a per-client setting, **defaulting to OFF**, that can only be turned on for a client whose DNS has been verified. The env var becomes a global kill-switch backstop, never the mechanism. Red first: a client with no setting must get NO pixel and NO rewritten links. Report the live Azure value on the way past. | TODO — **still TODO: the per-client opt-in is NOT built.** Cycle 11 did the "report the live Azure value" half and hardened the backstop. **Live value is exactly `off`** (lower-case, no whitespace) on `app-opensdoors-outreach-prod`, read 2026-08-26 via `az webapp config appsettings list`; `OPEN_TRACKING_REQUIRE_ALIGNED_DOMAIN` is unset. So the written promise to the client currently HOLDS. Proven beyond the config value, because a correct setting is not a pixel that stops: only two call sites embed a pixel (`execute-one.ts`, Gmail + Graph legs) and both route through `buildOpenTrackingPixelUrl`, so there is no bypass; and the compiled server bundle keeps a genuine RUNTIME read (`if("off"===process.env.OPEN_TRACKING_PIXEL)return null`), so the value is NOT inlined at build time from the GitHub Actions environment — that was the real risk of a cosmetic switch. Deployed commit `1f8a8e7` matched the inspected code. NOT verified: opens-stopped evidence from the production database — the DB firewall allows Azure services only, and opening a live client database to a workstation IP is Greg's call, not the relay's. **Defect found and FIXED (PR #235):** the backstop failed OPEN — `!== "off"` meant `OFF`, `Off`, `off ` (trailing space), `false`, `0`, `no` all silently RESUMED tracking with no error, no log and nothing on screen. Now trimmed + lower-cased, fail-closed, 11 red-first tests watched failing first. That makes the env var safe to serve as the "global kill-switch backstop" this item calls for. **What remains for this item:** the per-client setting defaulting to OFF, gated on verified DNS, plus the link-rewriting half. | 
| 22 | **BY 31 AUG (NOT tomorrow) — PACED SENDING: 4 AT A TIME WITH GAPS.** `send-pacing.ts` spreads INDIVIDUAL sends across the day with jitter. The promise was BATCHES of 4 with natural gaps between batches, configurable PER CLIENT. There is no batch size anywhere in the code or the schema, and `MAILBOX_SEND_PACING` is not set in production. Build the batch, make it per-client, switch it on. | TODO |
| 23 | **BY 31 AUG (NOT tomorrow) — RELATED-DOMAIN DETECTION IS WEAKER THAN PROMISED.** The email says near-certain matches are blocked AUTOMATICALLY and weaker ones flagged for the team. What exists proposes everything and blocks nothing. It also says the strongest signal is companies sharing a MICROSOFT TENANT, which we can verify directly — that signal is NOT implemented; we used DMARC/SPF instead. Assess honestly: is tenant matching feasible against Graph, and can a near-certain match auto-block safely? If auto-blocking is still the wrong call after measuring, say so plainly with evidence so Greg can correct the client rather than quietly under-deliver. | TODO |
| 24 | **BY 31 AUG (NOT tomorrow) — DELIVERABILITY REVIEW, AS A DOCUMENT FOR THE CLIENT.** All the findings exist across STATE.md: the quarantine root cause, the ~4-5% real bounce rate, the 426 unread bounces, the 8 dead mailboxes, the warm-up anchor defect. There is no document. Produce one Greg can send to Sam and James — plain English, no jargon, what was wrong, what was fixed, what remains. | TODO |
| 25 | **BY 31 AUG (NOT tomorrow) — LIST VERIFICATION + AUTOMATIC SAFETY LIMITS.** Promised. Bounce suppression and per-mailbox caps exist. Address verification before sending does not appear to. Establish what exists, what does not, and close the gap or report it honestly. | TODO |
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
  **INSTANCE (11), found cycle 13, and it is the one with a legal obligation
  behind it: EVERY outreach email we send ends "To opt out, reply STOP to this
  email and we'll remove you", and a reply saying STOP matched none of the
  opt-out classifier's ten patterns.** On the mailto rail there is no
  unsubscribe link, so replying STOP is the ENTIRE opt-out mechanism — the
  system published an instruction and then ignored the one word it asked for.
  It was invisible because the classifier IS wired, IS flag-enabled in
  production, and DOES fire on nine other phrasings; only the word we actually
  print was missing. Fixed in #238, red-first.
  **This is the defect this project is worst at. Assume the twelfth exists.**
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
