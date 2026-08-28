# Findings handed over by Claude (Cowork side)

Nothing else writes this file, which is the point. Five queue rows written here on
2026-08-28 between 02:50 and 03:05 were LOST when a cycle rewrote QUEUE.md from a
stale read - the third time that has happened (it also ate the promoted BLUEPRINT
and CLASSIFY answers on 27 August). Work these in order. Mark each DONE in this
file, not by deleting it.

---

## 1. THE MAILBOX CONNECT ERROR NAMES THE WRONG PROVIDER, AND HIDES THE CAUSE
**Greg is blocked on this right now. Do it first.**

On 2026-08-28 he pressed Connect on five GOOGLE WORKSPACE mailboxes and the page
said "**Microsoft** sign-in did not finish."

**Defect A, confirmed by reading it.** `src/app/(app)/clients/[clientId]/mailboxes/page.tsx`
lines 117-137 hardcode the word Microsoft into five of six messages:
`oauth_not_configured`, `missing_params`, `provider_denied`, `callback_failed`,
and the "Microsoft returned, but this mailbox is still not connected" banner. The
mapping was written when Microsoft was the only provider and never revisited when
Google was added. The row knows its provider; the banner does not use it. The cost
is not cosmetic - it sent the operator to the wrong console.

**Defect B, why nobody can diagnose it.** `src/app/api/mailbox-oauth/google/callback/route.ts:188`
and the Microsoft twin at :219 are catch-alls: ANY exception becomes
`reason=callback_failed`, the real error is swallowed, and the audit row records
only `outcome: failed`. Put the real error in the audit metadata and give the
redirect a specific safe code, so the next person reads "consent was refused",
"this account is not on the test-user list" or "the token exchange was rejected".

Two live hypotheses for THIS failure, neither confirmed - which is the whole
point: (a) the five @trainhugger.com accounts are not on the Google test-user
list, and in Testing only listed test users may authorise anything beyond basic
profile; (b) Train Hugger's own Workspace admin has not allowlisted the client ID
under API controls, which is normal for restricted Gmail scopes.

Red-first: assert the redirect carries a distinct reason for two different
failures, and that a Google mailbox never produces the word "Microsoft".

---

## 2. BUILD /privacy AND /terms - THREE BLOCKERS IN ONE
The Google **Publish app** button is DISABLED: "Your app's OAuth configuration is
incomplete... visit the Branding page." Confirmed against Google's documentation
(support.google.com/cloud/answer/15549049): homepage, PRIVACY POLICY and TERMS OF
SERVICE URLs are all mandatory before an external app can be published, and "You
will not be able to submit your app for verification if it is missing these links."

This one job: closes CR-07 (no privacy, terms or legal route exists anywhere in
`src/app`); unblocks publishing the Google app, which is the only thing that stops
every Google Workspace client's mailboxes expiring seven days after consent; and
therefore unblocks Train Hugger (463 contacts, 29 sequences, 0 of 5 mailboxes).

Build real pages at `/privacy` and `/terms`, reachable WITHOUT a login, linked
from the footer. Write them from what the code actually does: entities and their
endings are in `.bidlow/BLUEPRINT.json`; sub-processors are Microsoft Graph,
Google Workspace, Google Sheets, RocketReach, Resend and Sentry; sending is from
the client's own mailbox as the client; suppression is append-only and checked
twice; there is NO retention or erasure schedule and Greg's stated rule is that
prospect details are kept until they stop working; ContactUniverse is cross-client
and survives a workspace purge. State the uncomfortable ones plainly - a privacy
policy that does not match the system is worse than none.

Mark it a DRAFT for Greg to review. It is not legal advice and must not be
presented as reviewed. Red-first: both routes return 200 with no session.

---

## 3. THE SHEET RANGE CAN BE SAVED BUT NEVER ENTERED - INSTANCE NINE
Train Hugger (serving 373 STALE rows) and Pareto FM (NO domain block list at all)
both fail because the sync looks in `Sheet1!A1:Z50000` and both sheets call that
tab `Domains`. The product's own error says "Update the range if your data is on
another tab" - and there is NO RANGE FIELD IN THE UI.

`client-suppression-source-actions.ts` already accepts `sheetRange` (line 18),
trims it (47) and writes it (58, 69); `suppression-sync.ts:125` reads it;
`schema.prisma:967` has the column. But `grep -rn 'name="sheetRange"' src` returns
NOTHING. Built, wired, reachable, no caller. Add the input. Red-first: save a
range, assert the sync uses it.

Greg's interim workaround (rename the sheet tab to `Sheet1`) must NOT become the
answer - it makes every client bend their spreadsheet around our default.

---

## 4. THE 429 FIX MAY HAVE SWITCHED PRODUCTION MONITORING OFF
Commit `72a11bd` (#299) was right to act - a hardcoded DSN was rate-limiting CI -
but it changed two things by side effect.

(a) The DSN is now `process.env.NEXT_PUBLIC_SENTRY_DSN`. GRADES.json
engineering.met still credits "Error monitoring cannot be switched off by a
missing setting - the Sentry DSN is hard-coded." THAT IS NOW FALSE. If the
variable is not set on the App Service, production has been blind since the
deploy. UNVERIFIED - the Azure settings tool refuses without interactive consent.
Verify, then correct the grade line whichever way it lands.

(b) `dataCollection` is now an EMPTY object. The installer's `userInfo: false` and
`httpBodies: []` lines are gone and nothing replaced them, so CR-06 is exactly as
open as before, minus the only hint telling anyone how to fix it. Set both
explicitly and add a test asserting the init options.

Lesson: the fix was for CI; the blast radius was production observability and a
live privacy gap.

---

## 5. FOURTEEN PULL REQUESTS OPEN, TWELVE GREEN
#297 and #243 are RED - read the failures, do not merge them. The twelve green:
#292, #291, #274, #269, #268, #264, #262, #260, #256, #212, #211, #208.

Order matters, because branch protection requires each branch to be current and
every merge invalidates the next: merge the record-only ones first (#211, #212,
#256, #260, #262, #264, #269 - `.bidlow` and docs, cannot conflict with code),
then the code ones (#291, #292, #274, #268, #208), updating each as you go. Prefer
`gh pr merge --auto` if auto-merge can be enabled. Check #268 and #208 for a
Prisma migration first - a destructive one is still Greg's; additive is yours.

The standing rule says not to park a green PR, but nothing ever swept the ones
already parked. Close that gap too: surface a green PR older than one cycle on the
relay-status panel. A rule nobody sweeps only works on the day it is written.

---

## 6. QUEUE.md IS BEING CLOBBERED BY STALE WRITES - FIX THE MECHANISM
Three times now: the promoted BLUEPRINT and CLASSIFY answers (27 Aug), and twice
today. A cycle reads QUEUE.md, works for thirty minutes, and writes the whole file
back, silently discarding anything added meanwhile.

`Set-QueueRowStatus` in relay-watch.ps1 already does the right thing - it rewrites
ONE row from a fresh read. The agent does not. Give the agent the same discipline:
re-read immediately before writing and only replace its own row, or compare the
file against the version it read and refuse to overwrite a changed one. A queue
that eats instructions is worse than a queue that rejects them.
