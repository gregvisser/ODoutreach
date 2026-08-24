# ODoutreach — GO LIVE. Work through all of this without stopping.

Greg is asleep. OpensDoors staff open this system at **10:00 today** and start
sending. Read `.bidlow/STATE.md` (session 2026-08-24f) first. Production serves
`d01cafb`. PR **#193** is open.

## How to run this session

**Work continuously through items 1–6. Commit, push, PR, merge and deploy as you
go** — Greg has authorised the merges for this session. One PR at a time, each
verified against `/api/build-info` and `/api/health` before the next.

**There is exactly ONE condition where you stop and wait:**

> **If item 1 shows a genuine hard-bounce rate near 18% fleet-wide, STOP.**
> Do not proceed to configure a launch that should not happen. Finish item 2
> (#193) because it is needed either way, then report and hold. Everything else
> can wait for Greg.

Otherwise: do not stop for permission. If something is unsafe to change, say so
in the report and move on rather than halting the whole run.

**Order matters. Item 1 first — it decides whether today happens at all.**

---

## 1. COUNT THE BOUNCES PROPERLY — no deploy needed

**426 NDR-shaped messages are already stored in `InboundMailboxMessage`.** They
do not need the classifier deployed to be counted. Read-only query, same care as
the production report — SELECT only, credential never logged or written.

Separate **genuine hard bounces** (mailbox does not exist, domain does not exist,
permanent rejection) from **everything else** (out-of-office, auto-reply, mailbox
full, greylisting, vacation responders, non-outreach mail).

Report:

- Genuine hard bounces as a count and as a **percentage of sends in that period**.
  217 NDR-shaped against 1,223 June sends is ~18% — establish how much is real.
- The same split for July and August.
- **Whether one client or one list carries most of them.** This is the most
  decision-relevant cut: a fleet-wide 18% stops today; one rotten list is a much
  smaller conversation and everyone else still sends.

**State it plainly for Greg:** under ~5% genuine, send today. Near 18%
fleet-wide, the lists need cleaning and no amount of warm-up or pacing
compensates — that is a data problem, not a software one.

**Do not soften the number to make today work.**

## 2. MERGE #193 AND DEPLOY

Gmail body + the opt-out body starvation. Without it every bounce from today
onward goes unclassified on Gmail mailboxes again — the exact blindness that took
a full day to diagnose. Needed whatever item 1 says.

## 3. GATE THE `/contacts` SEND BUTTON

`sendEmailToContact` queues a real prospect send with **no governance check at
all**. Super-admin-only, so mitigated, not safe. New people open this system in
a few hours and that is the button someone presses to see what it does.

Add the governance check (`evaluateSendGovernance`, as the other send paths use),
or disable the control. **Say which you did.** If neither can be done safely,
say so plainly — Greg will tell the team not to touch it for a day.

## 4. THE SENDING POSTURE — recommend, do not assume

From the code and live config, not from memory:

- `MAILBOX_WARMUP_RAMP` — on in production? What may each mailbox send today?
- `MAILBOX_SEND_PACING` — default OFF. **Recommend ON or OFF for today, with
  reasoning.** At 5/day across 45 mailboxes with pacing off, the fleet fires
  ~45 near-simultaneous sends at 07:00 against a Microsoft ceiling of **30 per
  minute**. If you recommend ON, say exactly which setting Greg changes and where.
- Fleet-wide expected volume today, and the date each mailbox reaches 30/day.

## 5. CORRECT F-01 — Greg's own correction

Greg, 2026-08-24: *"we have not received responses with do not contact me, we
have had unsubscribe links clicked, but no one responding, take me off the list."*

His blueprint answer said daily. It was a misunderstanding of the question.

- Correct `answers.frequency` and **F-01** in `.bidlow/BLUEPRINT.json`.
- **Downgrade, do not delete.** Date it, quote him. The starved opt-out scanner
  is a real defect — the day someone does reply asking for removal it would be
  missed — but it is latent, not realised. The fix ships in #193 regardless.
- Add to `defect-classes.json` if not already present: **an artefact answer can
  be confidently wrong, and everything downstream inherits it.** This one
  produced a HIGH finding, a build item, and a compliance argument made to Greg
  twice. Caught only because the answer was written down where he could read it
  back.

## 6. THE UI — consolidate the duplicated navigation

Greg, on a client workspace screen: *"theres tabs above showing brief, mailboxes
etc. below that there are onboarding tabs showing some of the same things? this
needs to be consolidated into one tab list? i need the UI clean."*

He is right. The client workspace shows the same destinations twice:

**Top tab row:** Overview · Brief · Mailboxes · Do-not-contact · Sources · Lists
· Templates · Outreach · Activity

**A second "Workflow" strip below it:** 1 Brief · 2 Mailboxes · 3 Sources ·
4 Suppression · 5 Contacts · 6 Outreach · 7 Activity — each with a status dot.

Two rows of navigation to the same places, **and the names do not even agree**:
"Do-not-contact" vs "Suppression", "Lists" vs "Contacts". Same thing, two names,
on a screen a new operator sees on their first morning.

**What to build:**

- **ONE tab row.** Fold the workflow strip's information — the step number, the
  status dot, the ordering — **into the existing top tabs**, and remove the
  separate strip. Keep "Follow the client setup path" as a one-line hint if it
  still earns its place.
- **One name per destination.** Pick the clearer of each pair and use it
  everywhere — tab, heading, and any copy that refers to it.
- Keep `Overview` as the landing tab.
- **Remove no destination and change no route.** Every page reachable now stays
  reachable at the same URL. This is a navigation-rendering change, nothing more.
- The status dots are the useful part of the workflow strip — do not lose them.
  A new operator needs to see what is done and what is not.

**Safety, because staff meet this at 10:00 and nobody will have seen it:**

- If you cannot do this cleanly and with confidence, **leave it on a branch,
  unmerged, and say so.** A tidy UI is worth less than a familiar working one.
  Items 1–5 must ship regardless; this one may wait for Greg's eyes.
- Screenshot or describe the result in the report so Greg can judge it before
  the team logs in.

---

## The report Greg reads when he wakes up

Lead with these four, in this order, in plain English:

1. **The genuine hard-bounce rate**, and your recommendation: send today, or
   clean lists first. If one list carries it, name the list.
2. **Which flags Greg should set before 10:00**, and exactly where.
3. **What you did about the `/contacts` Send button** — gated, disabled, or
   neither with a warning to pass to the team.
4. **The UI: merged and live, or on a branch awaiting his look.**

Then everything deployed, with the commit on production verified.

Then anything in this document that did not survive contact with the code. I have
been wrong seven times on this project — most recently the jitter claim, the
backup toggle, and a compliance argument built on a blueprint answer that turned
out to be a misunderstanding. Assume an eighth.
