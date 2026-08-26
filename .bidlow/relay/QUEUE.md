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
`TODO` · `IN PROGRESS <cycle>` · `DONE <cycle>` · `BLOCKED — <why>`

---

## Queue, in order

| # | Item | Status |
|---|---|---|
| 1 | Relay proven end to end; commit the out-of-band watcher fixes | DONE 3 |
| 2 | **Load speed — MEASURE first.** Which pages, how slow, where the time goes. Chrome extension approved. `loadClientWorkspaceBundle` (8 parallel queries) is a suspect, not a cause. Report before changing anything. | TODO |
| 3 | **Load speed — fix** what the measurement actually found | TODO |
| 4 | **The eight dead mailboxes** — see `EIGHT-DEAD-MAILBOXES.md`. Answer the SENDING question first. Six need the client to sign in (blocked, prepare only); two Chevron accounts are deleted and can never reconnect. Make the screen stop saying "Connected" when credentials are dead. | TODO |
| 5 | **Reply claiming** — Part 2 of `ALERTS-AND-CLAIMING.md`, never started. Advisory not a lock; 30-minute staleness. | TODO |
| 6 | **DESIGN.json** — third PLAN artefact. Direction, tokens, signature elements, anti-goals, WCAG 2.2 AA. Propose a direction; do not wait to be told one. Greg has asked three times that systems stop looking generic. | TODO |
| 7 | **UI consolidation** — PR #196, held because staff training names the old layout with screenshots. Update the training in the same change. | TODO |
| 8 | **ASK's seven.** Two are already answered in DATAMODEL.json and need carrying across (`entities`, `not_handling`). One is trivial (`access_level` = async). Three are real discovery gaps: three real cases traced end to end, frequency counts, an exception register. | TODO |
| 9 | **PROVE to 8/8.** Biggest single gap: no end-to-end coverage of the journey that reaches a third party's inbox (J5 — enrol, launch, send, reply, opt-out). Use `bidlowai` only. | TODO |
| 10 | Re-grade and record. PROVE closes when engineering and customer-ready both reach 8. | TODO |

## Standing findings — do not re-derive these

* **SIX instances this week of "built, wired, reports success, never fired":**
  the cross-domain audit that was never a gate; `resolveUnsubscribeRail` with no
  production caller; `signature-link-audit.yml` never run for a missing
  variable; the watcher's em-dashes making it unparseable so it could never have
  run at all; the relay's safety check reading a CDN-cached health endpoint; a
  killed cycle leaving `STATUS.json` saying "running" forever.
  **This is the defect this project is worst at. Assume the seventh exists.**
  (Corrected cycle 3: this list said five and omitted the em-dash parse failure,
  which `STATE.md` already records as the fourth instance. No other defect class
  in `defect-classes.json` has more than two.)
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
