# PROVE - the last stage open, and how to close it

Written out of band by Claude on 2026-08-27, read-only against `main`. Greg has
read the summary of this. Nothing here was assumed; every claim names the file
and line it came from, and anything NOT verified is marked as not verified.

**Do not re-diagnose blocker 1. It is already traced. Go straight to the fix.**

## The gate

`.bidlow/GRADES.json`: PROVE closes when engineering >= 8 AND customer-ready >= 8.
Engineering is 8.0. Customer-ready is 6.8. Five blockers are named. Four are ours.

## Blocker 1 - the bounce rate is structurally pinned at 0%

Reports shows 0% across 1,209 sends. That is not bad data. The metric is wired to
a channel the outreach does not use.

1. `src/server/queries/outreach-metrics.ts:308` and `src/server/queries/report-detail.ts:190`
   compute the bounce rate from `OutboundEmail.status == "BOUNCED"`.
2. The ONLY writer of that status outside tests is
   `src/server/email/webhooks/outbound-provider-events.ts:217`, and its only real
   caller is `src/app/api/webhooks/resend/route.ts`. The number is fed exclusively
   by the Resend webhook. (The two other callers are `/api/dev/simulate-*` routes.)
3. Prospect outreach never goes through Resend.
   `src/server/email/outbound/prospect-send-transport-guard.ts` documents and
   enforces that a prospect-bound row with a `mailboxIdentityId` is sent through
   Microsoft Graph or Gmail via `sendViaConnectedMailboxOrFail`, which has no ESP
   fallback - and a prospect-bound row WITHOUT one is now refused outright rather
   than falling through to the mock provider. Neither Graph nor Gmail posts to the
   Resend webhook. So no outreach send can ever reach status BOUNCED.
4. The one path that CAN see a Graph/Gmail bounce is `processSyncedMessageForBounce`
   in `src/server/mailbox/bounce-detection.ts`, which reads NDR/DSN mail out of the
   synced inbox and is called from `src/server/mailbox/mailbox-inbox-sync.ts` (two
   places, lines ~217 and ~410). It calls `suppressRecipientForHardBounce`
   (`src/server/email/bounce-suppression.ts:74`), which creates the SuppressedEmail
   row, flags matching contacts and writes an audit row - and NEVER touches the
   OutboundEmail row's `status` or `bouncedAt`. Grep that file: neither identifier
   appears in it except as an input field name it only logs. So even with the flag
   on, the reported number still cannot move.
5. That flag is `MAILBOX_BOUNCE_DETECTION_ENABLED` and it DEFAULTS TO OFF
   (`src/server/mailbox/bounce-detection.ts:17-22`). **Its value in the production
   App Service was NOT checked - verify it, do not assume it.**

**This is instance eight of the house defect, and note its exact shape: the SAFETY
half works - a hard-bounced address does get suppressed, so it is not contacted
again - while the half the client judges deliverability by can never move off zero.**

What closing it looks like:

* Make the mailbox NDR path stamp the OutboundEmail row the same way the webhook
  path does, so one bounce produces one consistent record whichever channel saw it.
  Both paths should end in the same function.
* Turn the flag on in production and verify by hash that the running build has it.
* Red-first test: a synced NDR for an address this workspace really sent to must
  move that row to BOUNCED and raise the reported rate. Watch it fail first.
* Decide separately whether a bounce rate with no data behind it should render as
  `0%` at all, or as `no data yet`. A confident wrong number is worse than a blank.

CORRECTION, and do not repeat the error: the "under 2% bounce rate" that GRADES.json
calls non-negotiable HAS NO PRIMARY SOURCE. That was checked on 2026-08-24 and Google
publishes no bounce threshold at all - only a complaint rate below 0.10%, and never
above 0.30%. So while fixing this, also fix the standard: cite the real published
number or drop the claim. Confidence V requires a primary source, and this one has none.

NOTE ON PRIORITY, not on doubt: this shape of the defect was already recorded on
2026-08-24 ("the NDR path detects and suppresses correctly, but never writes the
BOUNCED status the report counts"). The trace above re-derived it independently and
pins it to exact files and lines. It has been known for three days and is still open,
which is the reason it is now the top of the queue rather than a note.

## Blocker 2 - the product shows two truths about one client

Overview reads "Activity - not started" while Activity reads "EMAILS SENT 1".
Two sources of truth for one fact. Make both read from one source and add a test
that fails if they can diverge. Start from `src/server/activity/client-activity.ts`
and whatever the Overview card queries - they are not the same query today.

## Blocker 3 - E-06, duplicate raw inbound mail

One mailbox connected to two workspaces duplicates raw inbound mail, body text
included. That is a tenant-isolation defect on the RECEIVE side, and isolation is
the thing this system is sold on. Treat it at that weight.

## Blocker 4 - J5 end to end

**CLOSED in cycle 43** by `src/server/email-sequences/j5-journey.integration.test.ts`.

Two corrections to what this section originally said, recorded so the next cycle
does not repeat them:

1. It said to check "the e2e test adopted in cycle 33". **There is no such test.**
   Cycle 33 was queue item 22 (paced sending) and it timed out at the 45-minute
   deadline. No spec in `e2e/` mentions enrol, launch, send, reply or opt-out.
2. It asked for "a real Playwright journey". That is the wrong harness for this
   one, and not for lack of effort: `e2e/env.ts` deliberately blanks every
   provider credential so a real send is impossible, and a captured transport
   needs a module boundary a built production server does not expose. Weakening
   that to let a browser "send" would trade a real safety guarantee for a
   cosmetic one. The journey runs against a real database with the transport
   captured instead. Reasoning recorded in `SCOPE.md` §2.

Original text: Enrol, launch, send, reply, opt-out, walked as a real Playwright
journey, on the `bidlowai` client only.

## Blocker 5 - RESEARCHED 2026-08-27, AND IT IS SMALLER THAN IT LOOKED

Art.28 DPAs with Sentry, RocketReach and Resend. Do NOT attempt to accept anything -
that is Greg's, and only Greg's. What was established, from each vendor's own
published DPA, so nobody has to research it again:

* RESEND - NOTHING TO DO. The DPA is incorporated into the Terms of Service and
  binds automatically: "This Addendum shall become legally binding upon Customer
  entering into the Agreement." EU and UK Standard Contractual Clauses are included
  and section 6.3.9 states the parties "are deemed to have signed the EU SCCs".
  Source: https://resend.com/legal/dpa (last updated 31 December 2025).

* ROCKETREACH - NOTHING TO SIGN. The DPA "forms part of the RocketReach Terms of
  Service" and is read as one document with them; no separate signature is required.
  SCCs and UK SCCs are the transfer instrument (section 5.1). NOTE THE ROLE SPLIT,
  because it matters for this product: section 2.1 makes both parties INDEPENDENT
  CONTROLLERS for RocketReach's own data (the prospect records it sells), while
  sections 2.2 and 4.1 make RocketReach a PROCESSOR only for data the customer
  supplies. So enriched prospect data is not simply "our data processed by them".
  Source: https://rocketreach.co/dpa (no effective date published on the page -
  record that as an honest gap rather than inventing one).

* SENTRY - THE ONLY ONE THAT NEEDS AN ACTION, and it is self-serve. Sentry's DPA is
  NOT automatic: it is "entered into by ... the party that electronically accepts or
  otherwise agrees or opts-in to this DPA" (version 5.1.0, effective 29 May 2024).
  Greg accepts it under Legal & Compliance in the Sentry organisation settings -
  Owner or Billing role only - and afterwards the page shows who accepted it and
  when, which is the evidence to cite. A DocuSign PowerForm is the alternative.
  Source: https://sentry.io/legal/dpa and Sentry's own help article on signing it.

WHAT THIS MEANS FOR THE GRADE: two of the three are already in place by operation of
the vendors' terms and can be recorded as satisfied WITH THE SOURCE CITED. The third
is one acceptance by Greg. Record the evidence - who accepted, when, which version -
do not record "DPA in place" as a bare assertion.

None of the above is legal advice; it is a reading of what each vendor publishes.

## Done looks like

`.bidlow/GRADES.json` re-graded, customer-ready at 8 or above, every claim tied to
evidence that was actually run and named, and the deck's PROVE tile turning green
on its own without anyone editing the deck.

## The hard rule still applies

Real email may be sent, and data deleted, ONLY for the `bidlowai` client.

## FOUND 2026-08-27 WHILE RESEARCHING THE SENTRY DPA - READ THIS BEFORE DECIDING

`sentry.server.config.ts` and `sentry.edge.config.ts` are still the scaffolding
Sentry's installer generates, unchanged, and two things in them matter.

**1. Personal data IS being sent to Sentry right now.** Both files contain:

    dataCollection: {
      // To disable sending user data and HTTP bodies, uncomment the lines below.
      // userInfo: false,
      // httpBodies: [],
    },

Those lines are COMMENTED OUT, so the SDK defaults apply and user info and HTTP
request bodies are collected. On this product that means prospect names, email
addresses, phone numbers and the bodies of real outreach and real replies can
leave the building inside an error report. That is the whole reason the Art.28
DPA is not optional here, and it is also a thing a client is entitled to ask
about: "who else sees our prospects' data?"

**2. The DSN is HARD-CODED, not read from an environment variable**, so Sentry is
unambiguously live in production - it cannot be off by a missing setting. The
ingest host is `o4511767741071360.ingest.de.sentry.io`, an EU endpoint, which is
the right region for UK/EU data. Note this SETTLES the open question in
GRADES.json engineering.not_met, which says Sentry is "configured but I did not
verify it is RECEIVING events in production" - the DSN cannot be absent. Whether
events are ARRIVING still needs one look at the Sentry dashboard.

**3. `tracesSampleRate: 1`** samples 100% of traces. That is the installer default,
not a decision, and on a paid plan it is a cost as well as a volume question.

WHAT TO DO, and it is small: uncomment `userInfo: false` and `httpBodies: []` in
both files so personal data stops flowing to a third party, and decide a real
trace sample rate. Red-first is straightforward - assert the Sentry init options
in a test, watch it fail against the current config, then fix it. This does NOT
remove error monitoring; it removes the personal data from inside it.

DO NOT remove Sentry to dodge the DPA. Tier P requires live error monitoring, so
removing it trades a one-minute acceptance for a drop in the engineering grade.

## SENTRY WAS DOWN WHEN GREG WENT TO ACCEPT THE DPA - 2026-08-27

status.sentry.io: "sentry.io is not available". Investigating from 09:24 UTC,
still updating at 09:56 UTC, Dashboard listed as Partial Outage. So the one
acceptance Greg had to make could not be made, through no fault of his.

RECORD IT AS THAT, precisely, and do not round it to "not done": blocker 5 is
"one self-serve acceptance, attempted 2026-08-27 ~10:00 UTC, blocked by a Sentry
platform outage - see status.sentry.io for that morning". When it is accepted,
the evidence to cite is the who-and-when that Sentry's Legal & Compliance page
shows afterwards, not a bare assertion.

TWO THINGS THIS OUTAGE ALSO ESTABLISHED, both worth keeping:

1. **Production was unaffected.** `/api/health` on the direct App Service URL,
   during the outage: `{"ok":true,"checks":{"database":"ok"},
   "autonomousRelay":{"active":true,"allowlistedClients":1}}`. A third-party
   dependency went down and the product did not. That is real evidence for
   "does it work safely", and it was measured rather than assumed.
   (`allowlistedClients: 1` is also the hard rule showing up in production: only
   `bidlowai` may be sent to, enforced in code rather than by good intentions.)

2. **It strengthens the config fix above.** With `userInfo` and `httpBodies` at
   their defaults and `tracesSampleRate: 1`, an outage means the SDK is buffering
   and retrying payloads that contain prospect personal data. Turning those two
   off reduces both the exposure and the volume.
