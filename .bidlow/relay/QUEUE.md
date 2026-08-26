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

## Queue, in order

| # | Item | Status |
|---|---|---|
| 1 | Relay proven end to end; commit the out-of-band watcher fixes | DONE 3 |
| 13 | **THE RELAY MUST SURVIVE ITS OWN FAILURES WITHOUT GREG.** This is now top priority — it is the difference between autonomous and "Greg watches a window". Three parts, all in `relay-watch.ps1`: (a) a per-cycle TIMEOUT — a hung `claude -p` currently blocks the watcher forever and only a human can clear it; kill the child after 45 minutes, record the cycle as `timed-out`, and CARRY ON to the next; (b) on failure or timeout, EMAIL GREG using the same Resend key and `ALERT_TO_EMAIL` the job alerting already uses — he should learn the relay died from his inbox, exactly as he learns a job failed, not by looking at a window; (c) a Windows Scheduled Task that starts the watcher at logon so a reboot does not silently end the run. Write the task registration as a small script he runs once, and explain it in `RELAY-README.md` in plain English. | TODO |
| 2 | **Load speed — MEASURE first.** Which pages, how slow, where the time goes. Chrome extension approved. `loadClientWorkspaceBundle` (8 parallel queries) is a suspect, not a cause. Report before changing anything. | DONE 4 |
| 3 | **Load speed — fix (code side only).** Both tidy-ups done, measured before and after on the same harness: workspace page **19 → 17** round-trips, `ClientMailboxIdentity` reads **5 → 3**, whole-table `Client` scans **1 → 0**; still constant at 1/6/20 mailboxes. New `canAccessClient` (one indexed row) replaces "read every client, compare in JS" for single-client checks; the bundle now reuses the mailbox rows it already holds. The perf test asserts all three numbers and was **watched RED first** (`expected 5 to be less than or equal to 3`). **Correction: the count was 5, not the 4 this row claimed** — cycle 4 read its own grouped table and missed a third statement. **These were tidy-ups and are NOT the cause; nobody will feel them.** The cause is still the B1 CPU — see the standing finding below. | DONE 5 |
| 4 | **The eight dead mailboxes** — see `EIGHT-DEAD-MAILBOXES.md`. Answer the SENDING question first. Six need the client to sign in (blocked, prepare only); two Chevron accounts are deleted and can never reconnect. Make the screen stop saying "Connected" when credentials are dead. | TODO |
| 5 | **Reply claiming** — Part 2 of `ALERTS-AND-CLAIMING.md`, never started. Advisory not a lock; 30-minute staleness. | TODO |
| 6 | **DESIGN.json** — third PLAN artefact. Direction, tokens, signature elements, anti-goals, WCAG 2.2 AA. Propose a direction; do not wait to be told one. Greg has asked three times that systems stop looking generic. | TODO |
| 7 | **UI consolidation** — PR #196, held because staff training names the old layout with screenshots. Update the training in the same change. | TODO |
| 8 | **ASK's seven.** Two are already answered in DATAMODEL.json and need carrying across (`entities`, `not_handling`). One is trivial (`access_level` = async). Three are real discovery gaps: three real cases traced end to end, frequency counts, an exception register. | TODO |
| 9 | **PROVE to 8/8.** Biggest single gap: no end-to-end coverage of the journey that reaches a third party's inbox (J5 — enrol, launch, send, reply, opt-out). Use `bidlowai` only. | TODO |
| 11 | **The cycle logs are written in the wrong encoding.** Every em-dash arrives as `ÔÇö`/`â€"`, so the plain-English record Greg is meant to read is corrupted. Fix it at the source in `relay-watch.ps1` — write UTF-8 explicitly (`Set-Content -Encoding UTF8`, and check `Out-File` calls too) — and repair the existing logs. `relay-status.mjs` currently patches the symptom; that workaround should become unnecessary, not permanent. | TODO |
| 12 | **`relay-status.cmd` / `relay-status.mjs` are untracked** — written directly to disk by Claude (Cowork), not committed. They are how Greg reads the relay. Review and commit them. | TODO |
| 10 | Re-grade and record. PROVE closes when engineering and customer-ready both reach 8. | TODO |

## Standing findings — do not re-derive these

* **EIGHT instances this week of "built, wired, reports success, never fired":**
  the cross-domain audit that was never a gate; `resolveUnsubscribeRail` with no
  production caller; `signature-link-audit.yml` never run for a missing
  variable; the watcher's em-dashes making it unparseable so it could never have
  run at all; the relay's safety check reading a CDN-cached health endpoint; a
  killed cycle leaving `STATUS.json` saying "running" forever; **(7) cycle 1
  recorded as `finished` when it did nothing, because `claude -p` exited 0 —
  the relay's own reporting layer**; **(8) Application Insights provisioned
  2026-04-16 and never connected — zero events in four months.**
  **This is the defect this project is worst at. Assume the ninth exists.**
  (Corrected cycle 3: this list said five and omitted the em-dash parse failure,
  which `STATE.md` already records as the fourth instance. Corrected cycle 4:
  added 7 and 8. No other defect class in `defect-classes.json` has more than two.)
  Note on (8): it is the MILD kind. Sentry is genuinely live —
  `sentry.server.config.ts` hardcodes the DSN with `tracesSampleRate: 1` — so
  App Insights is a redundant resource, not a blind spot. Connect it or delete
  it so nobody mistakes it for coverage.
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
* Eight mailboxes read `CONNECTED` while their credentials are dead.
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
